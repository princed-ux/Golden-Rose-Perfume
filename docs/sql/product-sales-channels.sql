-- Golden Rose Perfume — product channel foundation.
-- STAGING SCRIPT. Convert to a timestamped migration with the Supabase CLI
-- after reconciling the live migration history. Do not run blindly on production.
-- Existing imported products remain POS-visible and online-unpublished.
BEGIN;

ALTER TABLE golden_rose.products
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN golden_rose.products.pos_enabled IS
  'Owner-controlled POS sales channel. Independent from is_published (public online channel).';

-- Keep the current catalogue result contract intact and expose the extra channel.
CREATE OR REPLACE FUNCTION golden_rose_catalogue.product_record(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $fn$
  SELECT jsonb_build_object(
    'productId',p.id,'name',p.name,'slug',p.slug,'description',p.description,
    'brand',b.name,'category',c.name,'active',p.is_active,
    'published',p.is_published,'posEnabled',p.pos_enabled,
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

-- Reuses the existing product audit/idempotency ledger.
-- An owner/manager must be signed in, verified, active and not suspended.
CREATE FUNCTION golden_rose_catalogue.set_channels(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  actor uuid := auth.uid();
  session_text text := auth.jwt()->>'session_id';
  session_id_claim uuid;
  staff_role text;
  eligible boolean;
  product golden_rose.products%ROWTYPE;
  prior golden_rose_catalogue.changes%ROWTYPE;
  request_key uuid;
  product_id_input uuid;
  fingerprint bytea;
  publish_online boolean;
  sell_in_pos boolean;
BEGIN
  IF actor IS NULL OR coalesce(session_text,'') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Sign in again to manage products.' USING ERRCODE='GR403'; END IF;
  session_id_claim := session_text::uuid;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=session_id_claim AND user_id=actor) THEN
    RAISE EXCEPTION 'Your staff session has ended.' USING ERRCODE='GR403';
  END IF;
  SELECT s.role INTO staff_role
  FROM golden_rose.staff_members s
  JOIN auth.users u ON u.id=s.user_id
  WHERE s.user_id=actor AND s.status='active' AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
    AND (u.banned_until IS NULL OR u.banned_until<=now())
  FOR SHARE OF s;
  IF staff_role NOT IN ('owner','manager') OR staff_role IS NULL THEN
    RAISE EXCEPTION 'Only an active owner or manager can change selling channels.' USING ERRCODE='GR403';
  END IF;
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)'
      INTO eligible USING actor,session_id_claim;
    IF eligible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sign in again after changing your password.' USING ERRCODE='GR403';
    END IF;
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
     OR octet_length(p_payload::text)>16000
     OR coalesce(jsonb_typeof(p_payload->'posEnabled'),'')<>'boolean'
     OR coalesce(jsonb_typeof(p_payload->'published'),'')<>'boolean'
  THEN RAISE EXCEPTION 'Choose valid POS and website selling channels.' USING ERRCODE='GR422'; END IF;

  request_key := nullif(p_payload->>'requestId','')::uuid;
  product_id_input := nullif(p_payload->>'productId','')::uuid;
  IF request_key IS NULL OR product_id_input IS NULL
     OR nullif(p_payload->>'revision','') IS NULL
  THEN RAISE EXCEPTION 'Reload the product and try again.' USING ERRCODE='GR422'; END IF;

  publish_online := (p_payload->>'published')::boolean;
  sell_in_pos := (p_payload->>'posEnabled')::boolean;
  fingerprint := sha256(convert_to('channels:'||(p_payload-'requestId')::text,'UTF8'));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text||request_key::text,58231));

  SELECT * INTO prior FROM golden_rose_catalogue.changes
  WHERE actor_id=actor AND request_id=request_key;
  IF FOUND THEN
    IF prior.fingerprint<>fingerprint OR prior.action<>'channels' THEN
      RAISE EXCEPTION 'This request was already used with different product details.' USING ERRCODE='GR409';
    END IF;
    RETURN golden_rose_catalogue.product_record(prior.product_id);
  END IF;

  SELECT * INTO product FROM golden_rose.products
  WHERE id=product_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.' USING ERRCODE='GR404';
  END IF;
  IF NOT product.is_active THEN
    RAISE EXCEPTION 'Inactive products are read-only.' USING ERRCODE='GR409';
  END IF;
  IF product.updated_at IS DISTINCT FROM (p_payload->>'revision')::timestamptz THEN
    RAISE EXCEPTION 'This product changed. Reload it before saving.' USING ERRCODE='GR409';
  END IF;
  IF publish_online AND NOT EXISTS(
    SELECT 1 FROM golden_rose.product_variants v
    WHERE v.product_id=product_id_input AND v.is_active AND v.currency='NGN'
      AND v.price_minor BETWEEN 1 AND 100000000000
  ) THEN
    RAISE EXCEPTION 'An online product needs an active variant with a valid NGN price.' USING ERRCODE='GR409';
  END IF;

  UPDATE golden_rose.products SET
    pos_enabled=sell_in_pos,
    is_published=publish_online,
    updated_at=clock_timestamp()
  WHERE id=product_id_input;
  INSERT INTO golden_rose_catalogue.changes(
    actor_id,request_id,product_id,action,fingerprint
  ) VALUES(actor,request_key,product_id_input,'channels',fingerprint);
  RETURN golden_rose_catalogue.product_record(product_id_input);
