-- Review before applying. Existing Auth users and owner memberships are retained.
BEGIN;

ALTER TABLE golden_rose.staff_members
  ADD COLUMN location_id uuid REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
  ADD COLUMN revoked_at timestamptz,
  ADD CONSTRAINT staff_revocation_suspends_access CHECK (revoked_at IS NULL OR (role <> 'owner' AND status = 'suspended'));

CREATE SCHEMA golden_rose_employment;
REVOKE ALL ON SCHEMA golden_rose_employment FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA golden_rose_employment TO anon, authenticated;

CREATE TABLE golden_rose_employment.profiles (
  user_id uuid PRIMARY KEY REFERENCES golden_rose.staff_members(user_id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  work_email text NOT NULL UNIQUE,
  username text UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);

CREATE TABLE golden_rose_employment.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  work_email text NOT NULL,
  username text CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  role text NOT NULL CHECK (role IN ('manager','cashier','inventory_staff','sales_staff','accountant')),
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  accepted_at timestamptz,
  cancelled_at timestamptz
);

CREATE UNIQUE INDEX employee_pending_email ON golden_rose_employment.invitations(work_email)
  WHERE accepted_at IS NULL AND cancelled_at IS NULL;
CREATE UNIQUE INDEX employee_pending_username ON golden_rose_employment.invitations(username)
  WHERE accepted_at IS NULL AND cancelled_at IS NULL AND username IS NOT NULL;

