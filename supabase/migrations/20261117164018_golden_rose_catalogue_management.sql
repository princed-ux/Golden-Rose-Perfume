-- Owner and manager operations on the existing Golden Rose catalogue.
BEGIN;
CREATE SCHEMA golden_rose_catalogue;
REVOKE ALL ON SCHEMA golden_rose_catalogue FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA golden_rose_catalogue TO authenticated;

CREATE TABLE golden_rose_catalogue.changes (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES golden_rose.products(id),
  action text NOT NULL,
  fingerprint bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);
CREATE INDEX catalogue_changes_by_product ON golden_rose_catalogue.changes(product_id,created_at DESC);
ALTER TABLE golden_rose_catalogue.changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON golden_rose_catalogue.changes FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION golden_rose_catalogue.text_field(p_data jsonb,p_key text,p_min integer,p_max integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE field text:=btrim(coalesce(p_data->>p_key,''));
BEGIN
  IF (p_data ? p_key AND jsonb_typeof(p_data->p_key) NOT IN ('string','null'))
    OR length(field) NOT BETWEEN p_min AND p_max
  THEN RAISE EXCEPTION 'Check the % field.',p_key USING ERRCODE='GR422'; END IF;
  RETURN nullif(field,'');
END;
$fn$;

CREATE FUNCTION golden_rose_catalogue.taxonomy(p_type text,p_name text,p_current uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE
  table_name text;
  current_name text;
  item_id uuid;
  item_slug text;
  item_active boolean;
BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  table_name:=CASE p_type WHEN 'brand' THEN 'brands' WHEN 'category' THEN 'categories' END;
  -- Keep the original taxonomy link when editing an imported product.
  IF p_current IS NOT NULL THEN
    EXECUTE format('SELECT name FROM golden_rose.%I WHERE id=$1',table_name) INTO current_name USING p_current;
    IF p_name=current_name THEN RETURN p_current; END IF;
  END IF;
  item_slug:=trim(both '-' FROM regexp_replace(lower(p_name),'[^a-z0-9]+','-','g'));
  IF item_slug='' THEN RAISE EXCEPTION 'The % needs a Latin letter or digit.',p_type USING ERRCODE='GR422'; END IF;
  EXECUTE format('INSERT INTO golden_rose.%I(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING',table_name)
    USING p_name,item_slug;
  EXECUTE format('SELECT id,is_active FROM golden_rose.%I WHERE slug=$1',table_name) INTO item_id,item_active USING item_slug;
  IF item_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Choose an active %.',p_type USING ERRCODE='GR422';
  END IF;
  RETURN item_id;
END;
$fn$;

CREATE FUNCTION golden_rose_catalogue.product_record(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $fn$
  SELECT jsonb_build_object(
    'productId',p.id,'name',p.name,'slug',p.slug,'description',p.description,
    'brand',b.name,'category',c.name,'active',p.is_active,'published',p.is_published,
    'createdAt',p.created_at,'revision',p.updated_at,
    'variants',coalesce((
      SELECT jsonb_agg(jsonb_build_object('variantId',v.id,'name',v.name,'concentration',v.concentration,'sku',v.sku,
        'barcode',v.barcode,'sizeMl',v.size_ml,'priceMinor',v.price_minor,'currency',v.currency,'active',v.is_active)
        ORDER BY v.created_at,v.id)
      FROM golden_rose.product_variants v WHERE v.product_id=p.id
    ),'[]'::jsonb),
    'images',coalesce((
      SELECT jsonb_agg(jsonb_build_object('storagePath',i.storage_path,'altText',i.alt_text) ORDER BY i.sort_order,i.id)
      FROM golden_rose.product_images i WHERE i.product_id=p.id
    ),'[]'::jsonb)
  )
  FROM golden_rose.products p
  LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
  LEFT JOIN golden_rose.categories c ON c.id=p.category_id
  WHERE p.id=p_id;
$fn$;

CREATE FUNCTION golden_rose_catalogue.command(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  actor uuid:=auth.uid();
  session_text text:=auth.jwt()->>'session_id';
  session_id_claim uuid;
  staff_role text;
  eligible boolean;
  product golden_rose.products%ROWTYPE;
  variant golden_rose.product_variants%ROWTYPE;
  prior golden_rose_catalogue.changes%ROWTYPE;
  request_key uuid;
  product_id_input uuid;
  variant_id_input uuid;
  fingerprint bytea;
  product_name text;
  product_slug text;
  product_description text;
  brand_id_input uuid;
  category_id_input uuid;
  variant_name text;
  concentration_name text;
  variant_sku text;
  variant_barcode text;
  variant_size numeric;
  variant_price bigint;
  variant_active boolean:=true;
  next_publication boolean;
  constraint_id text;
  search_term text;
  publication_filter text;
  requested_page integer;
  actual_page integer;
  matched_count integer;
  summary jsonb;
  items jsonb;
BEGIN
  IF actor IS NULL OR coalesce(session_text,'') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Sign in again to use the catalogue.' USING ERRCODE='GR403'; END IF;
  session_id_claim:=session_text::uuid;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id=session_id_claim AND user_id=actor) THEN
    RAISE EXCEPTION 'Your staff session has ended.' USING ERRCODE='GR403';
  END IF;
  SELECT s.role INTO staff_role
    FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=actor AND s.status='active' AND s.revoked_at IS NULL
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<=now())
    FOR SHARE OF s;
  IF staff_role IS NULL OR staff_role NOT IN ('owner','manager','inventory_staff','sales_staff') THEN
    RAISE EXCEPTION 'Your role cannot access product management.' USING ERRCODE='GR403';
  END IF;
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)' INTO eligible USING actor,session_id_claim;
    IF eligible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sign in again after changing your password.' USING ERRCODE='GR403';
    END IF;
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>16000 THEN
    RAISE EXCEPTION 'Invalid catalogue request.' USING ERRCODE='GR422';
  END IF;

  IF p_action='list' THEN
    search_term:=lower(coalesce(golden_rose_catalogue.text_field(p_payload,'search',0,80),''));
    publication_filter:=coalesce(p_payload->>'publication','all');
    IF publication_filter NOT IN ('all','published','draft') OR coalesce(p_payload->>'page','1') !~ '^[1-9][0-9]{0,5}$' THEN
      RAISE EXCEPTION 'Check the catalogue filters.' USING ERRCODE='GR422';
    END IF;
    requested_page:=coalesce((p_payload->>'page')::integer,1);
    SELECT jsonb_build_object('totalProducts',count(*),'publishedProducts',count(*) FILTER(WHERE is_published),
      'draftProducts',count(*) FILTER(WHERE NOT is_published),'barcodedVariants',
      (SELECT count(*) FROM golden_rose.product_variants WHERE barcode IS NOT NULL))
      INTO summary FROM golden_rose.products;
    WITH matches AS (
      SELECT p.id,p.name FROM golden_rose.products p
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.categories c ON c.id=p.category_id
      WHERE (publication_filter='all' OR p.is_published=(publication_filter='published'))
        AND (search_term='' OR strpos(lower(concat_ws(' ',p.name,p.slug,p.description,b.name,c.name)),search_term)>0 OR EXISTS(
          SELECT 1 FROM golden_rose.product_variants v WHERE v.product_id=p.id
            AND strpos(lower(concat_ws(' ',v.sku,v.barcode)),search_term)>0
        ))
    ), totals AS (
      SELECT count(*)::integer AS item_count FROM matches
    ), results AS (
      SELECT id,name FROM matches ORDER BY name,id LIMIT 24 OFFSET
        (SELECT (least(requested_page,greatest(1,(item_count+23)/24))-1)*24 FROM totals)
    )
    SELECT totals.item_count,least(requested_page,greatest(1,(totals.item_count+23)/24)),
      coalesce((SELECT jsonb_agg(golden_rose_catalogue.product_record(id) ORDER BY name,id) FROM results),'[]'::jsonb)
    INTO matched_count,actual_page,items FROM totals;
    RETURN jsonb_build_object('items',items,'total',matched_count,'page',actual_page,
      'pageCount',greatest(1,(matched_count+23)/24),'overview',summary);
  END IF;

  product_id_input:=nullif(p_payload->>'productId','')::uuid;
  IF p_action='get' THEN
    summary:=golden_rose_catalogue.product_record(product_id_input);
    IF summary IS NULL THEN RAISE EXCEPTION 'This product could not be found.' USING ERRCODE='GR404'; END IF;
    RETURN summary;
  END IF;
  IF staff_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'Only owners and managers can change products.' USING ERRCODE='GR403';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('create','details','variant','publication') THEN
    RAISE EXCEPTION 'Unknown catalogue operation.' USING ERRCODE='GR422';
  END IF;
  request_key:=(p_payload->>'requestId')::uuid;
  IF request_key IS NULL THEN RAISE EXCEPTION 'A request identifier is required.' USING ERRCODE='GR422'; END IF;
  fingerprint:=sha256(convert_to(p_action||':'||(p_payload-'requestId')::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||request_key::text, 58231));
  SELECT * INTO prior FROM golden_rose_catalogue.changes c WHERE c.actor_id=actor AND c.request_id=request_key;
  IF FOUND THEN
    IF prior.fingerprint<>fingerprint THEN
      RAISE EXCEPTION 'This request identifier was used for different product details.' USING ERRCODE='GR409';
    END IF;
    RETURN golden_rose_catalogue.product_record(prior.product_id);
  END IF;
  IF p_action<>'create' THEN
    SELECT * INTO product FROM golden_rose.products WHERE id=product_id_input FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This product could not be found.' USING ERRCODE='GR404'; END IF;
    IF product.updated_at IS DISTINCT FROM (p_payload->>'revision')::timestamptz THEN
      RAISE EXCEPTION 'This product changed. Reload it before saving.' USING ERRCODE='GR409';
    END IF;
    IF NOT product.is_active THEN
      RAISE EXCEPTION 'Inactive products are read-only.' USING ERRCODE='GR409';
    END IF;
  END IF;

  IF p_action IN ('create','details') THEN
    product_name:=golden_rose_catalogue.text_field(p_payload,'name',2,200);
    product_slug:=golden_rose_catalogue.text_field(p_payload,'slug',1,240);
    IF product_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'Use lowercase letters, numbers and single hyphens for the URL slug.' USING ERRCODE='GR422';
    END IF;
    product_description:=golden_rose_catalogue.text_field(p_payload,'description',0,5000);
    brand_id_input:=golden_rose_catalogue.taxonomy('brand',
      golden_rose_catalogue.text_field(p_payload,'brandName',CASE WHEN p_action='create' THEN 1 ELSE 0 END,150),product.brand_id);
    category_id_input:=golden_rose_catalogue.taxonomy('category',
      golden_rose_catalogue.text_field(p_payload,'categoryName',CASE WHEN p_action='create' THEN 1 ELSE 0 END,150),product.category_id);
  END IF;

  IF p_action IN ('create','variant') THEN
    variant_id_input:=nullif(p_payload->>'variantId','')::uuid;
    IF p_action='create' AND variant_id_input IS NOT NULL THEN
      RAISE EXCEPTION 'A new product needs a new variant.' USING ERRCODE='GR422';
    END IF;
    IF variant_id_input IS NOT NULL THEN
      SELECT * INTO variant FROM golden_rose.product_variants WHERE id=variant_id_input AND product_id=product_id_input FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'This variant does not belong to the product.' USING ERRCODE='GR404'; END IF;
      IF variant.currency<>'NGN' THEN RAISE EXCEPTION 'This variant has a non-NGN price. Preserve the original currency.' USING ERRCODE='GR409'; END IF;
    END IF;
    variant_name:=golden_rose_catalogue.text_field(p_payload,'variantName',0,150);
    concentration_name:=golden_rose_catalogue.text_field(p_payload,'concentration',0,100);
    variant_sku:=golden_rose_catalogue.text_field(p_payload,'sku',2,80);
    variant_barcode:=golden_rose_catalogue.text_field(p_payload,'barcode',0,128);
    IF variant_barcode IS NOT NULL AND length(variant_barcode)<3 THEN
      RAISE EXCEPTION 'Enter at least three characters for a barcode.' USING ERRCODE='GR422';
    END IF;
    IF coalesce(p_payload->>'priceMinor','') !~ '^[0-9]{1,12}$' OR
      (p_payload->>'priceMinor')::bigint NOT BETWEEN 1 AND 100000000000 THEN
      RAISE EXCEPTION 'Enter a positive NGN selling price within the POS limit.' USING ERRCODE='GR422';
    END IF;
    variant_price:=(p_payload->>'priceMinor')::bigint;
    IF p_payload->>'sizeMl' IS NOT NULL THEN
      IF (p_payload->>'sizeMl') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' OR (p_payload->>'sizeMl')::numeric<=0 THEN
        RAISE EXCEPTION 'Enter a positive bottle size with at most two decimal places.' USING ERRCODE='GR422';
      END IF;
      variant_size:=(p_payload->>'sizeMl')::numeric;
    ELSIF variant_id_input IS NULL OR variant.size_ml IS NOT NULL THEN
      RAISE EXCEPTION 'Enter the bottle size in millilitres.' USING ERRCODE='GR422';
    END IF;
    IF p_action='variant' THEN
      IF coalesce(jsonb_typeof(p_payload->'active'),'')<>'boolean' THEN
        RAISE EXCEPTION 'Select a variant availability.' USING ERRCODE='GR422';
      END IF;
      variant_active:=(p_payload->>'active')::boolean;
    END IF;
  END IF;

  IF p_action='create' THEN
    INSERT INTO golden_rose.products(name,slug,description,brand_id,category_id,is_published)
      VALUES(product_name,product_slug,product_description,brand_id_input,category_id_input,false)
      RETURNING id INTO product_id_input;
  ELSIF p_action='details' THEN
    UPDATE golden_rose.products SET name=product_name,slug=product_slug,description=product_description,
      brand_id=brand_id_input,category_id=category_id_input WHERE id=product_id_input;
  ELSIF p_action='publication' THEN
    IF coalesce(jsonb_typeof(p_payload->'published'),'')<>'boolean' THEN
      RAISE EXCEPTION 'Select a publication status.' USING ERRCODE='GR422';
    END IF;
    next_publication:=(p_payload->>'published')::boolean;
    UPDATE golden_rose.products SET is_published=next_publication WHERE id=product_id_input;
  END IF;

  IF p_action IN ('create','variant') THEN
    IF variant_id_input IS NULL THEN
      INSERT INTO golden_rose.product_variants(product_id,name,concentration,sku,barcode,size_ml,price_minor,currency,is_active)
        VALUES(product_id_input,variant_name,concentration_name,variant_sku,variant_barcode,variant_size,variant_price,'NGN',variant_active);
    ELSE
      UPDATE golden_rose.product_variants SET name=variant_name,concentration=concentration_name,sku=variant_sku,
        barcode=variant_barcode,size_ml=variant_size,price_minor=variant_price,is_active=variant_active,updated_at=clock_timestamp()
        WHERE id=variant_id_input;
    END IF;
  END IF;
  -- Keep a published product purchasable. Variant deactivation preserves stock,
  -- import identities, and historical receipts.
  IF (next_publication IS true OR (p_action='variant' AND product.is_published))
    AND NOT EXISTS (
      SELECT 1 FROM golden_rose.product_variants v WHERE v.product_id=product_id_input
        AND v.is_active AND v.currency='NGN' AND v.price_minor BETWEEN 1 AND 100000000000
    )
  THEN RAISE EXCEPTION 'A published product needs an active variant with a valid NGN price.' USING ERRCODE='GR409'; END IF;

  UPDATE golden_rose.products SET updated_at=clock_timestamp() WHERE id=product_id_input;
  INSERT INTO golden_rose_catalogue.changes(actor_id,request_id,product_id,action,fingerprint)
    VALUES(actor,request_key,product_id_input,p_action,fingerprint);
  RETURN golden_rose_catalogue.product_record(product_id_input);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_id=CONSTRAINT_NAME;
    RAISE EXCEPTION '%' , CASE constraint_id
      WHEN 'variants_sku_unique' THEN 'This SKU already belongs to a variant.'
      WHEN 'variants_barcode_unique' THEN 'This barcode already belongs to a variant.'
      WHEN 'products_slug_key' THEN 'This URL slug already belongs to a product.'
      ELSE 'This product change conflicts with an existing record.'
    END USING ERRCODE='GR409';
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Check the product identifiers, size, price, and revision.' USING ERRCODE='GR422';
END;
$fn$;

CREATE FUNCTION public.gr_manage_catalogue(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
  SELECT golden_rose_catalogue.command(p_action,p_payload);
$fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA golden_rose_catalogue FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gr_manage_catalogue(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION golden_rose_catalogue.command(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gr_manage_catalogue(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
