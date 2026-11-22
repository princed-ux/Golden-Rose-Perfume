
-- Golden Rose Perfume: whole-catalogue and whole-location inventory summary.
-- REHEARSE FIRST. Apply through Supabase migration tooling only after approval.
-- Read-only aggregation; does not modify stock, products, sales, or users.
-- The caller must have an active, verified Golden Rose employee session.

BEGIN;

CREATE OR REPLACE FUNCTION public.gr_workspace_inventory_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  session_text text := auth.jwt()->>'session_id';
  session_id uuid;
  staff_role text;
  assigned_location uuid;
  result jsonb;
BEGIN
  IF actor IS NULL OR coalesce(session_text, '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'An active staff session is required.' USING ERRCODE = '42501';
  END IF;

  session_id := session_text::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions session
    WHERE session.id = session_id AND session.user_id = actor
  ) THEN
    RAISE EXCEPTION 'The staff session has expired.' USING ERRCODE = '42501';
  END IF;

  SELECT staff.role, staff.location_id
    INTO staff_role, assigned_location
  FROM golden_rose.staff_members staff
  JOIN auth.users identity ON identity.id = staff.user_id
  WHERE staff.user_id = actor
    AND staff.status = 'active'
    AND staff.revoked_at IS NULL
    AND identity.email_confirmed_at IS NOT NULL
    AND NOT coalesce(identity.is_anonymous, false)
    AND (identity.banned_until IS NULL OR identity.banned_until <= now());

  IF staff_role IS NULL OR staff_role NOT IN ('owner', 'manager', 'inventory_staff') THEN
    RAISE EXCEPTION 'Inventory summary access denied.' USING ERRCODE = '42501';
  END IF;

  IF staff_role <> 'owner' AND assigned_location IS NULL THEN
    RAISE EXCEPTION 'A staff location assignment is required.' USING ERRCODE = '42501';
  END IF;

  IF public.gr_employee_session_allowed(actor, session_id) IS DISTINCT FROM true
     OR public.gr_employee_password_state() IS DISTINCT FROM 'none'
  THEN
    RAISE EXCEPTION 'Staff security verification failed.' USING ERRCODE = '42501';
  END IF;

  -- Count all eligible locations and catalogue rows. No LIMIT/OFFSET.
  -- Whole physical inventory includes inactive variants still held in stock.
  -- Low-stock counts only recorded ACTIVE variant/location pairs.
  -- Absent balances are NOT silently interpreted as verified zero stock.
  WITH
  visible_locations AS (
    SELECT l.id, l.location_type
    FROM golden_rose.locations l
    WHERE l.is_active
      AND (staff_role = 'owner' OR l.id = assigned_location)
  ),
  catalogue AS (
    SELECT count(*)::bigint AS total_products,
           count(*) FILTER (WHERE p.is_active)::bigint AS active_products,
           count(*) FILTER (WHERE p.is_active AND p.is_published)::bigint AS published_products,
           count(*) FILTER (WHERE p.is_active AND NOT p.is_published)::bigint AS draft_products,
           count(*) FILTER (WHERE p.name ILIKE 'QA TEST%')::bigint AS qa_products
    FROM golden_rose.products p
  ),
  active_variants AS (
    SELECT count(*)::bigint AS total
    FROM golden_rose.product_variants v
    JOIN golden_rose.products p ON p.id = v.product_id
    WHERE p.is_active AND v.is_active
  ),
  location_counts AS (
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE location_type = 'store')::bigint AS stores
    FROM visible_locations
  ),
  balances AS (
    SELECT b.on_hand, b.reserved,
           v.cost_minor, v.currency,
           (p.is_active AND v.is_active) AS active_variant
    FROM golden_rose.stock_balances b
    JOIN visible_locations loc ON loc.id = b.location_id
    JOIN golden_rose.product_variants v ON v.id = b.variant_id
    JOIN golden_rose.products p ON p.id = v.product_id
  ),
  totals AS (
    SELECT count(*)::bigint AS recorded_rows,
      count(*) FILTER (WHERE active_variant)::bigint AS active_recorded_rows,
      coalesce(sum(on_hand), 0)::bigint AS physical_on_hand,
      coalesce(sum(reserved), 0)::bigint AS reserved_units,
      coalesce(sum(on_hand - reserved), 0)::bigint AS physical_available,
      coalesce(sum(on_hand) FILTER (WHERE active_variant), 0)::bigint AS active_on_hand,
      count(*) FILTER (WHERE active_variant AND on_hand - reserved BETWEEN 0 AND 5)::bigint AS low_recorded_rows,
      count(*) FILTER (WHERE active_variant AND on_hand - reserved = 0)::bigint AS empty_recorded_rows,
      coalesce(sum(on_hand) FILTER (
        WHERE on_hand > 0 AND (cost_minor IS NULL OR cost_minor < 0 OR currency <> 'NGN')
      ), 0)::bigint AS missing_cost_units,
      coalesce(sum(on_hand * cost_minor::numeric) FILTER (
        WHERE on_hand > 0 AND cost_minor >= 0 AND currency = 'NGN'
      ), 0) AS known_stock_cost_minor
    FROM balances
  )
  SELECT jsonb_build_object(
    'totalProducts', c.total_products,
    'activeProducts', c.active_products,
    'publishedProducts', c.published_products,
    'draftProducts', c.draft_products,
    'qaProducts', c.qa_products,
    'activeVariants', v.total,
    'activeLocations', l.total,
    'activeStores', l.stores,
    'recordedBalanceRows', t.recorded_rows,
    'physicalOnHand', t.physical_on_hand,
    'reservedUnits', t.reserved_units,
    'availableUnits', t.physical_available,
    'activeOnHand', t.active_on_hand,
    'lowRecordedRows', t.low_recorded_rows,
    'emptyRecordedRows', t.empty_recorded_rows,
    'missingBalanceRows', greatest(0::bigint, v.total * l.total - t.active_recorded_rows),
    'missingCostUnits', t.missing_cost_units,
    'stockCostMinor', CASE WHEN t.missing_cost_units = 0
      THEN t.known_stock_cost_minor ELSE NULL END,
    'scope', CASE WHEN staff_role = 'owner' THEN 'all-active-locations' ELSE 'assigned-active-location' END
  ) INTO result
  FROM catalogue c CROSS JOIN active_variants v
       CROSS JOIN location_counts l CROSS JOIN totals t;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.gr_workspace_inventory_summary()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gr_workspace_inventory_summary()
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
