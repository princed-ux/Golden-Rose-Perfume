-- Golden Rose: read-only POS sales history and receipt reprints.
-- Only the verified JWT-backed Edge Function may call the public RPC.
-- This migration does not change sales, payments, inventory, or staff records.
BEGIN;

CREATE FUNCTION golden_rose.sales_history(
  p_actor uuid, p_session uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_role text;
  v_store uuid;
  v_requested_store uuid;
  v_sale golden_rose.pos_sales%ROWTYPE;
  v_items jsonb;
  v_offset integer := 0;
  v_limit integer := 30;
  v_search text;
  v_from date;
  v_to date;
  v_allowed boolean;
  v_has_more boolean;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor
  ) THEN
    RAISE EXCEPTION 'A valid staff session is required.' USING ERRCODE='GR403';
  END IF;

  SELECT s.role,s.location_id INTO v_role,v_store
  FROM golden_rose.staff_members s
  JOIN auth.users u ON u.id=s.user_id
  WHERE s.user_id=p_actor AND s.status='active' AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
    AND (u.banned_until IS NULL OR u.banned_until<=now())
  FOR SHARE OF s;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','sales_staff') THEN
    RAISE EXCEPTION 'Sales history is restricted to authorized staff.' USING ERRCODE='GR403';
  END IF;
  IF v_role<>'owner' AND v_store IS NULL THEN
    RAISE EXCEPTION 'An assigned store is required.' USING ERRCODE='GR403';
  END IF;

  -- After the dedicated-account migration is installed, require its session
  -- revocation/password-rotation check without making this migration dependent on it.
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)'
       INTO v_allowed USING p_actor,p_session;
    IF v_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Your employee session must be renewed.' USING ERRCODE='GR403';
    END IF;
  END IF;

  IF p_action='receipt' THEN
    IF coalesce(p_payload->>'saleId','') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RAISE EXCEPTION 'Invalid sale reference.' USING ERRCODE='22023'; END IF;

    SELECT * INTO v_sale FROM golden_rose.pos_sales
    WHERE id=(p_payload->>'saleId')::uuid
      AND (v_role='owner' OR location_id=v_store);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt not found.' USING ERRCODE='P0002';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'receipt',jsonb_build_object(
        'saleId',v_sale.id,'saleNumber',v_sale.sale_number,
        'createdAt',v_sale.created_at,'locationId',v_sale.location_id,
        'locationName',(SELECT name FROM golden_rose.locations WHERE id=v_sale.location_id),
        'cashierId',v_sale.performed_by,'currency',v_sale.currency,
        'method',v_sale.tender_method,'status',v_sale.status,
        'subtotalMinor',v_sale.subtotal_minor,'discountMinor',v_sale.discount_minor,
        'taxMinor',v_sale.tax_minor,'totalMinor',v_sale.total_minor,
        'tenderedMinor',v_sale.tendered_minor,'changeMinor',v_sale.change_minor,
        'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
          'variantId',variant_id,'name',product_name,'sku',sku,'sizeMl',size_ml,
          'quantity',quantity,'unitPriceMinor',unit_price_minor,
          'lineTotalMinor',line_subtotal_minor) ORDER BY line_number),'[]'::jsonb)
          FROM golden_rose.pos_sale_lines WHERE sale_id=v_sale.id)
      )
    );
  ELSIF p_action<>'list' THEN
    RAISE EXCEPTION 'Unknown history request.' USING ERRCODE='22023';
  END IF;

  IF coalesce(p_payload->>'offset','0') !~ '^[0-9]{1,5}$'
     OR (p_payload->>'offset')::integer > 10000
     OR coalesce(p_payload->>'limit','30') !~ '^[0-9]{1,2}$'
     OR (p_payload->>'limit')::integer NOT BETWEEN 1 AND 50
  THEN RAISE EXCEPTION 'Invalid sales page.' USING ERRCODE='22023'; END IF;
  v_offset := coalesce((p_payload->>'offset')::integer,0);
  v_limit := coalesce((p_payload->>'limit')::integer,30);
  v_search := lower(btrim(coalesce(p_payload->>'search','')));
  IF length(v_search)>100 THEN
    RAISE EXCEPTION 'Search is too long.' USING ERRCODE='22023';
  END IF;
  IF nullif(p_payload->>'from','') IS NOT NULL THEN
    IF (p_payload->>'from') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN RAISE EXCEPTION 'Invalid from date.' USING ERRCODE='22023'; END IF;
    v_from := (p_payload->>'from')::date;
  END IF;
  IF nullif(p_payload->>'to','') IS NOT NULL THEN
    IF (p_payload->>'to') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN RAISE EXCEPTION 'Invalid to date.' USING ERRCODE='22023'; END IF;
    v_to := (p_payload->>'to')::date;
  END IF;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to<v_from
    THEN RAISE EXCEPTION 'End date must not precede start date.' USING ERRCODE='22023'; END IF;

  IF nullif(p_payload->>'locationId','') IS NOT NULL THEN
    IF (p_payload->>'locationId') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RAISE EXCEPTION 'Invalid store selection.' USING ERRCODE='22023'; END IF;
    v_requested_store := (p_payload->>'locationId')::uuid;
  END IF;
  IF v_role<>'owner' AND v_requested_store IS NOT NULL AND v_requested_store<>v_store THEN
    RAISE EXCEPTION 'Sales from another store are restricted.' USING ERRCODE='GR403';
  END IF;

  SELECT coalesce(jsonb_agg(row.item ORDER BY row.created_at DESC,row.sale_number DESC),'[]'::jsonb)
    INTO v_items
  FROM (
    SELECT s.created_at,s.sale_number,jsonb_build_object(
      'saleId',s.id,'saleNumber',s.sale_number,'createdAt',s.created_at,
      'locationId',s.location_id,'locationName',l.name,'cashierId',s.performed_by,
      'currency',s.currency,'method',s.tender_method,'status',s.status,
      'subtotalMinor',s.subtotal_minor,'discountMinor',s.discount_minor,
      'taxMinor',s.tax_minor,'totalMinor',s.total_minor,
      'lineCount',(SELECT count(*) FROM golden_rose.pos_sale_lines WHERE sale_id=s.id),
      'units',(SELECT coalesce(sum(quantity),0) FROM golden_rose.pos_sale_lines WHERE sale_id=s.id)
    ) AS item
    FROM golden_rose.pos_sales s
    JOIN golden_rose.locations l ON l.id=s.location_id
    WHERE (v_role='owner' OR s.location_id=v_store)
      AND (v_requested_store IS NULL OR s.location_id=v_requested_store)
      AND (v_from IS NULL OR s.created_at >= (v_from::timestamp AT TIME ZONE 'Africa/Lagos'))
      AND (v_to IS NULL OR s.created_at < ((v_to+1)::timestamp AT TIME ZONE 'Africa/Lagos'))
      AND (v_search='' OR position(v_search in s.sale_number::text)>0
        OR EXISTS (SELECT 1 FROM golden_rose.pos_sale_lines sl
          WHERE sl.sale_id=s.id AND
          (position(v_search in lower(sl.product_name))>0 OR
            position(v_search in lower(coalesce(sl.sku,'')))>0)))
    ORDER BY s.created_at DESC,s.sale_number DESC
    LIMIT v_limit+1 OFFSET v_offset
  ) row;

  v_has_more:=jsonb_array_length(v_items)>v_limit;
  IF v_has_more THEN v_items:=v_items-v_limit; END IF;
  RETURN jsonb_build_object('ok',true,'items',v_items,'hasMore',v_has_more,
     'offset',v_offset,'limit',v_limit);
END;
$fn$;
REVOKE ALL ON FUNCTION golden_rose.sales_history(uuid,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION golden_rose.sales_history(uuid,uuid,text,jsonb)
  TO service_role;

CREATE FUNCTION public.gr_sales_history(
  p_actor uuid,p_session uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT golden_rose.sales_history(p_actor,p_session,p_action,p_payload);
$fn$;
REVOKE ALL ON FUNCTION public.gr_sales_history(uuid,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gr_sales_history(uuid,uuid,text,jsonb)
  TO service_role;
COMMIT;