CREATE TABLE golden_rose_employment.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE golden_rose_employment.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_employment.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_employment.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA golden_rose_employment FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION golden_rose_employment.manage(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  target uuid := nullif(p_payload->>'id','')::uuid;
  next_role text := p_payload->>'role';
  store uuid := nullif(p_payload->>'locationId','')::uuid;
  recipient_email text := lower(btrim(p_payload->>'email'));
  username_input text := nullif(lower(btrim(p_payload->>'username')),'');
  employee_name text := btrim(p_payload->>'fullName');
  hashed text := p_payload->>'tokenHash';
  invitation golden_rose_employment.invitations%ROWTYPE;
  employee golden_rose.staff_members%ROWTYPE;
  next_status text;
BEGIN
  PERFORM 1 FROM golden_rose.staff_members
    WHERE user_id=actor AND role='owner' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active owner account is required.' USING ERRCODE='42501'; END IF;

  IF p_action='list' THEN
    RETURN jsonb_build_object(
      'employees', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',s.user_id,'fullName',coalesce(p.full_name,nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Employee'),
        'email',coalesce(u.email,p.work_email,''),'username',p.username,'role',s.role,'locationId',s.location_id,
        'status',CASE WHEN s.revoked_at IS NOT NULL THEN 'revoked' ELSE s.status END
      ) ORDER BY coalesce(p.full_name,u.email),s.user_id),'[]'::jsonb)
        FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
        LEFT JOIN golden_rose_employment.profiles p ON p.user_id=s.user_id WHERE s.role<>'owner'),
      'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active) ORDER BY name,id),'[]'::jsonb)
        FROM golden_rose.locations WHERE location_type='store'),
      'invitations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'fullName',i.full_name,'email',i.work_email,'role',i.role,'locationId',i.location_id,'expiresAt',i.expires_at,
        'status',CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted'
          WHEN i.cancelled_at IS NOT NULL AND i.cancelled_at<i.expires_at THEN 'revoked'
          WHEN i.expires_at<=now() THEN 'expired' ELSE 'pending' END
      ) ORDER BY i.issued_at DESC),'[]'::jsonb)
        FROM (SELECT * FROM golden_rose_employment.invitations ORDER BY issued_at DESC LIMIT 100) i),
      'audit', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',e.id,'actor',coalesce(u.email,'Former account'),'subject',e.subject,
        'action',e.action,'detail',e.detail,'createdAt',e.created_at
      ) ORDER BY e.created_at DESC),'[]'::jsonb)
        FROM (SELECT * FROM golden_rose_employment.events ORDER BY created_at DESC LIMIT 100) e
        LEFT JOIN auth.users u ON u.id=e.actor)
    );
  END IF;

  PERFORM pg_advisory_xact_lock(109071, 3);
  IF p_action IN ('invite','update') AND (
    next_role IS NULL OR next_role NOT IN ('manager','cashier','inventory_staff','sales_staff','accountant')
    OR NOT EXISTS (SELECT 1 FROM golden_rose.locations WHERE id=store AND is_active AND location_type='store')
  ) THEN RAISE EXCEPTION 'Select a permitted role and active store.' USING ERRCODE='22023'; END IF;

  IF p_action='invite' THEN
    IF coalesce(recipient_email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR length(recipient_email)>254
       OR coalesce(length(employee_name),0) NOT BETWEEN 2 AND 120
       OR (username_input IS NOT NULL AND username_input !~ '^[a-z0-9][a-z0-9._-]{2,31}$')
       OR coalesce(hashed,'') !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'Check the employee name, work email and username.' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
        WHERE lower(u.email)=recipient_email AND s.revoked_at IS NULL)
       OR EXISTS (SELECT 1 FROM golden_rose_employment.profiles p
        WHERE p.username=username_input AND p.work_email<>recipient_email)
    THEN RAISE EXCEPTION 'That work email or username already belongs to a staff account.' USING ERRCODE='22023'; END IF;
    UPDATE golden_rose_employment.invitations SET cancelled_at=now()
      WHERE (work_email=recipient_email OR username=username_input) AND expires_at<=now() AND accepted_at IS NULL AND cancelled_at IS NULL;
    IF EXISTS (SELECT 1 FROM golden_rose_employment.invitations
        WHERE (work_email=recipient_email OR username=username_input) AND accepted_at IS NULL AND cancelled_at IS NULL)
    THEN RAISE EXCEPTION 'An invitation already uses this email or username. Reissue or revoke it from the list.' USING ERRCODE='22023'; END IF;
    INSERT INTO golden_rose_employment.invitations(full_name,work_email,username,role,location_id,token_hash,invited_by)
      VALUES(employee_name,recipient_email,username_input,next_role,store,hashed,actor) RETURNING * INTO invitation;
    INSERT INTO golden_rose_employment.events(actor,subject,action,detail)
      VALUES(actor,recipient_email,'invited',jsonb_build_object('role',next_role,'store',store));
    RETURN jsonb_build_object('id',invitation.id,'email',recipient_email);
  END IF;

  IF p_action IN ('reissue','cancel_invite') THEN
    SELECT * INTO invitation FROM golden_rose_employment.invitations WHERE id=target FOR UPDATE;
    IF NOT FOUND OR invitation.accepted_at IS NOT NULL OR invitation.cancelled_at IS NOT NULL
    THEN RAISE EXCEPTION 'This invitation can no longer be changed.' USING ERRCODE='22023'; END IF;
    IF p_action='reissue' THEN
      IF coalesce(hashed,'') !~ '^[a-f0-9]{64}$' OR
         NOT EXISTS(SELECT 1 FROM golden_rose.locations WHERE id=invitation.location_id AND is_active AND location_type='store')
      THEN RAISE EXCEPTION 'Choose an active store before issuing a new invitation.' USING ERRCODE='22023'; END IF;
      UPDATE golden_rose_employment.invitations
        SET token_hash=hashed,invited_by=actor,issued_at=now(),expires_at=now()+interval '24 hours' WHERE id=target;
    ELSE
      UPDATE golden_rose_employment.invitations SET cancelled_at=now() WHERE id=target;
    END IF;
    INSERT INTO golden_rose_employment.events(actor,subject,action)
      VALUES(actor,invitation.work_email,CASE WHEN p_action='reissue' THEN 'invite_reissued' ELSE 'invite_revoked' END);
    RETURN jsonb_build_object('id',target,'email',invitation.work_email);
  END IF;

  IF p_action NOT IN ('update','suspend','restore','revoke') OR p_action IS NULL
  THEN RAISE EXCEPTION 'Unsupported staff action.' USING ERRCODE='22023'; END IF;
  SELECT s.* INTO employee FROM golden_rose.staff_members s WHERE s.user_id=target AND s.role<>'owner' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an employee account.' USING ERRCODE='22023'; END IF;
  IF employee.revoked_at IS NOT NULL THEN
    IF p_action='revoke' THEN RETURN jsonb_build_object('ok',true); END IF;
    RAISE EXCEPTION 'Send a new invitation to rehire a revoked employee.' USING ERRCODE='22023';
  END IF;
  SELECT u.email INTO recipient_email FROM auth.users u WHERE id=target;
  IF p_action='update' THEN
    IF (employee.role,employee.location_id) IS DISTINCT FROM (next_role,store) THEN
      UPDATE golden_rose.staff_members SET role=next_role,location_id=store,updated_at=now() WHERE user_id=target;
      INSERT INTO golden_rose_employment.events(actor,subject,action,detail) VALUES(actor,coalesce(recipient_email,target::text),'permissions_updated',
        jsonb_build_object('fromRole',employee.role,'role',next_role,'fromStore',employee.location_id,'store',store));
    END IF;
  ELSE
    next_status := CASE WHEN p_action='restore' THEN 'active' ELSE 'suspended' END;
    IF employee.status IS DISTINCT FROM next_status OR p_action='revoke' THEN
      UPDATE golden_rose.staff_members SET status=next_status,
        revoked_at=CASE WHEN p_action='revoke' THEN now() ELSE NULL END,updated_at=now() WHERE user_id=target;
      INSERT INTO golden_rose_employment.events(actor,subject,action) VALUES(actor,coalesce(recipient_email,target::text),
        CASE p_action WHEN 'revoke' THEN 'revoked' WHEN 'restore' THEN 'restored' ELSE 'suspended' END);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE FUNCTION golden_rose_employment.invite_valid(p_hash text,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM golden_rose_employment.invitations i
    JOIN golden_rose.staff_members s ON s.user_id=i.invited_by AND s.role='owner' AND s.status='active'
    JOIN golden_rose.locations l ON l.id=i.location_id AND l.is_active AND l.location_type='store'
    WHERE i.token_hash=p_hash AND i.work_email=lower(btrim(p_email))
      AND i.accepted_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at>now());
