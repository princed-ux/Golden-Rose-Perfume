
BEGIN;

CREATE SCHEMA IF NOT EXISTS golden_rose_finance;

REVOKE ALL ON SCHEMA golden_rose_finance
FROM PUBLIC, anon, authenticated;

CREATE TABLE golden_rose_finance.pos_line_cost_snapshots (
  sale_id uuid NOT NULL,
  line_number integer NOT NULL,
  variant_id uuid NOT NULL
    REFERENCES golden_rose.product_variants(id)
    ON DELETE RESTRICT,
  quantity integer NOT NULL
    CHECK (quantity BETWEEN 1 AND 100),
  catalogue_unit_cost_minor bigint
    CHECK (catalogue_unit_cost_minor >= 0),
  source text NOT NULL
    CHECK (source IN (
      'catalogue_cost_at_sale',
      'catalogue_cost_missing'
    )),
  captured_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (sale_id, line_number),

  FOREIGN KEY (sale_id, line_number)
    REFERENCES golden_rose.pos_sale_lines(
      sale_id, line_number
    )
    ON DELETE RESTRICT,

  CONSTRAINT gr_cost_source_consistency CHECK (
    (
      source = 'catalogue_cost_at_sale'
      AND catalogue_unit_cost_minor IS NOT NULL
    )
    OR (
      source = 'catalogue_cost_missing'
      AND catalogue_unit_cost_minor IS NULL
    )
  )
);

CREATE INDEX gr_cost_snapshots_variant_idx
ON golden_rose_finance.pos_line_cost_snapshots (
  variant_id, captured_at
);

ALTER TABLE golden_rose_finance.pos_line_cost_snapshots
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON golden_rose_finance.pos_line_cost_snapshots
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION golden_rose_finance.snapshot_pos_line_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_cost bigint;
BEGIN
  SELECT v.cost_minor
  INTO STRICT v_cost
  FROM golden_rose.product_variants v
  WHERE v.id = NEW.variant_id
  FOR SHARE;

  INSERT INTO golden_rose_finance.pos_line_cost_snapshots (
    sale_id,
    line_number,
    variant_id,
    quantity,
    catalogue_unit_cost_minor,
    source
  )
  VALUES (
    NEW.sale_id,
    NEW.line_number,
    NEW.variant_id,
    NEW.quantity,
    v_cost,
    CASE
      WHEN v_cost IS NULL
        THEN 'catalogue_cost_missing'
      ELSE 'catalogue_cost_at_sale'
    END
  );

  RETURN NEW;
END;
$fn$;

REVOKE ALL
ON FUNCTION golden_rose_finance.snapshot_pos_line_cost()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER gr_capture_pos_line_cost
AFTER INSERT ON golden_rose.pos_sale_lines
FOR EACH ROW
EXECUTE FUNCTION
  golden_rose_finance.snapshot_pos_line_cost();

CREATE FUNCTION golden_rose_finance.prevent_cost_snapshot_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION
    'Cost snapshots are immutable; use an audited correction process'
    USING ERRCODE = '42501';
END;
$fn$;

REVOKE ALL
ON FUNCTION golden_rose_finance.prevent_cost_snapshot_changes()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER gr_immutable_pos_cost
BEFORE UPDATE OR DELETE
ON golden_rose_finance.pos_line_cost_snapshots
FOR EACH ROW
EXECUTE FUNCTION
  golden_rose_finance.prevent_cost_snapshot_changes();

CREATE FUNCTION public.gr_pos_cost_coverage(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_auth jsonb;
  v_from date;
  v_to date;
  v_scope uuid;
  v_lines bigint := 0;
  v_covered bigint := 0;
  v_missing bigint := 0;
  v_unit_cost bigint := 0;
  v_qa bigint := 0;
  v_sales bigint := 0;
BEGIN
  v_auth := public.gr_financial_overview(
    p_from,
    p_to,
    p_location_id
  );

  v_from := (v_auth->>'from')::date;
  v_to := (v_auth->>'to')::date;
  v_scope := (v_auth->>'locationId')::uuid;

  SELECT
    count(*)::bigint,

    count(*) FILTER (
      WHERE snap.source = 'catalogue_cost_at_sale'
    )::bigint,

    count(*) FILTER (
      WHERE snap.sale_id IS NULL
         OR snap.source = 'catalogue_cost_missing'
    )::bigint,

    coalesce(
      sum(
        snap.catalogue_unit_cost_minor::bigint
        * sl.quantity
      ) FILTER (
        WHERE snap.source = 'catalogue_cost_at_sale'
      ),
      0
    )::bigint

  INTO
    v_lines,
    v_covered,
    v_missing,
    v_unit_cost

  FROM golden_rose.pos_sale_lines sl

  JOIN golden_rose.pos_sales s
    ON s.id = sl.sale_id

  LEFT JOIN golden_rose_finance.pos_line_cost_snapshots snap
    ON snap.sale_id = sl.sale_id
   AND snap.line_number = sl.line_number
   AND snap.variant_id = sl.variant_id
   AND snap.quantity = sl.quantity

  WHERE s.status = 'completed'
    AND (
      s.created_at AT TIME ZONE 'Africa/Lagos'
    )::date BETWEEN v_from AND v_to
    AND (
      v_scope IS NULL
      OR s.location_id = v_scope
    );

  v_qa := coalesce(
    (v_auth->'sales'->>'qaCodedTransactions')::bigint,
    0
  );

  v_sales := coalesce(
    (v_auth->'sales'->>'totalMinor')::bigint,
    0
  );

  RETURN jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'locationId', v_scope,
    'currency', 'NGN',

    'saleLineCount', v_lines,
    'coveredLineCount', v_covered,
    'missingLineCount', v_missing,

    'provisionalCatalogueCostMinor', v_unit_cost,
    'qaCodedTransactions', v_qa,

    'provisionalGrossMarginMinor',
      CASE
        WHEN v_missing = 0
         AND v_lines > 0
         AND v_qa = 0
          THEN v_sales - v_unit_cost
        ELSE NULL
      END,

    'isAccountingProfit', false,

    'costBasis',
      'Mutable product catalogue cost snapshotted at checkout; not verified supplier acquisition cost',

    'historicalBackfillApplied', false
  );
END;
$fn$;

REVOKE ALL
ON FUNCTION public.gr_pos_cost_coverage(
  date, date, uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.gr_pos_cost_coverage(
  date, date, uuid
)
TO authenticated;

COMMIT;
