-- Golden Rose CRM: private customer directory with audited, store-scoped access.
-- No customer records or POS sales are modified by this migration.
BEGIN;
CREATE SCHEMA golden_rose_crm;
REVOKE ALL ON SCHEMA golden_rose_crm FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA golden_rose_crm TO authenticated;

CREATE TABLE golden_rose_crm.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 25),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_active_store_email
  ON golden_rose_crm.customers(location_id,lower(email))
  WHERE email IS NOT NULL AND status='active';
CREATE INDEX crm_customers_by_store_date
  ON golden_rose_crm.customers(location_id,created_at DESC,id DESC);
CREATE TABLE golden_rose_crm.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES golden_rose_crm.customers(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('create','update','archive','restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_events_customer_date ON golden_rose_crm.events(customer_id,created_at DESC);

ALTER TABLE golden_rose_crm.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_crm.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA golden_rose_crm FROM PUBLIC,anon,authenticated;

CREATE FUNCTION golden_rose_crm.manage(
  p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_session uuid;
  v_role text;
  v_store uuid;
  v_filter_store uuid;
  v_selected_store uuid;
  v_search text;
  v_status text;
  v_offset integer;
  v_limit integer;
  v_more boolean;
  v_records jsonb;
  v_stores jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_id uuid;
  v_expected timestamptz;
  v_existing golden_rose_crm.customers%ROWTYPE;
  v_current golden_rose_crm.customers%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF v_actor IS NULL OR coalesce(v_claims->>'session_id','') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Sign in again.' USING ERRCODE='GR403'; END IF;
  v_session:=(v_claims->>'session_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions WHERE id=v_session AND user_id=v_actor
  ) THEN RAISE EXCEPTION 'Session is no longer active.' USING ERRCODE='GR403'; END IF;

  SELECT s.role,s.location_id INTO v_role,v_store
  FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
  WHERE s.user_id=v_actor AND s.status='active' AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
    AND (u.banned_until IS NULL OR u.banned_until<=now())
  FOR SHARE OF s;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','sales_staff') THEN
    RAISE EXCEPTION 'CRM access denied.' USING ERRCODE='GR403';
  END IF;
  IF v_role<>'owner' AND (v_store IS NULL OR NOT EXISTS(
     SELECT 1 FROM golden_rose.locations
     WHERE id=v_store AND is_active AND location_type='store'
  )) THEN
    RAISE EXCEPTION 'An active assigned store is required.' USING ERRCODE='GR403';
  END IF;

  -- The dedicated employee-account release will additionally enforce
  -- password-rotation and session revocation once installed.
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)'
      INTO v_allowed USING v_actor,v_session;
    IF v_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Sign in again after changing your password.' USING ERRCODE='GR403';
    END IF;
  END IF;

  IF p_action='list' THEN
    IF coalesce(p_payload->>'offset','0') !~ '^[0-9]{1,5}$'
      OR (p_payload->>'offset')::integer>10000
      OR coalesce(p_payload->>'limit','25') !~ '^[0-9]{1,2}$'
      OR (p_payload->>'limit')::integer NOT BETWEEN 1 AND 50
    THEN RAISE EXCEPTION 'Invalid directory page.' USING ERRCODE='22023'; END IF;
    v_offset:=coalesce((p_payload->>'offset')::integer,0);
    v_limit:=coalesce((p_payload->>'limit')::integer,25);
    v_search:=lower(btrim(coalesce(p_payload->>'search','')));
    v_status:=coalesce(nullif(p_payload->>'status',''),'active');
    IF length(v_search)>100 OR v_status NOT IN ('active','archived','all') THEN
      RAISE EXCEPTION 'Invalid search filters.' USING ERRCODE='22023';
    END IF;
    IF nullif(p_payload->>'locationId','') IS NOT NULL THEN
      v_filter_store:=(p_payload->>'locationId')::uuid;
      IF v_role<>'owner' AND v_filter_store<>v_store THEN
        RAISE EXCEPTION 'Another store is not permitted.' USING ERRCODE='GR403';
      END IF;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'code',code) ORDER BY name,id),'[]'::jsonb)
    INTO v_stores FROM golden_rose.locations
    WHERE is_active AND location_type='store' AND
      (v_role='owner' OR id=v_store);

    SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb)
    INTO v_records FROM (
      SELECT c.id,c.created_at,jsonb_build_object(
        'id',c.id,'locationId',c.location_id,'locationName',l.name,
        'fullName',c.full_name,'email',c.email,'phone',c.phone,
        'notes',c.notes,'status',c.status,
        'createdAt',c.created_at,'updatedAt',c.updated_at
      ) AS item
      FROM golden_rose_crm.customers c
      JOIN golden_rose.locations l ON l.id=c.location_id
      WHERE (v_role='owner' OR c.location_id=v_store)
        AND (v_filter_store IS NULL OR c.location_id=v_filter_store)
        AND (v_status='all' OR c.status=v_status)
        AND (v_search='' OR
          strpos(lower(c.full_name),v_search)>0 OR
          strpos(lower(coalesce(c.email,'')),v_search)>0 OR
          strpos(lower(coalesce(c.phone,'')),v_search)>0)
      ORDER BY c.created_at DESC,c.id DESC
      LIMIT v_limit+1 OFFSET v_offset
    ) x;

    v_more:=jsonb_array_length(v_records)>v_limit;
    IF v_more THEN v_records:=v_records-v_limit; END IF;
    RETURN jsonb_build_object('ok',true,'items',v_records,'locations',v_stores,
      'hasMore',v_more,'offset',v_offset,'limit',v_limit);
  END IF;

  IF p_action NOT IN ('create','update','archive','restore') THEN
    RAISE EXCEPTION 'Unknown CRM operation.' USING ERRCODE='22023';
  END IF;

  IF p_action='create' THEN
    IF v_role='owner' THEN
      v_selected_store:=nullif(p_payload->>'locationId','')::uuid;
    ELSE
      v_selected_store:=v_store;
      IF nullif(p_payload->>'locationId','') IS NOT NULL
        AND (p_payload->>'locationId')::uuid<>v_store THEN
        RAISE EXCEPTION 'Store assignment is restricted.' USING ERRCODE='GR403';
      END IF;
    END IF;
    IF v_selected_store IS NULL OR NOT EXISTS (
      SELECT 1 FROM golden_rose.locations
      WHERE id=v_selected_store AND is_active AND location_type='store'
    ) THEN RAISE EXCEPTION 'Choose an active retail store.' USING ERRCODE='22023'; END IF;
  ELSE
    IF coalesce(p_payload->>'id','') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RAISE EXCEPTION 'Invalid customer ID.' USING ERRCODE='22023'; END IF;
    v_id:=(p_payload->>'id')::uuid;
    SELECT * INTO v_existing
    FROM golden_rose_crm.customers
    WHERE id=v_id AND (v_role='owner' OR location_id=v_store)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found.' USING ERRCODE='P0002'; END IF;
    v_selected_store:=v_existing.location_id;
    IF nullif(p_payload->>'updatedAt','') IS NULL THEN
      RAISE EXCEPTION 'Refresh the customer before editing.' USING ERRCODE='GR409';
    END IF;
    v_expected:=(p_payload->>'updatedAt')::timestamptz;
    IF v_existing.updated_at IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'This customer was changed by another user. Refresh.' USING ERRCODE='GR409';
    END IF;
    IF p_action IN ('archive','restore') AND v_role='sales_staff' THEN
      RAISE EXCEPTION 'Only a manager or owner can archive customers.' USING ERRCODE='GR403';
    END IF;
  END IF;

  IF p_action IN ('create','update') THEN
    v_name:=btrim(coalesce(p_payload->>'fullName',''));
    v_email:=nullif(lower(btrim(coalesce(p_payload->>'email',''))),'');
    v_phone:=nullif(btrim(coalesce(p_payload->>'phone','')),'');
    v_notes:=btrim(coalesce(p_payload->>'notes',''));
    IF length(v_name) NOT BETWEEN 2 AND 120
      OR length(v_notes)>2000
      OR (v_email IS NULL AND v_phone IS NULL)
      OR (v_email IS NOT NULL AND (length(v_email)>254 OR v_email !~
         '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
      OR (v_phone IS NOT NULL AND (length(v_phone)>25 OR v_phone !~
         '^[+0-9][0-9 ()-]{6,24}$'))
    THEN RAISE EXCEPTION 'Provide a name, email or phone, and valid details.' USING ERRCODE='22023'; END IF;
  END IF;

  IF p_action='create' THEN
    INSERT INTO golden_rose_crm.customers
      (location_id,full_name,email,phone,notes,created_by,updated_by)
    VALUES (v_selected_store,v_name,v_email,v_phone,v_notes,v_actor,v_actor)
    RETURNING * INTO v_current;
  ELSIF p_action='update' THEN
    IF v_existing.status<>'active' THEN
      RAISE EXCEPTION 'Restore this customer before editing.' USING ERRCODE='22023';
    END IF;
    UPDATE golden_rose_crm.customers
    SET full_name=v_name,email=v_email,phone=v_phone,notes=v_notes,
      updated_by=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_current;
  ELSIF p_action='archive' THEN
    UPDATE golden_rose_crm.customers
    SET status='archived',updated_by=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_current;
  ELSE
    UPDATE golden_rose_crm.customers
    SET status='active',updated_by=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_current;
  END IF;

  INSERT INTO golden_rose_crm.events(customer_id,actor_id,action)
  VALUES (v_current.id,v_actor,p_action);
  RETURN jsonb_build_object('ok',true,'customer',jsonb_build_object(
    'id',v_current.id,'fullName',v_current.full_name,'email',v_current.email,
    'phone',v_current.phone,'notes',v_current.notes,'locationId',v_current.location_id,
    'status',v_current.status,'createdAt',v_current.created_at,
    'updatedAt',v_current.updated_at));
END;
$fn$;

REVOKE ALL ON FUNCTION golden_rose_crm.manage(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION golden_rose_crm.manage(text,jsonb) TO authenticated;

CREATE FUNCTION public.gr_crm_manage(
 p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT golden_rose_crm.manage(p_action,p_payload);
$fn$;
REVOKE ALL ON FUNCTION public.gr_crm_manage(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gr_crm_manage(text,jsonb) TO authenticated;
COMMIT;
