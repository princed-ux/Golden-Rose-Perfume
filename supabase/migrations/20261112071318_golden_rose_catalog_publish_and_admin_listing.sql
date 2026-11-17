
BEGIN;
CREATE FUNCTION public.gr_set_product_publication(
  p_actor_id uuid, p_product_id uuid, p_publish boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_published boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM golden_rose.staff_members WHERE user_id=p_actor_id AND status='active' AND role IN ('owner','manager')) THEN
     RAISE EXCEPTION 'owner or manager role required' USING ERRCODE='42501';
  END IF;
  IF p_publish IS NULL THEN RAISE EXCEPTION 'publish is required' USING ERRCODE='22023'; END IF;
  UPDATE golden_rose.products SET is_published=p_publish,updated_at=now()
  WHERE id=p_product_id AND is_active=true
   AND (p_publish=false OR EXISTS(
       SELECT 1 FROM golden_rose.product_variants v
       WHERE v.product_id=p_product_id AND v.is_active=true))
  RETURNING is_published INTO v_published;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found or has no active variants' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('productId',p_product_id,'published',v_published);
END;
$$;

CREATE FUNCTION public.gr_admin_products(
  p_actor_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_products jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM golden_rose.staff_members WHERE user_id=p_actor_id AND status='active') THEN
    RAISE EXCEPTION 'active staff role required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(data ORDER BY name),'[]'::jsonb) INTO v_products FROM (
    SELECT p.name, jsonb_build_object(
      'productId',p.id,'name',p.name,'slug',p.slug,'description',p.description,
      'brand',b.name,'category',c.name,'active',p.is_active,'published',p.is_published,
      'variants',coalesce((select jsonb_agg(jsonb_build_object('variantId',v.id,
        'sku',v.sku,'barcode',v.barcode,'sizeMl',v.size_ml,'priceMinor',v.price_minor,
        'currency',v.currency,'active',v.is_active)
        ORDER BY v.created_at) FROM golden_rose.product_variants v WHERE v.product_id=p.id),'[]'::jsonb)
    ) data
    FROM golden_rose.products p
    LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
    LEFT JOIN golden_rose.categories c ON c.id=p.category_id
    ORDER BY p.name
    LIMIT LEAST(GREATEST(coalesce(p_limit,50),1),100)
    OFFSET LEAST(GREATEST(coalesce(p_offset,0),0),1000000)
  ) items;
  RETURN jsonb_build_object('items',v_products);
END;
$$;

REVOKE ALL ON FUNCTION public.gr_set_product_publication(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_admin_products(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_set_product_publication(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_admin_products(uuid,integer,integer) TO service_role;
COMMIT;