END;
$fn$;

REVOKE ALL ON FUNCTION golden_rose_catalogue.set_channels(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION golden_rose_catalogue.set_channels(jsonb)
  TO authenticated;

-- Preserve all existing catalogue commands while adding 'channels'.
CREATE OR REPLACE FUNCTION public.gr_manage_catalogue(
  p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SET search_path='' AS $fn$
  SELECT CASE
    WHEN p_action='channels' THEN golden_rose_catalogue.set_channels(p_payload)
    ELSE golden_rose_catalogue.command(p_action,p_payload)
  END;
$fn$;

-- Defense in depth: POS cannot record an online-only product.
-- The existing checkout is one database transaction; a rejection rolls back
-- the stock movement and sale together. Historical receipts are unaffected.
CREATE FUNCTION golden_rose_catalogue.enforce_pos_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE allowed boolean;
BEGIN
  SELECT p.pos_enabled AND p.is_active AND v.is_active INTO allowed
  FROM golden_rose.products p
  JOIN golden_rose.product_variants v ON v.product_id=p.id
  WHERE p.id=NEW.product_id AND v.id=NEW.variant_id
  FOR SHARE OF p;
  IF allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This perfume is not available for in-store POS sales.'
      USING ERRCODE='GR409';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION golden_rose_catalogue.enforce_pos_channel()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER golden_rose_pos_channel_guard
BEFORE INSERT ON golden_rose.pos_sale_lines
FOR EACH ROW EXECUTE FUNCTION golden_rose_catalogue.enforce_pos_channel();

-- POS catalogue is filtered BEFORE pagination; no blank pages or
-- leaked online-only products. The existing register authenticates
-- the actor and validates their selected location first.
CREATE FUNCTION golden_rose_catalogue.pos_catalog(
  p_actor_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  base jsonb;
  store uuid;
  search_term text;
  page_limit integer;
  page_offset integer;
  page_items jsonb;
  more_items boolean;
BEGIN
  base := public.gr_pos_register(
    p_actor_id,'catalog',coalesce(p_payload,'{}'::jsonb) ||
    '{"offset":0,"limit":1}'::jsonb
  );
  store := nullif(base->>'selectedLocationId','')::uuid;
  search_term := left(btrim(coalesce(p_payload->>'search','')),100);
  page_limit := least(greatest(coalesce((p_payload->>'limit')::integer,40),1),80);
  page_offset := least(greatest(coalesce((p_payload->>'offset')::integer,0),0),1000000);

  SELECT
    coalesce(jsonb_agg(rows.item ORDER BY rows.name,rows.sku,rows.id)
      FILTER (WHERE rows.rn<=page_limit),'[]'::jsonb),
    count(*)>page_limit
    INTO page_items,more_items
  FROM (
    SELECT row_number() OVER () AS rn, page.*
    FROM (
      SELECT v.id,v.sku,p.name,
        jsonb_build_object(
          'id',v.id,'productId',p.id,'name',p.name,'brand',b.name,
          'sku',v.sku,'barcode',v.barcode,'sizeMl',v.size_ml,
          'priceMinor',v.price_minor,'currency',v.currency,
          'available',coalesce(sb.on_hand-sb.reserved,0),
          'imagePath',(SELECT i.storage_path
            FROM golden_rose.product_images i
            WHERE i.product_id=p.id ORDER BY i.sort_order,i.created_at,i.id LIMIT 1)
        ) AS item
      FROM golden_rose.product_variants v
      JOIN golden_rose.products p ON p.id=v.product_id
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.stock_balances sb
        ON sb.variant_id=v.id AND sb.location_id=store
      WHERE store IS NOT NULL AND p.is_active AND p.pos_enabled
        AND v.is_active AND v.currency='NGN' AND v.price_minor>0
        AND (search_term='' OR strpos(lower(concat_ws(
          ' ',p.name,b.name,v.sku,v.barcode,v.name
        )),lower(search_term))>0)
      ORDER BY p.name,v.sku,v.id
      LIMIT page_limit+1 OFFSET page_offset
    ) AS page
  ) AS rows;

  RETURN jsonb_build_object(
    'ok',true,'items',page_items,'locations',base->'locations',
    'selectedLocationId',base->'selectedLocationId','hasMore',more_items
  );
END;
$fn$;
REVOKE ALL ON FUNCTION golden_rose_catalogue.pos_catalog(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA golden_rose_catalogue TO service_role;
GRANT EXECUTE ON FUNCTION golden_rose_catalogue.pos_catalog(uuid,jsonb)
  TO service_role;

-- Existing session enforcement and checkout price verification are preserved.
CREATE OR REPLACE FUNCTION public.gr_pos_session_request(
  p_actor_id uuid,p_session_id uuid,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  PERFORM golden_rose_employment.lock_staff_session(p_actor_id,p_session_id);
  IF p_action='checkout' THEN
    RETURN public.gr_pos_checked_checkout(p_actor_id,p_payload);
  ELSIF p_action='catalog' THEN
    RETURN golden_rose_catalogue.pos_catalog(p_actor_id,p_payload);
  ELSIF p_action='receipt' THEN
    RETURN public.gr_pos_register(p_actor_id,p_action,p_payload);
  END IF;
  RAISE EXCEPTION 'Unknown register action' USING ERRCODE='22023';
END;
$fn$;


-- Owner-only authentication analytics. These are accounts, not CRM contacts
-- or WhatsApp enquiries; staff and anonymous accounts are excluded.
CREATE FUNCTION golden_rose_catalogue.customer_counts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  actor uuid := auth.uid();
  session_text text := auth.jwt()->>'session_id';
  session_id_claim uuid;
  eligible boolean;
BEGIN
  IF actor IS NULL OR coalesce(session_text,'') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Sign in to view customer analytics.' USING ERRCODE='GR403'; END IF;
  session_id_claim := session_text::uuid;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=session_id_claim AND user_id=actor) THEN
    RAISE EXCEPTION 'Your session has ended.' USING ERRCODE='GR403';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM golden_rose.staff_members s
    JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=actor AND s.role='owner' AND s.status='active'
      AND s.revoked_at IS NULL AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN
    RAISE EXCEPTION 'Only the owner can view customer account analytics.' USING ERRCODE='GR403';
  END IF;
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)' INTO eligible
      USING actor,session_id_claim;
    IF eligible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sign in again after changing your password.' USING ERRCODE='GR403';
    END IF;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'totalCustomers',count(*),
      'verifiedCustomers',count(*) FILTER(WHERE u.email_confirmed_at IS NOT NULL),
      'new30Days',count(*) FILTER(WHERE u.created_at>=now()-interval '30 days'),
      'signedIn30Days',count(*) FILTER(WHERE u.last_sign_in_at>=now()-interval '30 days')
    )
    FROM auth.users u
    WHERE NOT coalesce(u.is_anonymous,false)
      AND NOT EXISTS(SELECT 1 FROM golden_rose.staff_members s WHERE s.user_id=u.id)
  );
END;
$fn$;
REVOKE ALL ON FUNCTION golden_rose_catalogue.customer_counts()
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION golden_rose_catalogue.customer_counts()
  TO authenticated;
CREATE FUNCTION public.gr_owner_customer_counts()
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $fn$
  SELECT golden_rose_catalogue.customer_counts();
$fn$;
REVOKE ALL ON FUNCTION public.gr_owner_customer_counts() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.gr_owner_customer_counts() TO authenticated;

COMMIT;
