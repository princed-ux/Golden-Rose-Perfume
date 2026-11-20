
BEGIN;

CREATE TABLE golden_rose_finance.odoo_sale_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash text NOT NULL UNIQUE
    CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  filename text NOT NULL
    CHECK (length(filename) BETWEEN 1 AND 160),
  row_count integer NOT NULL
    CHECK (row_count BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status = 'staged'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE golden_rose_finance.odoo_sale_import_lines (
  batch_id uuid NOT NULL
    REFERENCES golden_rose_finance.odoo_sale_import_batches(id)
    ON DELETE RESTRICT,
  row_number integer NOT NULL
    CHECK (row_number BETWEEN 2 AND 1001),
  source_line_id text NOT NULL UNIQUE
    CHECK (length(source_line_id) BETWEEN 1 AND 100),
  source_order_id text NOT NULL
    CHECK (length(source_order_id) BETWEEN 1 AND 100),
  sale_date date NOT NULL,
  sku text NOT NULL
    CHECK (length(sku) BETWEEN 1 AND 100),
  variant_id uuid
    REFERENCES golden_rose.product_variants(id)
    ON DELETE RESTRICT,
  quantity numeric(14, 3) NOT NULL
    CHECK (quantity > 0 AND quantity <= 100000000),
  unit_price_minor bigint NOT NULL
    CHECK (
      unit_price_minor BETWEEN 0 AND 900000000000000
    ),
  line_total_minor bigint NOT NULL
    CHECK (
      line_total_minor BETWEEN 0 AND 900000000000000
    ),
  source_unit_cost_minor bigint
    CHECK (
      source_unit_cost_minor
      BETWEEN 0 AND 900000000000000
    ),
  order_state text NOT NULL
    CHECK (length(order_state) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (batch_id, row_number)
);

CREATE INDEX gr_odoo_sales_batch_fk
ON golden_rose_finance.odoo_sale_import_lines (
  batch_id
);

CREATE INDEX gr_odoo_sales_variant_date
ON golden_rose_finance.odoo_sale_import_lines (
  variant_id,
  sale_date
);

ALTER TABLE golden_rose_finance.odoo_sale_import_batches
ENABLE ROW LEVEL SECURITY;

ALTER TABLE golden_rose_finance.odoo_sale_import_lines
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  golden_rose_finance.odoo_sale_import_batches,
  golden_rose_finance.odoo_sale_import_lines
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.gr_odoo_sales_staging(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_session_text text := auth.jwt()->>'session_id';
  v_session uuid;
  v_allowed boolean;
  v_hash text;
  v_filename text;
  v_items jsonb;
  v_item jsonb;
  v_batch uuid;
  v_row integer;
  v_variant uuid;
  v_variant_count integer;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_total integer;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL
    OR coalesce(v_session_text, '') !~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN
    RAISE EXCEPTION 'Verified owner login required'
      USING ERRCODE = '42501';
  END IF;

  v_session := v_session_text::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions
    WHERE id = v_session
      AND user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Owner session expired'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM golden_rose.staff_members s
    JOIN auth.users u
      ON u.id = s.user_id
    WHERE s.user_id = v_actor
      AND s.role = 'owner'
      AND s.status = 'active'
      AND s.revoked_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
      AND (
        u.banned_until IS NULL
        OR u.banned_until <= now()
      )
  ) THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = '42501';
  END IF;

  SELECT public.gr_employee_session_allowed(
    v_actor,
    v_session
  )
  INTO v_allowed;

  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Owner session security check failed'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 1500000
  THEN
    RAISE EXCEPTION 'Invalid import request size'
      USING ERRCODE = '22023';
  END IF;

  IF p_action = 'list' THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'filename', b.filename,
          'rowCount', b.row_count,
          'matched', coalesce(s.matched, 0),
          'unmatched', coalesce(s.unmatched, 0),
          'createdAt', b.created_at,
          'status', b.status
        )
        ORDER BY b.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM (
      SELECT *
      FROM golden_rose_finance.odoo_sale_import_batches
      ORDER BY created_at DESC
      LIMIT 20
    ) b
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (
          WHERE variant_id IS NOT NULL
        ) AS matched,
        count(*) FILTER (
          WHERE variant_id IS NULL
        ) AS unmatched
      FROM golden_rose_finance.odoo_sale_import_lines l
      WHERE l.batch_id = b.id
    ) s ON true;

    RETURN jsonb_build_object(
      'batches',
      v_result
    );
  END IF;

  IF p_action <> 'stage' THEN
    RAISE EXCEPTION 'Unsupported import operation'
      USING ERRCODE = '22023';
  END IF;

  v_hash := coalesce(p_payload->>'hash', '');
  v_filename := coalesce(p_payload->>'filename', '');
  v_items := p_payload->'rows';

  IF v_hash !~ '^[a-f0-9]{64}$'
    OR length(v_filename) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(v_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 1000
  THEN
    RAISE EXCEPTION 'Invalid historical sales file'
      USING ERRCODE = '22023';
  END IF;

  v_total := jsonb_array_length(v_items);

  INSERT INTO golden_rose_finance.odoo_sale_import_batches (
    source_hash,
    filename,
    row_count,
    created_by
  )
  VALUES (
    v_hash,
    v_filename,
    v_total,
    v_actor
  )
  ON CONFLICT (source_hash) DO NOTHING
  RETURNING id INTO v_batch;

  IF v_batch IS NULL THEN
    SELECT id
    INTO v_batch
    FROM golden_rose_finance.odoo_sale_import_batches
    WHERE source_hash = v_hash;

    RETURN jsonb_build_object(
      'ok', true,
      'id', v_batch,
      'alreadyStaged', true
    );
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR coalesce(v_item->>'rowNumber', '')
        !~ '^[0-9]{1,4}$'
      OR length(coalesce(v_item->>'lineId', ''))
        NOT BETWEEN 1 AND 100
      OR length(coalesce(v_item->>'orderId', ''))
        NOT BETWEEN 1 AND 100
      OR length(coalesce(v_item->>'sku', ''))
        NOT BETWEEN 1 AND 100
      OR length(coalesce(v_item->>'state', ''))
        NOT BETWEEN 1 AND 40
      OR coalesce(v_item->>'quantity', '')
        !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$'
      OR coalesce(v_item->>'unitPriceMinor', '')
        !~ '^[0-9]{1,15}$'
      OR coalesce(v_item->>'lineTotalMinor', '')
        !~ '^[0-9]{1,15}$'
      OR (
        v_item->>'unitCostMinor' IS NOT NULL
        AND (v_item->>'unitCostMinor')
          !~ '^[0-9]{1,15}$'
      )
      OR coalesce(v_item->>'saleDate', '')
        !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION 'Invalid historical sale line'
        USING ERRCODE = '22023';
    END IF;

    v_row := (v_item->>'rowNumber')::integer;

    IF v_row NOT BETWEEN 2 AND 1001
      OR (v_item->>'quantity')::numeric <= 0
      OR (v_item->>'unitPriceMinor')::bigint
        > 900000000000000
      OR (v_item->>'lineTotalMinor')::bigint
        > 900000000000000
      OR (v_item->>'unitCostMinor')::bigint
        > 900000000000000
    THEN
      RAISE EXCEPTION 'Out-of-range historical sale line'
        USING ERRCODE = '22023';
    END IF;

    SELECT
      count(*),
      min(v.id::text)::uuid
    INTO
      v_variant_count,
      v_variant
    FROM golden_rose.product_variants v
    WHERE lower(v.sku) = lower(
      btrim(v_item->>'sku')
    );

    IF v_variant_count > 1 THEN
      RAISE EXCEPTION
        'Ambiguous SKU in historical data: %',
        left(v_item->>'sku', 100)
        USING ERRCODE = '22023';
    END IF;

    IF v_variant IS NULL THEN
      v_unmatched := v_unmatched + 1;
    ELSE
      v_matched := v_matched + 1;
    END IF;

    INSERT INTO golden_rose_finance.odoo_sale_import_lines (
      batch_id,
      row_number,
      source_line_id,
      source_order_id,
      sale_date,
      sku,
      variant_id,
      quantity,
      unit_price_minor,
      line_total_minor,
      source_unit_cost_minor,
      order_state
    )
    VALUES (
      v_batch,
      v_row,
      btrim(v_item->>'lineId'),
      btrim(v_item->>'orderId'),
      (v_item->>'saleDate')::date,
      btrim(v_item->>'sku'),
      v_variant,
      (v_item->>'quantity')::numeric,
      (v_item->>'unitPriceMinor')::bigint,
      (v_item->>'lineTotalMinor')::bigint,
      (v_item->>'unitCostMinor')::bigint,
      btrim(v_item->>'state')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_batch,
    'rowCount', v_total,
    'matched', v_matched,
    'unmatched', v_unmatched,
    'alreadyStaged', false,
    'postedToRevenue', false,
    'inventoryChanged', false
  );
END;
$fn$;

REVOKE ALL
ON FUNCTION public.gr_odoo_sales_staging(text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.gr_odoo_sales_staging(text, jsonb)
TO authenticated;

COMMIT;
