
-- Golden Rose Perfume: WhatsApp order enquiries.
-- Enquiries are NEVER treated as POS or paid sales.
-- Review and test in a disposable database before production.
-- No stock reservation or payment verification occurs here.

BEGIN;

CREATE TABLE IF NOT EXISTS golden_rose.whatsapp_order_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  reference_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,

  request_key uuid NOT NULL UNIQUE,

  customer_id uuid
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  customer_name text NOT NULL
    CHECK (char_length(customer_name) BETWEEN 1 AND 120),

  customer_phone text NOT NULL
    CHECK (char_length(customer_phone) BETWEEN 7 AND 30),

  customer_phone_digits text
    GENERATED ALWAYS AS (
      regexp_replace(customer_phone, '[^0-9]', '', 'g')
    ) STORED,

  customer_email text
    CHECK (
      customer_email IS NULL
      OR char_length(customer_email) <= 254
    ),

  delivery_details text NOT NULL DEFAULT ''
    CHECK (char_length(delivery_details) <= 240),

  items jsonb NOT NULL
    CHECK (
      jsonb_typeof(items) = 'array'
      AND jsonb_array_length(items) BETWEEN 1 AND 50
    ),

  total_minor bigint NOT NULL
    CHECK (
      total_minor >= 0
      AND total_minor <= 9000000000000000
    ),

  currency text NOT NULL DEFAULT 'NGN'
    CHECK (currency = 'NGN'),

  status text NOT NULL DEFAULT 'prepared'
    CHECK (
      status IN (
        'prepared',
        'contacted',
        'confirmed',
        'cancelled'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  updated_by uuid
    REFERENCES auth.users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS gr_wa_customer_created_idx
  ON golden_rose.whatsapp_order_enquiries (
    customer_id,
    created_at DESC
  )
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gr_wa_status_created_idx
  ON golden_rose.whatsapp_order_enquiries (
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS gr_wa_phone_recent_idx
  ON golden_rose.whatsapp_order_enquiries (
    customer_phone_digits,
    created_at DESC
  );

ALTER TABLE golden_rose.whatsapp_order_enquiries
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
  ON golden_rose.whatsapp_order_enquiries
  FROM PUBLIC, anon, authenticated;

-- No direct customer or staff table permissions.
-- Only the authorized RPC endpoints below expose the records.

CREATE OR REPLACE FUNCTION public.gr_whatsapp_enquiry_create(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_key uuid;
  v_actor uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';

  v_name text;
  v_phone text;
  v_email text;
  v_delivery text;

  v_lines jsonb;
  v_item jsonb;
  v_variant_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_quantity integer;

  v_product record;
  v_items jsonb := '[]'::jsonb;
  v_total bigint := 0;

  v_row golden_rose.whatsapp_order_enquiries%ROWTYPE;
BEGIN
  IF p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR length(p_payload::text) > 20000
  THEN
    RAISE EXCEPTION 'Invalid enquiry.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'requestKey', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Invalid request reference.'
      USING ERRCODE = '22023';
  END IF;

  v_key := (p_payload->>'requestKey')::uuid;

  v_name := trim(coalesce(p_payload->>'name', ''));
  v_phone := trim(coalesce(p_payload->>'phone', ''));
  v_email := nullif(
    lower(trim(coalesce(p_payload->>'email', ''))),
    ''
  );
  v_delivery := trim(coalesce(p_payload->>'delivery', ''));
  v_lines := p_payload->'items';

  IF char_length(v_name) NOT BETWEEN 1 AND 120
    OR char_length(v_phone) NOT BETWEEN 7 AND 30
    OR v_phone !~ '^\+?[0-9 ()-]{7,30}$'
    OR length(
      regexp_replace(v_phone, '\D', '', 'g')
    ) NOT BETWEEN 7 AND 15
    OR (
      v_email IS NOT NULL
      AND (
        length(v_email) > 254
        OR v_email !~
          '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    )
    OR char_length(v_delivery) > 240
    OR jsonb_typeof(v_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'Check customer contact details and items.'
      USING ERRCODE = '22023';
  END IF;

  -- Signed-in customer associations require an active session.
  -- Guest enquiries remain possible without automatic account linking.
  IF v_actor IS NOT NULL AND (
    coalesce(v_session, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS (
      SELECT 1
      FROM auth.sessions s
      WHERE s.id = v_session::uuid
        AND s.user_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION 'Customer session expired.'
      USING ERRCODE = '28000';
  END IF;

  -- A retry of the same request cannot create another enquiry.
  SELECT *
  INTO v_row
  FROM golden_rose.whatsapp_order_enquiries
  WHERE request_key = v_key;

  IF FOUND THEN
    IF v_row.customer_id IS DISTINCT FROM v_actor
      OR v_row.customer_phone <> v_phone
    THEN
      RAISE EXCEPTION 'Request reference already used.'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'reference',
      'GR-WA-' || lpad(v_row.reference_number::text, 7, '0'),
      'totalMinor', v_row.total_minor,
      'status', v_row.status,
      'items', v_row.items
    );
  END IF;

  -- Validate and price every item from the actual live catalogue.
  -- Browser-supplied names, prices and publication states are ignored.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR coalesce(v_item->>'variantId', '') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(v_item->>'quantity', '') !~
        '^(?:[1-9]|1[0-9]|20)$'
    THEN
      RAISE EXCEPTION 'Invalid product selection.'
        USING ERRCODE = '22023';
    END IF;

    v_variant_id := (v_item->>'variantId')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_variant_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Repeated product selection.'
        USING ERRCODE = '22023';
    END IF;

    v_seen := array_append(v_seen, v_variant_id);

    SELECT
      v.id AS variant_id,
      v.sku,
      v.size_ml,
      v.price_minor,
      p.name,
      p.slug
    INTO v_product
    FROM golden_rose.product_variants v
    JOIN golden_rose.products p
      ON p.id = v.product_id
    WHERE v.id = v_variant_id
      AND v.is_active
      AND p.is_active
      AND p.is_published
      AND v.currency = 'NGN';

    IF NOT FOUND OR v_product.price_minor < 0 THEN
      RAISE EXCEPTION
        'One or more selected products are unavailable.'
        USING ERRCODE = '22023';
    END IF;

    IF v_product.price_minor >
        9000000000000000 / v_quantity
      OR v_total >
        9000000000000000 -
        (v_product.price_minor * v_quantity)
    THEN
      RAISE EXCEPTION 'Enquiry total is too large.'
        USING ERRCODE = '22023';
    END IF;

    v_total :=
      v_total + v_product.price_minor * v_quantity;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'variantId', v_variant_id,
        'name', v_product.name,
        'slug', v_product.slug,
        'sku', v_product.sku,
        'sizeMl', v_product.size_ml,
        'priceMinor', v_product.price_minor,
        'quantity', v_quantity
      )
    );
  END LOOP;

  -- Basic guest enquiry throttling by normalized phone number.
  -- Add edge-level bot protection before public production release.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'gr-wa:' ||
      regexp_replace(v_phone, '[^0-9]', '', 'g'),
      0
    )
  );

  IF (
    SELECT count(*)
    FROM golden_rose.whatsapp_order_enquiries
    WHERE customer_phone_digits =
      regexp_replace(v_phone, '[^0-9]', '', 'g')
      AND created_at > now() - interval '1 hour'
  ) >= 8
  OR (
    SELECT count(*)
    FROM golden_rose.whatsapp_order_enquiries
    WHERE customer_phone_digits =
      regexp_replace(v_phone, '[^0-9]', '', 'g')
      AND created_at > now() - interval '1 day'
  ) >= 30
  THEN
    RAISE EXCEPTION
      'Too many requests from this contact. Please contact the store directly.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO golden_rose.whatsapp_order_enquiries (
    request_key,
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    delivery_details,
    items,
    total_minor
  )
  VALUES (
    v_key,
    v_actor,
    v_name,
    v_phone,
    v_email,
    v_delivery,
    v_items,
    v_total
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'reference',
    'GR-WA-' || lpad(v_row.reference_number::text, 7, '0'),
    'totalMinor', v_row.total_minor,
    'status', v_row.status,
    'items', v_row.items
  );
END;
$fn$;

REVOKE ALL
  ON FUNCTION public.gr_whatsapp_enquiry_create(jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.gr_whatsapp_enquiry_create(jsonb)
  TO anon, authenticated;

-- Customers see only enquiries explicitly associated with
-- their authenticated user ID. Email matching is not sufficient.

CREATE OR REPLACE FUNCTION public.gr_whatsapp_enquiry_my(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
BEGIN
  IF v_user IS NULL
    OR coalesce(v_session, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS (
      SELECT 1
      FROM auth.sessions s
      WHERE s.id = v_session::uuid
        AND s.user_id = v_user
    )
  THEN
    RAISE EXCEPTION 'Sign in to view enquiries.'
      USING ERRCODE = '28000';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'items',
      coalesce(
        (
          SELECT jsonb_agg(
            row_value
            ORDER BY created_at DESC, id DESC
          )
          FROM (
            SELECT
              e.created_at,
              e.id,
              jsonb_build_object(
                'reference',
                'GR-WA-' ||
                  lpad(e.reference_number::text, 7, '0'),
                'createdAt', e.created_at,
                'updatedAt', e.updated_at,
                'status', e.status,
                'totalMinor', e.total_minor,
                'currency', e.currency,
                'items', e.items,
                'delivery', e.delivery_details
              ) AS row_value
            FROM golden_rose.whatsapp_order_enquiries e
            WHERE e.customer_id = v_user
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT v_limit
            OFFSET v_offset
          ) page
        ),
        '[]'::jsonb
      ),
      'hasMore',
      (
        SELECT count(*) > v_offset + v_limit
        FROM golden_rose.whatsapp_order_enquiries e
        WHERE e.customer_id = v_user
      )
    )
  );
END;
$fn$;

REVOKE ALL
  ON FUNCTION public.gr_whatsapp_enquiry_my(integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.gr_whatsapp_enquiry_my(integer, integer)
  TO authenticated;

-- Staff permission must be verified by the database,
-- independently of frontend navigation permissions.

CREATE OR REPLACE FUNCTION golden_rose.whatsapp_staff_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';
BEGIN
  IF v_user IS NULL
    OR coalesce(v_session, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM golden_rose.staff_members s
    JOIN auth.users u ON u.id = s.user_id
    WHERE s.user_id = v_user
      AND s.status = 'active'
      AND s.revoked_at IS NULL
      AND s.role IN ('owner', 'manager', 'sales_staff')
      AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false)
      AND (
        u.banned_until IS NULL
        OR u.banned_until <= now()
      )
  )
  AND public.gr_employee_session_allowed(
    v_user, v_session::uuid
  )
  AND public.gr_employee_password_state() = 'none';

EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$fn$;

REVOKE ALL
  ON FUNCTION golden_rose.whatsapp_staff_allowed()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gr_whatsapp_enquiry_staff(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_status text := coalesce(p_status, 'all');
BEGIN
  IF NOT golden_rose.whatsapp_staff_allowed() THEN
    RAISE EXCEPTION 'Staff access is not authorized.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN (
    'all', 'prepared', 'contacted', 'confirmed', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Unknown status filter.'
      USING ERRCODE = '22023';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'items',
      coalesce(
        (
          SELECT jsonb_agg(
            row_value ORDER BY created_at DESC, id DESC
          )
          FROM (
            SELECT
              e.id,
              e.created_at,
              jsonb_build_object(
                'id', e.id,
                'reference',
                  'GR-WA-' ||
                  lpad(e.reference_number::text, 7, '0'),
                'createdAt', e.created_at,
                'updatedAt', e.updated_at,
                'status', e.status,
                'customerName', e.customer_name,
                'phone', e.customer_phone,
                'email', e.customer_email,
                'delivery', e.delivery_details,
                'items', e.items,
                'totalMinor', e.total_minor,
                'currency', e.currency
              ) AS row_value
            FROM golden_rose.whatsapp_order_enquiries e
            WHERE v_status = 'all'
              OR e.status = v_status
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT v_limit OFFSET v_offset
          ) page
        ),
        '[]'::jsonb
      ),
      'hasMore',
      (
        SELECT count(*) > v_offset + v_limit
        FROM golden_rose.whatsapp_order_enquiries e
        WHERE v_status = 'all'
          OR e.status = v_status
      )
    )
  );
END;
$fn$;

REVOKE ALL
  ON FUNCTION public.gr_whatsapp_enquiry_staff(
    integer, integer, text
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.gr_whatsapp_enquiry_staff(
    integer, integer, text
  )
  TO authenticated;

CREATE OR REPLACE FUNCTION public.gr_whatsapp_enquiry_update(
  p_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_row golden_rose.whatsapp_order_enquiries%ROWTYPE;
BEGIN
  IF NOT golden_rose.whatsapp_staff_allowed() THEN
    RAISE EXCEPTION 'Staff access is not authorized.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN (
    'contacted', 'confirmed', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Unsupported enquiry status.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE golden_rose.whatsapp_order_enquiries e
  SET
    status = p_status,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE e.id = p_id
    AND e.status <> p_status
    AND (
      (
        e.status = 'prepared'
        AND p_status IN ('contacted', 'cancelled')
      )
      OR (
        e.status = 'contacted'
        AND p_status IN ('confirmed', 'cancelled')
      )
    )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Enquiry not found or status transition is not allowed.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'reference',
    'GR-WA-' ||
      lpad(v_row.reference_number::text, 7, '0'),
    'status', v_row.status
  );
END;
$fn$;

REVOKE ALL
  ON FUNCTION public.gr_whatsapp_enquiry_update(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.gr_whatsapp_enquiry_update(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
