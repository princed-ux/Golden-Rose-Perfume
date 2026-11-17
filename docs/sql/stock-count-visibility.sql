-- Review only. This proposal belongs outside the migration directory until approved.
-- It creates no stock counts or balances and leaves the inventory write APIs intact.
BEGIN;

CREATE TABLE golden_rose.stock_count_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES golden_rose.product_variants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
  on_hand integer NOT NULL CHECK (on_hand >= 0),
  counted_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CHECK (counted_at <= verified_at)
);
CREATE INDEX stock_count_observations_variant_store
  ON golden_rose.stock_count_observations(variant_id, location_id, counted_at DESC, id DESC);
ALTER TABLE golden_rose.stock_count_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON golden_rose.stock_count_observations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON golden_rose.stock_count_observations TO service_role;

CREATE OR REPLACE FUNCTION public.gr_admin_products(p_actor_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_products jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM golden_rose.staff_members WHERE user_id=p_actor_id AND status='active' AND role IN ('owner','manager','inventory_staff','sales_staff')) THEN
    RAISE EXCEPTION 'active staff role required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(data ORDER BY name,id),'[]'::jsonb) INTO v_products FROM (
    SELECT p.name,p.id,jsonb_build_object(
      'productId',p.id,'name',p.name,'slug',p.slug,'description',p.description,
      'brand',b.name,'category',c.name,'active',p.is_active,'published',p.is_published,
      'createdAt',p.created_at,'updatedAt',p.updated_at,
      'variants',coalesce((select jsonb_agg(jsonb_build_object('variantId',v.id,
        'sku',v.sku,'barcode',v.barcode,'sizeMl',v.size_ml,'priceMinor',v.price_minor,
        'currency',v.currency,'active',v.is_active,'createdAt',v.created_at,'updatedAt',v.updated_at)
        ORDER BY v.created_at,v.id) FROM golden_rose.product_variants v WHERE v.product_id=p.id),'[]'::jsonb)
    ) data
    FROM golden_rose.products p
    LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
    LEFT JOIN golden_rose.categories c ON c.id=p.category_id
    ORDER BY p.name,p.id
    LIMIT LEAST(GREATEST(coalesce(p_limit,50),1),100)
    OFFSET LEAST(GREATEST(coalesce(p_offset,0),0),1000000)
  ) items;
  RETURN jsonb_build_object('items',v_products);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gr_inventory_snapshot(p_actor_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_items jsonb; v_locations jsonb; v_role text; v_store uuid;
BEGIN
    SELECT s.role,s.location_id INTO v_role,v_store
    FROM golden_rose.staff_members s WHERE s.user_id=p_actor_id AND s.status='active' FOR SHARE;
    IF v_role IS NULL OR v_role NOT IN ('owner','manager','inventory_staff') THEN
      RAISE EXCEPTION 'active staff role required' USING ERRCODE='42501';
    END IF;

    SELECT coalesce(jsonb_agg(row_data ORDER BY name, sku, location_name),'[]'::jsonb) INTO v_items
    FROM (
      SELECT p.name, v.sku, l.name AS location_name,
        jsonb_build_object(
          'productId',p.id,'variantId',v.id,'name',p.name,
          'brand',b.name,'category',c.name,'sku',v.sku,'barcode',v.barcode,
          'sizeMl',v.size_ml,'priceMinor',v.price_minor,'currency',v.currency,
          'active',p.is_active AND v.is_active,'published',p.is_published,
          'locationId',l.id,'locationName',l.name,
          'onHand',coalesce(s.on_hand,0),'reserved',coalesce(s.reserved,0),
          'available',coalesce(s.on_hand-s.reserved,0),
          'balanceRecorded',s.variant_id IS NOT NULL,
          'countEvidence',CASE
            WHEN count_row.id IS NULL THEN NULL
            WHEN count_row.on_hand=0 AND coalesce(s.on_hand,0)=0
              AND (s.updated_at IS NULL OR s.updated_at<=count_row.counted_at)
              AND NOT EXISTS (
                SELECT 1 FROM golden_rose.stock_movements m
                WHERE m.variant_id=v.id AND m.location_id=l.id AND m.created_at>count_row.counted_at
              ) THEN 'verified-zero'
            ELSE 'observed'
          END
        ) AS row_data
      FROM golden_rose.product_variants v
      JOIN golden_rose.products p ON p.id=v.product_id
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.categories c ON c.id=p.category_id
      CROSS JOIN golden_rose.locations l
      LEFT JOIN golden_rose.stock_balances s ON s.variant_id=v.id AND s.location_id=l.id
      LEFT JOIN LATERAL (
        SELECT o.id,o.on_hand,o.counted_at FROM golden_rose.stock_count_observations o
        WHERE o.variant_id=v.id AND o.location_id=l.id
        ORDER BY o.counted_at DESC,o.id DESC LIMIT 1
      ) count_row ON true
      WHERE v_role='owner' OR (l.id=v_store AND l.is_active)
      ORDER BY p.name,v.sku,l.name,p.id,v.id,l.id
      LIMIT LEAST(GREATEST(coalesce(p_limit,50),1),100)
      OFFSET LEAST(GREATEST(coalesce(p_offset,0),0),1000000)
    ) rows;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'type',location_type,'active',is_active) ORDER BY name),'[]'::jsonb)
    INTO v_locations FROM golden_rose.locations WHERE v_role='owner' OR (id=v_store AND is_active);

    RETURN jsonb_build_object('items',v_items,'locations',v_locations);
END;
$function$;

REVOKE ALL ON FUNCTION public.gr_admin_products(uuid,integer,integer),
  public.gr_inventory_snapshot(uuid,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gr_admin_products(uuid,integer,integer),
  public.gr_inventory_snapshot(uuid,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