$$;

CREATE FUNCTION golden_rose_employment.accept(p_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  work_address text;
  invitation golden_rose_employment.invitations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(109071, 3);
  SELECT lower(u.email) INTO work_address FROM auth.users u WHERE u.id=actor
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
    AND (u.banned_until IS NULL OR u.banned_until<=now());
  SELECT * INTO invitation FROM golden_rose_employment.invitations WHERE token_hash=p_hash FOR UPDATE;
  IF NOT FOUND OR work_address IS DISTINCT FROM invitation.work_email OR invitation.cancelled_at IS NOT NULL
  THEN RAISE EXCEPTION 'This invitation is invalid, expired or for another account.' USING ERRCODE='22023'; END IF;
  IF invitation.accepted_at IS NOT NULL THEN
    -- A retry acknowledges an existing active membership, without granting access again.
    RETURN (SELECT role FROM golden_rose.staff_members WHERE user_id=actor AND status='active' AND role<>'owner');
  END IF;
  IF NOT golden_rose_employment.invite_valid(p_hash,work_address)
  THEN RAISE EXCEPTION 'This invitation is invalid, expired or for another account.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM golden_rose.staff_members WHERE user_id=invitation.invited_by AND role='owner' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is no longer available.' USING ERRCODE='22023'; END IF;

  INSERT INTO golden_rose.staff_members AS s(user_id,role,status,location_id)
    VALUES(actor,invitation.role,'active',invitation.location_id)
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,status='active',location_id=excluded.location_id,revoked_at=NULL,updated_at=now()
    WHERE s.role<>'owner' AND s.revoked_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This account already has separate staff access.' USING ERRCODE='22023'; END IF;
  INSERT INTO golden_rose_employment.profiles(user_id,full_name,work_email,username)
    VALUES(actor,invitation.full_name,work_address,invitation.username)
    ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,work_email=excluded.work_email,username=excluded.username;
  UPDATE golden_rose_employment.invitations SET accepted_at=now() WHERE id=invitation.id;
  INSERT INTO golden_rose_employment.events(actor,subject,action,detail)
    VALUES(actor,work_address,'invite_accepted',jsonb_build_object('role',invitation.role,'store',invitation.location_id));
  RETURN invitation.role;
END;
$$;

CREATE FUNCTION public.gr_staff_manage(p_action text,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT golden_rose_employment.manage(p_action,p_payload) $$;
CREATE FUNCTION public.gr_staff_invite_valid(p_hash text,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT golden_rose_employment.invite_valid(p_hash,p_email) $$;
CREATE FUNCTION public.gr_staff_invite_accept(p_hash text)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT golden_rose_employment.accept(p_hash) $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA golden_rose_employment FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gr_staff_manage(text,jsonb),public.gr_staff_invite_valid(text,text),public.gr_staff_invite_accept(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gr_staff_manage(text,jsonb),public.gr_staff_invite_accept(text),
  golden_rose_employment.manage(text,jsonb),golden_rose_employment.accept(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gr_staff_invite_valid(text,text),golden_rose_employment.invite_valid(text,text) TO anon, authenticated;

-- Lock the active membership for each scoped write. A suspend or reassignment
-- takes effect on the next transaction after the current one finishes.
CREATE FUNCTION golden_rose.employee_store_access(p_actor uuid,p_location uuid,p_roles text[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_role text; v_store uuid;
BEGIN
  SELECT role,location_id INTO v_role,v_store FROM golden_rose.staff_members
    WHERE user_id=p_actor AND status='active' FOR SHARE;
  RETURN coalesce(v_role=ANY(p_roles) AND (v_role='owner' OR
    (p_location IS NOT NULL AND p_location=v_store AND EXISTS (
      SELECT 1 FROM golden_rose.locations WHERE id=p_location AND is_active AND location_type='store'
    ))),false);
END;
$$;
REVOKE ALL ON FUNCTION golden_rose.employee_store_access(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION golden_rose.employee_store_access(uuid,uuid,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.gr_receive_stock(
  p_actor_id uuid,p_variant_id uuid,p_location_id uuid,p_quantity integer,
  p_idempotency_key text,p_reference_type text DEFAULT 'receiving',
  p_reference_id text DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NOT golden_rose.employee_store_access(p_actor_id,p_location_id,ARRAY['owner','manager','inventory_staff'])
  THEN RAISE EXCEPTION 'Receiving is outside your assigned store or role.' USING ERRCODE='42501'; END IF;
  RETURN golden_rose.receive_stock(p_actor_id,p_variant_id,p_location_id,p_quantity,p_idempotency_key,
    p_reference_type,p_reference_id,p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.gr_sell_stock(
  p_actor_id uuid,p_variant_id uuid,p_location_id uuid,p_quantity integer,
  p_idempotency_key text,p_reference_type text DEFAULT 'pos_sale',p_reference_id text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NOT golden_rose.employee_store_access(p_actor_id,p_location_id,ARRAY['owner','manager','cashier'])
  THEN RAISE EXCEPTION 'POS access is not permitted for this store.' USING ERRCODE='GR403'; END IF;
  RETURN golden_rose.sell_stock(p_actor_id,p_variant_id,p_location_id,p_quantity,p_idempotency_key,
    p_reference_type,p_reference_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.gr_staff_session(p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_role text; v_store uuid;
BEGIN
  SELECT role,location_id INTO v_role,v_store FROM golden_rose.staff_members
  WHERE user_id=p_actor_id AND status='active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('isStaff',false);
  END IF;
  RETURN jsonb_build_object('isStaff',true,'role',v_role,'locationId',v_store);
END;
$function$;

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
          'available',coalesce(s.on_hand-s.reserved,0)
        ) AS row_data
      FROM golden_rose.product_variants v
      JOIN golden_rose.products p ON p.id=v.product_id
      LEFT JOIN golden_rose.brands b ON b.id=p.brand_id
      LEFT JOIN golden_rose.categories c ON c.id=p.category_id
      CROSS JOIN golden_rose.locations l
      LEFT JOIN golden_rose.stock_balances s ON s.variant_id=v.id AND s.location_id=l.id
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

CREATE OR REPLACE FUNCTION public.gr_pos_register(p_actor_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE
 v_role text;
 v_assigned_store uuid;
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
 IF NOT golden_rose.pos_actor_has_confirmed_email(p_actor_id)
 THEN RAISE EXCEPTION 'Verified staff identity required.' USING ERRCODE='GR403'; END IF;
 SELECT role,location_id INTO v_role,v_assigned_store FROM golden_rose.staff_members
 WHERE user_id=p_actor_id AND status='active' FOR SHARE;
 IF v_role NOT IN ('owner','manager','cashier') OR v_role IS NULL
 THEN RAISE EXCEPTION 'POS access is not permitted for this role.' USING ERRCODE='GR403'; END IF;

 IF v_role <> 'owner' AND v_assigned_store IS NULL
 THEN RAISE EXCEPTION 'Ask an owner to assign your store.' USING ERRCODE='GR403'; END IF;

 IF p_action='catalog' THEN
   v_search:=left(btrim(coalesce(p_payload->>'search','')),100);
   v_offset:=least(greatest(coalesce((p_payload->>'offset')::integer,0),0),1000000);
   v_limit:=least(greatest(coalesce((p_payload->>'limit')::integer,40),1),80);
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',id,'name',name,'code',code,'type',location_type) ORDER BY name,id),'[]'::jsonb)
   INTO v_locations FROM golden_rose.locations
   WHERE is_active AND location_type='store' AND (v_role='owner' OR id=v_assigned_store);
   IF p_payload ? 'locationId' AND nullif(p_payload->>'locationId','') IS NOT NULL THEN
     v_location_id:=(p_payload->>'locationId')::uuid;
     IF v_role<>'owner' AND v_location_id IS DISTINCT FROM v_assigned_store
       THEN RAISE EXCEPTION 'This register is outside your assigned store.' USING ERRCODE='GR403'; END IF;
     IF NOT EXISTS(SELECT 1 FROM golden_rose.locations WHERE id=v_location_id AND is_active AND location_type='store')
       THEN RAISE EXCEPTION 'Select an active store register location.' USING ERRCODE='22023'; END IF;
   ELSE
     SELECT id INTO v_location_id FROM golden_rose.locations WHERE is_active AND location_type='store' AND (v_role='owner' OR id=v_assigned_store) ORDER BY name,id LIMIT 1;
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
   SELECT * INTO v_sale FROM golden_rose.pos_sales WHERE id=v_sale_id AND (v_role='owner' OR location_id=v_assigned_store);
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
 IF v_role<>'owner' AND v_location_id IS DISTINCT FROM v_assigned_store
 THEN RAISE EXCEPTION 'This register is outside your assigned store.' USING ERRCODE='GR403'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.gr_pos_checked_checkout(p_actor_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_key uuid;
  v_line record;
  v_price bigint;
BEGIN
  IF NOT golden_rose.pos_actor_has_confirmed_email(p_actor_id) OR NOT
    golden_rose.employee_store_access(p_actor_id,(p_payload->>'locationId')::uuid,ARRAY['owner','manager','cashier'])
  THEN RAISE EXCEPTION 'POS access is not permitted for this store.' USING ERRCODE='GR403'; END IF;
  IF coalesce(p_payload->>'idempotencyKey','') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Invalid transaction ID' USING ERRCODE='22023'; END IF;
  v_key:=(p_payload->>'idempotencyKey')::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('golden_rose_pos:'||v_key::text,0));
  IF EXISTS(SELECT 1 FROM golden_rose.pos_sales WHERE idempotency_key=v_key) THEN
    RETURN public.gr_pos_register(p_actor_id,'checkout',p_payload);
  END IF;
  IF coalesce(jsonb_typeof(p_payload->'items'),'')<>'array'
    OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 40
  THEN RAISE EXCEPTION 'Invalid sale lines' USING ERRCODE='22023'; END IF;

  FOR v_line IN
    SELECT x."variantId" AS id, x."expectedPriceMinor" AS expected_price
    FROM jsonb_to_recordset(p_payload->'items') AS x("variantId" uuid,quantity integer,"expectedPriceMinor" bigint)
    ORDER BY x."variantId"
  LOOP
    IF v_line.id IS NULL OR v_line.expected_price IS NULL
      OR v_line.expected_price < 1 THEN
      RAISE EXCEPTION 'Refresh the register: missing product price.' USING ERRCODE='22023';
    END IF;
    SELECT price_minor INTO v_price FROM golden_rose.product_variants WHERE id=v_line.id FOR SHARE;
    IF v_price IS NULL OR v_price<>v_line.expected_price THEN
      RAISE EXCEPTION 'A product price has changed. Refresh the register before checkout.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  RETURN public.gr_pos_register(p_actor_id,'checkout',p_payload);
END;
$function$;

REVOKE ALL ON FUNCTION public.gr_inventory_snapshot(uuid,integer,integer),public.gr_admin_products(uuid,integer,integer),
  public.gr_staff_session(uuid),public.gr_pos_register(uuid,text,jsonb),public.gr_pos_checked_checkout(uuid,jsonb),
  public.gr_receive_stock(uuid,uuid,uuid,integer,text,text,text,text),public.gr_sell_stock(uuid,uuid,uuid,integer,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gr_inventory_snapshot(uuid,integer,integer),public.gr_admin_products(uuid,integer,integer),
  public.gr_staff_session(uuid),public.gr_pos_register(uuid,text,jsonb),public.gr_pos_checked_checkout(uuid,jsonb),
  public.gr_receive_stock(uuid,uuid,uuid,integer,text,text,text,text),public.gr_sell_stock(uuid,uuid,uuid,integer,text,text,text)
  TO service_role;

COMMIT;
