
BEGIN;
CREATE TABLE golden_rose.pos_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sale_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 idempotency_key uuid NOT NULL UNIQUE,
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{32}$'),
 location_id uuid NOT NULL REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
 performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
 tender_method text NOT NULL DEFAULT 'cash' CHECK (tender_method='cash'),
 status text NOT NULL DEFAULT 'completed' CHECK (status='completed'),
 subtotal_minor bigint NOT NULL CHECK (subtotal_minor>0),
 discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor>=0),
 tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor=0),
 total_minor bigint NOT NULL CHECK (total_minor>0),
 tendered_minor bigint NOT NULL CHECK (tendered_minor>0),
 change_minor bigint NOT NULL CHECK (change_minor>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (total_minor=subtotal_minor-discount_minor+tax_minor),
 CHECK (tendered_minor=total_minor+change_minor)
);
CREATE INDEX pos_sales_created_idx ON golden_rose.pos_sales(created_at DESC);
CREATE INDEX pos_sales_location_idx ON golden_rose.pos_sales(location_id,created_at DESC);
CREATE TABLE golden_rose.pos_sale_lines (
 sale_id uuid NOT NULL REFERENCES golden_rose.pos_sales(id) ON DELETE RESTRICT,
 line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 40),
 product_id uuid NOT NULL REFERENCES golden_rose.products(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES golden_rose.product_variants(id) ON DELETE RESTRICT,
 product_name text NOT NULL,
 sku text,
 size_ml numeric,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
 unit_price_minor bigint NOT NULL CHECK (unit_price_minor>0),
 line_subtotal_minor bigint NOT NULL CHECK (line_subtotal_minor>0),
 stock_movement_id uuid NOT NULL UNIQUE REFERENCES golden_rose.stock_movements(id) ON DELETE RESTRICT,
 PRIMARY KEY (sale_id,line_number),
 UNIQUE (sale_id,variant_id),
 CHECK (line_subtotal_minor=unit_price_minor*quantity)
);
ALTER TABLE golden_rose.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.pos_sale_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON golden_rose.pos_sales,golden_rose.pos_sale_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON golden_rose.pos_sales,golden_rose.pos_sale_lines TO service_role;
GRANT USAGE,SELECT ON SEQUENCE golden_rose.pos_sales_sale_number_seq TO service_role;

