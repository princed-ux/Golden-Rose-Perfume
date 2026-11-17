
BEGIN;

-- Real Golden Rose catalogue and location admin operations.
-- API functions are SECURITY INVOKER and callable by service_role only.
-- User identity is supplied by JWT-verifying Edge Functions, not by the browser.

CREATE FUNCTION public.gr_create_product(
    p_actor_id uuid,
    p_name text,
    p_slug text,
    p_sku text,
    p_price_minor bigint,
    p_brand_name text DEFAULT NULL,
    p_category_name text DEFAULT NULL,
    p_barcode text DEFAULT NULL,
    p_size_ml numeric DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_currency text DEFAULT 'NGN'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_brand_id uuid;
    v_category_id uuid;
    v_product_id uuid;
    v_variant_id uuid;
    v_brand_slug text;
    v_category_slug text;
BEGIN
    IF NOT EXISTS (
       SELECT 1 FROM golden_rose.staff_members
       WHERE user_id = p_actor_id AND status = 'active' AND role IN ('owner','manager')
    ) THEN
       RAISE EXCEPTION 'owner or manager role required' USING ERRCODE = '42501';
    END IF;

    IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 200
       OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR length(p_slug) > 240
       OR p_sku IS NULL OR length(btrim(p_sku)) NOT BETWEEN 2 AND 80
       OR p_price_minor IS NULL OR p_price_minor < 0
       OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
       OR (p_size_ml IS NOT NULL AND p_size_ml <= 0)
       OR (p_barcode IS NOT NULL AND (length(btrim(p_barcode)) < 3 OR length(p_barcode) > 128))
    THEN
       RAISE EXCEPTION 'invalid product input' USING ERRCODE = '22023';
    END IF;

    IF p_brand_name IS NOT NULL AND btrim(p_brand_name) <> '' THEN
       IF length(p_brand_name) > 150 THEN RAISE EXCEPTION 'brand name too long' USING ERRCODE = '22023'; END IF;
       v_brand_slug := trim(both '-' FROM regexp_replace(lower(btrim(p_brand_name)), '[^a-z0-9]+', '-', 'g'));
       IF v_brand_slug = '' THEN RAISE EXCEPTION 'brand name requires Latin letters or digits' USING ERRCODE = '22023'; END IF;
       INSERT INTO golden_rose.brands(name,slug)
       VALUES (btrim(p_brand_name),v_brand_slug) ON CONFLICT(slug) DO NOTHING;
       SELECT id INTO v_brand_id FROM golden_rose.brands WHERE slug=v_brand_slug;
    END IF;

    IF p_category_name IS NOT NULL AND btrim(p_category_name) <> '' THEN
       IF length(p_category_name) > 150 THEN RAISE EXCEPTION 'category name too long' USING ERRCODE = '22023'; END IF;
       v_category_slug := trim(both '-' FROM regexp_replace(lower(btrim(p_category_name)), '[^a-z0-9]+', '-', 'g'));
       IF v_category_slug = '' THEN RAISE EXCEPTION 'category name requires Latin letters or digits' USING ERRCODE = '22023'; END IF;
       INSERT INTO golden_rose.categories(name,slug)
       VALUES(btrim(p_category_name),v_category_slug) ON CONFLICT(slug) DO NOTHING;
       SELECT id INTO v_category_id FROM golden_rose.categories WHERE slug=v_category_slug;
    END IF;

    INSERT INTO golden_rose.products(name,slug,brand_id,category_id,description,is_published)
    VALUES(btrim(p_name),p_slug,v_brand_id,v_category_id,p_description,false)
    RETURNING id INTO v_product_id;

    INSERT INTO golden_rose.product_variants(product_id,sku,barcode,size_ml,price_minor,currency)
    VALUES(v_product_id,btrim(p_sku),nullif(btrim(p_barcode),''),p_size_ml,p_price_minor,p_currency)
    RETURNING id INTO v_variant_id;

    RETURN jsonb_build_object('productId',v_product_id,'variantId',v_variant_id,'published',false);
END;
$$;

CREATE FUNCTION public.gr_create_location(
    p_actor_id uuid,
    p_name text,
    p_code text,
    p_location_type text DEFAULT 'store'
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM golden_rose.staff_members WHERE user_id=p_actor_id
      AND status='active' AND role IN ('owner','manager')
    ) THEN
      RAISE EXCEPTION 'owner or manager role required' USING ERRCODE='42501';
    END IF;
    IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 150
       OR p_code IS NULL OR p_code !~ '^[A-Za-z0-9_-]{2,32}$'
       OR p_location_type IS NULL OR p_location_type NOT IN ('store','stockroom','warehouse')
    THEN
      RAISE EXCEPTION 'invalid location input' USING ERRCODE='22023';
    END IF;
    INSERT INTO golden_rose.locations(name,code,location_type)
    VALUES(btrim(p_name),upper(btrim(p_code)),p_location_type)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE FUNCTION public.gr_inventory_snapshot(
    p_actor_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_items jsonb; v_locations jsonb;
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM golden_rose.staff_members WHERE user_id=p_actor_id AND status='active'
    ) THEN
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
          'available',coalesce(s.on_hand-s.reserved,0)
        ) AS row_data
      FROM golden_rose.product_variants v
      JOIN golden_rose.products p ON p.id=v.product_id
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.categories c ON c.id=p.category_id
      CROSS JOIN golden_rose.locations l
      LEFT JOIN golden_rose.stock_balances s ON s.variant_id=v.id AND s.location_id=l.id
      ORDER BY p.name,v.sku,l.name
      LIMIT LEAST(GREATEST(coalesce(p_limit,50),1),100)
      OFFSET LEAST(GREATEST(coalesce(p_offset,0),0),1000000)
    ) rows;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'type',location_type,'active',is_active) ORDER BY name),'[]'::jsonb)
    INTO v_locations FROM golden_rose.locations;

    RETURN jsonb_build_object('items',v_items,'locations',v_locations);
END;
$$;

CREATE FUNCTION public.gr_public_catalog(
    p_limit integer DEFAULT 30,
    p_offset integer DEFAULT 0,
    p_search text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_items jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(item ORDER BY name),'[]'::jsonb) INTO v_items FROM (
      SELECT p.name,
      jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,
        'brand',b.name,'category',c.name,'description',p.description,
        'variants',coalesce((
          SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'sizeMl',v.size_ml,
            'priceMinor',v.price_minor,'currency',v.currency) ORDER BY v.price_minor)
          FROM golden_rose.product_variants v
          WHERE v.product_id=p.id AND v.is_active=true
        ),'[]'::jsonb)
      ) AS item
      FROM golden_rose.products p
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.categories c ON c.id=p.category_id
      WHERE p.is_active=true AND p.is_published=true
        AND EXISTS (SELECT 1 FROM golden_rose.product_variants v WHERE v.product_id=p.id AND v.is_active=true)
        AND (p_search IS NULL OR p_search='' OR p.name ILIKE '%'||replace(replace(left(p_search,120),'%','\%'),'_','\_')||'%' ESCAPE '\')
      ORDER BY p.name
      LIMIT LEAST(GREATEST(coalesce(p_limit,30),1),100)
      OFFSET LEAST(GREATEST(coalesce(p_offset,0),0),1000000)
    ) items;
    RETURN jsonb_build_object('items',v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.gr_create_product(uuid,text,text,text,bigint,text,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_create_location(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_inventory_snapshot(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_public_catalog(integer,integer,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.gr_create_product(uuid,text,text,text,bigint,text,text,text,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_create_location(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_inventory_snapshot(uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_public_catalog(integer,integer,text) TO service_role;

COMMIT;
