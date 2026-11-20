
BEGIN;

CREATE TABLE IF NOT EXISTS golden_rose_ops.variant_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL
    REFERENCES golden_rose.product_variants(id)
    ON DELETE RESTRICT,
  unit_name text NOT NULL,
  units_per_package integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gr_package_name_valid CHECK (
    unit_name = lower(btrim(unit_name))
    AND unit_name ~ '^[a-z][a-z0-9 -]{1,31}$'
  ),

  CONSTRAINT gr_package_quantity_valid CHECK (
    units_per_package BETWEEN 2 AND 100000
  ),

  CONSTRAINT gr_package_variant_unit_unique UNIQUE (
    variant_id, unit_name
  )
);

CREATE INDEX IF NOT EXISTS gr_packages_variant_idx
ON golden_rose_ops.variant_packages (variant_id);

ALTER TABLE golden_rose_ops.variant_packages
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON golden_rose_ops.variant_packages
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gr_packaging(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_session_text text := auth.jwt()->>'session_id';
  v_session uuid;
  v_role text;
  v_location uuid;
  v_allowed boolean;
  v_variant uuid;
  v_id uuid;
  v_name text;
  v_quantity integer;
  v_search text;
  v_items jsonb;
BEGIN
  IF v_actor IS NULL
    OR coalesce(v_session_text, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Active staff session required'
      USING ERRCODE = '42501';
  END IF;

  v_session := v_session_text::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions
    WHERE id = v_session
      AND user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Staff session expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT staff.role, staff.location_id
  INTO v_role, v_location
  FROM golden_rose.staff_members staff
  JOIN auth.users usr ON usr.id = staff.user_id
  WHERE staff.user_id = v_actor
    AND staff.status = 'active'
    AND staff.revoked_at IS NULL
    AND usr.email_confirmed_at IS NOT NULL
    AND (
      usr.banned_until IS NULL
      OR usr.banned_until <= now()
    );

  IF v_role IS NULL
    OR v_role NOT IN (
      'owner', 'manager', 'inventory_staff'
    )
  THEN
    RAISE EXCEPTION 'Packaging access denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'owner' AND (
    v_location IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM golden_rose.locations loc
      WHERE loc.id = v_location
        AND loc.is_active
    )
  ) THEN
    RAISE EXCEPTION 'Active location required'
      USING ERRCODE = '42501';
  END IF;

  SELECT public.gr_employee_session_allowed(
    v_actor, v_session
  )
  INTO v_allowed;

  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Staff verification failed'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 4000
  THEN
    RAISE EXCEPTION 'Invalid request'
      USING ERRCODE = '22023';
  END IF;

  IF p_action = 'list' THEN
    v_search := lower(
      btrim(coalesce(p_payload->>'search', ''))
    );

    IF length(v_search) > 80 THEN
      RAISE EXCEPTION 'Search text too long'
        USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'sku', item.sku,
          'name', item.name,
          'sizeMl', item.size_ml,
          'packages', (
            SELECT coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', pkg.id,
                  'unitName', pkg.unit_name,
                  'unitsPerPackage',
                    pkg.units_per_package,
                  'active', pkg.active
                )
                ORDER BY pkg.unit_name
              ),
              '[]'::jsonb
            )
            FROM golden_rose_ops.variant_packages pkg
            WHERE pkg.variant_id = item.id
          )
        )
        ORDER BY item.sku, item.id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM (
      SELECT
        variant.id,
        variant.sku,
        product.name,
        variant.size_ml
      FROM golden_rose.product_variants variant
      JOIN golden_rose.products product
        ON product.id = variant.product_id
      WHERE variant.is_active
        AND product.is_active
        AND variant.sku IS NOT NULL
        AND (
          v_search = ''
          OR lower(variant.sku) LIKE
            '%' || v_search || '%'
          OR lower(product.name) LIKE
            '%' || v_search || '%'
        )
      ORDER BY variant.sku, variant.id
      LIMIT 25
    ) item;

    RETURN jsonb_build_object(
      'items', v_items,
      'canManage', v_role IN ('owner', 'manager')
    );
  END IF;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Manager permission required'
      USING ERRCODE = '42501';
  END IF;

  IF p_action = 'save' THEN
    v_name := lower(
      btrim(coalesce(p_payload->>'unitName', ''))
    );

    IF v_name !~ '^[a-z][a-z0-9 -]{1,31}$'
      OR v_name IN (
        'each', 'piece', 'unit',
        'bottle', 'ml', 'gram', 'kg'
      )
    THEN
      RAISE EXCEPTION 'Invalid package name'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(
      p_payload->>'unitsPerPackage', ''
    ) !~ '^[1-9][0-9]{0,5}$' THEN
      RAISE EXCEPTION 'Invalid package quantity'
        USING ERRCODE = '22023';
    END IF;

    v_quantity :=
      (p_payload->>'unitsPerPackage')::integer;

    IF v_quantity NOT BETWEEN 2 AND 100000 THEN
      RAISE EXCEPTION 'Package quantity out of range'
        USING ERRCODE = '22023';
    END IF;

    v_variant := (p_payload->>'variantId')::uuid;

    PERFORM 1
    FROM golden_rose.product_variants variant
    JOIN golden_rose.products product
      ON product.id = variant.product_id
    WHERE variant.id = v_variant
      AND variant.is_active
      AND product.is_active
    FOR SHARE OF variant, product;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active product SKU not found'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO golden_rose_ops.variant_packages (
      variant_id,
      unit_name,
      units_per_package,
      active,
      created_by,
      updated_by
    )
    VALUES (
      v_variant,
      v_name,
      v_quantity,
      true,
      v_actor,
      v_actor
    )
    ON CONFLICT (variant_id, unit_name)
    DO UPDATE SET
      units_per_package = EXCLUDED.units_per_package,
      active = true,
      updated_by = v_actor,
      updated_at = now()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
      'ok', true,
      'id', v_id
    );
  END IF;

  IF p_action = 'deactivate' THEN
    v_id := (p_payload->>'id')::uuid;

    UPDATE golden_rose_ops.variant_packages
    SET
      active = false,
      updated_by = v_actor,
      updated_at = now()
    WHERE id = v_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active package not found'
        USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'id', v_id
    );
  END IF;

  RAISE EXCEPTION 'Unsupported packaging action'
    USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION public.gr_packaging(text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.gr_packaging(text, jsonb)
TO authenticated;

COMMIT;