CREATE FUNCTION public.gr_pos_register(p_actor_id uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $pos$
DECLARE
 v_role text;
 v_location_id uuid;
 v_sale_id uuid;
 v_sale golden_rose.pos_sales%ROWTYPE;
 v_line record;
 v_count integer;
 v_subtotal bigint:=0;
 v_discount bigint:=0;
 v_tender bigint:=0;
 v_total bigint;
 v_hash text;
 v_key uuid;
 v_items jsonb;
 v_movement uuid;
 v_line_no integer:=0;
 v_locations jsonb;
 v_page jsonb;
 v_search text;
 v_offset integer;
 v_limit integer;
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM auth.users WHERE id=p_actor_id AND email_confirmed_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'Verified staff identity required.' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM golden_rose.staff_members
 WHERE user_id=p_actor_id AND status='active' FOR SHARE;
 IF v_role NOT IN ('owner','manager','cashier','sales_staff') OR v_role IS NULL
 THEN RAISE EXCEPTION 'POS access is not permitted for this role.' USING ERRCODE='42501'; END IF;

 IF p_action='catalog' THEN
   v_search:=left(btrim(coalesce(p_payload->>'search','')),100);
   v_offset:=least(greatest(coalesce((p_payload->>'offset')::integer,0),0),1000000);
   v_limit:=least(greatest(coalesce((p_payload->>'limit')::integer,40),1),80);
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',id,'name',name,'code',code,'type',location_type) ORDER BY name,id),'[]'::jsonb)
   INTO v_locations FROM golden_rose.locations
   WHERE is_active AND location_type='store';
   IF p_payload ? 'locationId' AND nullif(p_payload->>'locationId','') IS NOT NULL THEN
     v_location_id:=(p_payload->>'locationId')::uuid;
     IF NOT EXISTS(SELECT 1 FROM golden_rose.locations WHERE id=v_location_id AND is_active AND location_type='store')
       THEN RAISE EXCEPTION 'Select an active store register location.' USING ERRCODE='22023'; END IF;
   ELSE
     SELECT id INTO v_location_id FROM golden_rose.locations WHERE is_active AND location_type='store' ORDER BY name,id LIMIT 1;
   END IF;
   SELECT coalesce(jsonb_agg(item ORDER BY name,sku,id),'[]'::jsonb) INTO v_page
   FROM (
     SELECT v.id,v.sku,p.name,
       jsonb_build_object('id',v.id,'productId',p.id,'name',p.name,'brand',b.name,
         'sku',v.sku,'barcode',v.barcode,'sizeMl',v.size_ml,
         'priceMinor',v.price_minor,'currency',v.currency,
         'available',coalesce(sb.on_hand-sb.reserved,0),
         'imagePath',(SELECT i.storage_path FROM golden_rose.product_images i
           WHERE i.product_id=p.id ORDER BY i.sort_order,i.created_at,i.id LIMIT 1)
       ) AS item
     FROM golden_rose.product_variants v
     JOIN golden_rose.products p ON p.id=v.product_id
     LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
     LEFT JOIN golden_rose.stock_balances sb ON sb.variant_id=v.id AND sb.location_id=v_location_id
     WHERE p.is_active AND v.is_active AND v.currency='NGN' AND v.price_minor>0
       AND v_location_id IS NOT NULL
       AND (v_search='' OR strpos(lower(concat_ws(' ',p.name,b.name,v.sku,v.barcode,v.name)),lower(v_search))>0)
     ORDER BY p.name,v.sku,v.id
     LIMIT v_limit OFFSET v_offset
   ) page;
   RETURN jsonb_build_object('ok',true,'items',v_page,'locations',v_locations,'selectedLocationId',v_location_id,
     'hasMore',jsonb_array_length(v_page)=v_limit);
 ELSIF p_action='receipt' THEN
   v_sale_id:=(p_payload->>'saleId')::uuid;
   IF v_sale_id IS NULL THEN RAISE EXCEPTION 'Sale ID required' USING ERRCODE='22023'; END IF;
   SELECT * INTO v_sale FROM golden_rose.pos_sales WHERE id=v_sale_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found' USING ERRCODE='P0002'; END IF;
   RETURN jsonb_build_object('ok',true,'receipt',
     jsonb_build_object('saleId',v_sale.id,'saleNumber',v_sale.sale_number,'createdAt',v_sale.created_at,
     'locationId',v_sale.location_id,
     'locationName',(SELECT name FROM golden_rose.locations WHERE id=v_sale.location_id),
     'cashierId',v_sale.performed_by,'currency','NGN','method',v_sale.tender_method,
     'subtotalMinor',v_sale.subtotal_minor,'discountMinor',v_sale.discount_minor,
     'taxMinor',v_sale.tax_minor,'totalMinor',v_sale.total_minor,
     'tenderedMinor',v_sale.tendered_minor,'changeMinor',v_sale.change_minor,
     'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
       'variantId',variant_id,'name',product_name,'sku',sku,'sizeMl',size_ml,
       'quantity',quantity,'unitPriceMinor',unit_price_minor,'lineTotalMinor',line_subtotal_minor)
       ORDER BY line_number),'[]'::jsonb)
      FROM golden_rose.pos_sale_lines WHERE sale_id=v_sale.id)));
 ELSIF p_action <> 'checkout' THEN
   RAISE EXCEPTION 'Unknown register action' USING ERRCODE='22023';
 END IF;

 IF coalesce(jsonb_typeof(p_payload->'items'),'') <> 'array'
    OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 40
 THEN RAISE EXCEPTION 'Select 1–40 distinct products' USING ERRCODE='22023'; END IF;
 IF coalesce(p_payload->>'method','') <> 'cash'
 THEN RAISE EXCEPTION 'Only confirmed cash tender is supported at this register.' USING ERRCODE='22023'; END IF;
 IF coalesce(p_payload->>'idempotencyKey','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'Invalid transaction ID' USING ERRCODE='22023'; END IF;
 v_key:=(p_payload->>'idempotencyKey')::uuid;
 IF coalesce(p_payload->>'discountMinor','') !~ '^[0-9]{1,12}$'
    OR coalesce(p_payload->>'tenderedMinor','') !~ '^[0-9]{1,13}$'
 THEN RAISE EXCEPTION 'Enter valid discount and tender amounts' USING ERRCODE='22023'; END IF;
 v_discount:=(p_payload->>'discountMinor')::bigint;
 v_tender:=(p_payload->>'tenderedMinor')::bigint;
 v_location_id:=(p_payload->>'locationId')::uuid;
 IF v_location_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM golden_rose.locations WHERE id=v_location_id AND is_active AND location_type='store'
 ) THEN RAISE EXCEPTION 'An active store location is required' USING ERRCODE='22023'; END IF;

 SELECT count(*),count(DISTINCT x."variantId") INTO v_count,v_line_no
 FROM jsonb_to_recordset(p_payload->'items') AS x("variantId" uuid,quantity integer);
 IF v_count<>v_line_no OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_payload->'items') AS x("variantId" uuid,quantity integer)
    WHERE x."variantId" IS NULL OR x.quantity IS NULL OR x.quantity NOT BETWEEN 1 AND 100
 ) THEN RAISE EXCEPTION 'Invalid or repeated product lines' USING ERRCODE='22023'; END IF;

 SELECT jsonb_agg(jsonb_build_object('variantId',x."variantId",'quantity',x.quantity) ORDER BY x."variantId")
 INTO v_items FROM jsonb_to_recordset(p_payload->'items') AS x("variantId" uuid,quantity integer);
 v_hash:=md5(jsonb_build_object('locationId',v_location_id,'items',v_items,
   'discountMinor',v_discount,'tenderedMinor',v_tender,'method','cash')::text);

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('golden_rose_pos:'||v_key::text,0));
 SELECT * INTO v_sale FROM golden_rose.pos_sales WHERE idempotency_key=v_key;
 IF FOUND THEN
   IF v_sale.request_hash<>v_hash OR v_sale.performed_by<>p_actor_id
   THEN RAISE EXCEPTION 'Transaction ID already used for another sale.' USING ERRCODE='22023'; END IF;
   RETURN public.gr_pos_register(p_actor_id,'receipt',jsonb_build_object('saleId',v_sale.id));
 END IF;

 FOR v_line IN SELECT v.id AS variant_id,v.product_id,v.price_minor,v.currency,
                   p.name,p.is_active AS product_active,v.is_active AS variant_active,
                   input.quantity
     FROM jsonb_to_recordset(p_payload->'items') AS input("variantId" uuid,quantity integer)
     LEFT JOIN golden_rose.product_variants v ON v.id=input."variantId"
     LEFT JOIN golden_rose.products p ON p.id=v.product_id
     ORDER BY input."variantId"
 LOOP
   IF v_line.variant_id IS NULL OR NOT coalesce(v_line.product_active,false)
       OR NOT coalesce(v_line.variant_active,false) OR v_line.currency<>'NGN'
       OR v_line.price_minor IS NULL OR v_line.price_minor<=0
       OR v_line.price_minor>100000000000
   THEN RAISE EXCEPTION 'A selected product is unavailable or has no valid price.' USING ERRCODE='22023'; END IF;
   v_subtotal:=v_subtotal+v_line.quantity*v_line.price_minor;
   IF v_subtotal>1000000000000 THEN RAISE EXCEPTION 'Sale exceeds maximum amount' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF v_discount>v_subtotal* (CASE WHEN v_role IN ('owner','manager') THEN 30 ELSE 10 END)/100
 THEN RAISE EXCEPTION 'Discount exceeds allowed register limit' USING ERRCODE='22023'; END IF;
 v_total:=v_subtotal-v_discount;
 IF v_tender<v_total OR v_tender>10000000000000
 THEN RAISE EXCEPTION 'Cash tender is less than the sale total or exceeds the limit' USING ERRCODE='22023'; END IF;

 INSERT INTO golden_rose.pos_sales
 (idempotency_key,request_hash,location_id,performed_by,subtotal_minor,
  discount_minor,tax_minor,total_minor,tendered_minor,change_minor)
 VALUES(v_key,v_hash,v_location_id,p_actor_id,v_subtotal,v_discount,0,v_total,v_tender,v_tender-v_total)
 RETURNING * INTO v_sale;

 v_line_no:=0;
 FOR v_line IN
   SELECT v.id AS variant_id,v.product_id,v.sku,v.size_ml,v.price_minor,p.name,input.quantity
   FROM jsonb_to_recordset(p_payload->'items') AS input("variantId" uuid,quantity integer)
   JOIN golden_rose.product_variants v ON v.id=input."variantId"
   JOIN golden_rose.products p ON p.id=v.product_id
   ORDER BY input."variantId"
 LOOP
   v_line_no:=v_line_no+1;
   v_movement:=public.gr_sell_stock(p_actor_id,v_line.variant_id,v_location_id,v_line.quantity,
     'grpos:'||v_sale.id::text||':'||v_line.variant_id::text,'pos_sale',v_sale.id::text);
   INSERT INTO golden_rose.pos_sale_lines(
     sale_id,line_number,product_id,variant_id,product_name,sku,size_ml,
     quantity,unit_price_minor,line_subtotal_minor,stock_movement_id)
   VALUES(v_sale.id,v_line_no,v_line.product_id,v_line.variant_id,v_line.name,v_line.sku,
     v_line.size_ml,v_line.quantity,v_line.price_minor,
     v_line.quantity*v_line.price_minor,v_movement);
 END LOOP;
 RETURN public.gr_pos_register(p_actor_id,'receipt',jsonb_build_object('saleId',v_sale.id));
END;
$pos$;

REVOKE ALL ON FUNCTION public.gr_pos_register(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_pos_register(uuid,text,jsonb) TO service_role;
COMMIT;