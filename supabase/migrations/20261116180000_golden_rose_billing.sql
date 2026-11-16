-- Private quotation and invoice ledger. No catalogue, inventory or POS writes.
BEGIN;
CREATE SCHEMA golden_rose_billing;
REVOKE ALL ON SCHEMA golden_rose_billing FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA golden_rose_billing TO authenticated;

CREATE TABLE golden_rose_billing.issuer_profiles (
  location_id uuid PRIMARY KEY REFERENCES golden_rose.locations(id),
  identity jsonb NOT NULL,
  tax_bps integer NOT NULL CHECK (tax_bps BETWEEN 0 AND 10000),
  tax_basis text NOT NULL CHECK (length(tax_basis) BETWEEN 3 AND 500),
  verified_by uuid NOT NULL REFERENCES auth.users(id),
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE golden_rose_billing.invoice_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_number bigint NOT NULL CHECK (last_number >= 0)
);
INSERT INTO golden_rose_billing.invoice_counter VALUES (true, 0);

CREATE TABLE golden_rose_billing.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('quotation','invoice')),
  state text NOT NULL DEFAULT 'draft' CHECK (
    (kind='quotation' AND state IN ('draft','accepted')) OR
    (kind='invoice' AND state IN ('draft','issued','voided'))
  ),
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id),
  customer_id uuid REFERENCES golden_rose_crm.customers(id),
  original_quote_id uuid UNIQUE REFERENCES golden_rose_billing.documents(id),
  invoice_number bigint UNIQUE CHECK (invoice_number > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  customer jsonb NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
  issue_date date NOT NULL,
  due_date date NOT NULL CHECK (due_date >= issue_date),
  terms text NOT NULL,
  notes text NOT NULL,
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor BETWEEN 1 AND 100000000000000),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0 AND discount_minor < subtotal_minor),
  tax_bps integer CHECK (tax_bps BETWEEN 0 AND 10000),
  tax_verified_at timestamptz,
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint GENERATED ALWAYS AS (subtotal_minor-discount_minor+tax_minor) STORED,
  issuer jsonb,
  issued_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tax_minor=((subtotal_minor-discount_minor)*coalesce(tax_bps,0)+5000)/10000),
  CHECK ((tax_bps IS NULL)=(tax_verified_at IS NULL)),
  CHECK ((invoice_number IS NOT NULL)=(state IN ('issued','voided'))),
  CHECK ((issuer IS NOT NULL)=(state IN ('accepted','issued','voided'))),
  CHECK ((issued_at IS NOT NULL)=(state IN ('issued','voided'))),
  CHECK (original_quote_id IS NULL OR kind='invoice')
);
CREATE INDEX billing_documents_store_date ON golden_rose_billing.documents(location_id,issue_date DESC,id);
CREATE INDEX billing_documents_date ON golden_rose_billing.documents(issue_date DESC,id);

CREATE TABLE golden_rose_billing.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES golden_rose_billing.documents(id),
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id),
  source text NOT NULL CHECK (source IN ('pos','offline')),
  reference text NOT NULL,
  evidence text,
  pos_sale_id uuid UNIQUE REFERENCES golden_rose.pos_sales(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL CHECK (status IN ('pending','verified','rejected')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  CHECK ((status='pending')=(reviewed_at IS NULL)),
  CHECK ((reviewed_by IS NULL)=(reviewed_at IS NULL)),
  CHECK ((source='pos')=(pos_sale_id IS NOT NULL)),
  CHECK ((source='offline')=(evidence IS NOT NULL))
);
CREATE UNIQUE INDEX billing_payment_offline_reference
  ON golden_rose_billing.payments(lower(reference))
  WHERE source='offline' AND status <> 'rejected';
CREATE INDEX billing_payments_by_document ON golden_rose_billing.payments(document_id,status);

CREATE TABLE golden_rose_billing.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  document_id uuid REFERENCES golden_rose_billing.documents(id),
  request_key uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_key)
);
CREATE INDEX billing_events_by_document ON golden_rose_billing.events(document_id,created_at DESC);
CREATE TABLE golden_rose_billing.requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  key uuid NOT NULL,
  location_id uuid NOT NULL REFERENCES golden_rose.locations(id),
  fingerprint bytea NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,key)
);

ALTER TABLE golden_rose_billing.issuer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_billing.invoice_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_billing.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_billing.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_billing.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_billing.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA golden_rose_billing FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA golden_rose_billing FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION golden_rose_billing.protect_document()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Billing documents cannot be deleted.' USING ERRCODE='GR409';
  END IF;
  IF OLD.state <> 'draft' AND NOT (
    OLD.state='issued' AND NEW.state='voided'
    AND (to_jsonb(NEW)-ARRAY['state','revision','updated_at','total_minor'])
      =(to_jsonb(OLD)-ARRAY['state','revision','updated_at','total_minor'])
  ) THEN RAISE EXCEPTION 'Saved document snapshots are immutable.' USING ERRCODE='GR409'; END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER billing_document_immutable BEFORE UPDATE OR DELETE ON golden_rose_billing.documents
  FOR EACH ROW EXECUTE FUNCTION golden_rose_billing.protect_document();

CREATE FUNCTION golden_rose_billing.required_text(p_data jsonb,p_key text,p_max integer,p_min integer DEFAULT 0)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_text text := btrim(coalesce(p_data->>p_key,''));
BEGIN
  IF (p_data ? p_key AND jsonb_typeof(p_data->p_key) NOT IN ('string','null'))
    OR length(v_text) NOT BETWEEN p_min AND p_max
  THEN RAISE EXCEPTION 'Invalid billing field: %.',p_key USING ERRCODE='GR422'; END IF;
  RETURN v_text;
END;
$fn$;

CREATE FUNCTION golden_rose_billing.integer_field(p_data jsonb,p_key text,p_min bigint,p_max bigint)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_value text := p_data->>p_key;
BEGIN
  IF v_value IS NULL OR v_value !~ '^[0-9]{1,15}$' OR v_value::bigint NOT BETWEEN p_min AND p_max
  THEN RAISE EXCEPTION 'Invalid billing amount or quantity: %.',p_key USING ERRCODE='GR422'; END IF;
  RETURN v_value::bigint;
END;
$fn$;

CREATE FUNCTION golden_rose_billing.document_summary(p_doc golden_rose_billing.documents, p_full boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $fn$
  SELECT (CASE WHEN p_full THEN to_jsonb(p_doc)-'created_by'
    ELSE jsonb_build_object('id',p_doc.id,'kind',p_doc.kind,'state',p_doc.state,'location_id',p_doc.location_id,
      'recipient',p_doc.customer->>'recipient','invoice_number',p_doc.invoice_number,'issue_date',p_doc.issue_date,
      'total_minor',p_doc.total_minor,'currency',p_doc.currency)
    END) || jsonb_build_object(
      'location_name',(SELECT name FROM golden_rose.locations WHERE id=p_doc.location_id),
      'paid_minor',p.paid,
      'balance_minor',CASE WHEN p_doc.state='issued' THEN p_doc.total_minor-p.paid ELSE NULL END,
      'status',CASE WHEN p_doc.state<>'issued' THEN p_doc.state
                    WHEN p.paid=0 THEN 'unpaid'
                    WHEN p.paid<p_doc.total_minor THEN 'partially_paid' ELSE 'paid' END
    ) || CASE WHEN p_full THEN jsonb_build_object('payments',p.entries) ELSE '{}'::jsonb END
  FROM (
    SELECT coalesce(sum(amount_minor) FILTER (WHERE status='verified'),0)::bigint AS paid,
      CASE WHEN p_full THEN coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'reference',reference,
        'evidence',evidence,'amount_minor',amount_minor,'status',status,'submitted_at',submitted_at,
        'reviewed_at',reviewed_at,'review_note',review_note,
        'canReview',status='pending' AND submitted_by<>auth.uid()) ORDER BY submitted_at,id),'[]'::jsonb) END AS entries
    FROM golden_rose_billing.payments WHERE document_id=p_doc.id
  ) p;
$fn$;

CREATE FUNCTION golden_rose_billing.command(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_session_text text := auth.jwt()->>'session_id';
  v_session uuid;
  v_allowed boolean;
  v_role text;
  v_assigned uuid;
  v_store uuid;
  v_id uuid;
  v_key uuid;
  v_customer_id uuid;
  v_prior golden_rose_billing.requests%ROWTYPE;
  v_doc golden_rose_billing.documents%ROWTYPE;
  v_profile golden_rose_billing.issuer_profiles%ROWTYPE;
  v_contact golden_rose_crm.customers%ROWTYPE;
  v_pos golden_rose.pos_sales%ROWTYPE;
  v_payment golden_rose_billing.payments%ROWTYPE;
  v_product record;
  v_kind text;
  v_state text;
  v_search text;
  v_start date;
  v_end date;
  v_page integer;
  v_docs jsonb;
  v_stores jsonb;
  v_customer jsonb;
  v_lines jsonb := '[]';
  v_line jsonb;
  v_line_text text;
  v_sku text;
  v_variant uuid;
  v_quantity bigint;
  v_unit bigint;
  v_subtotal bigint := 0;
  v_discount bigint;
  v_tax bigint;
  v_paid bigint;
  v_amount bigint;
  v_number bigint;
  v_lagos_date date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_reference text;
  v_reason text;
  v_fingerprint bytea;
  v_result jsonb;
  v_details jsonb := '{}';
  v_audit_action text := p_action;
BEGIN
  IF v_actor IS NULL OR coalesce(v_session_text,'') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Sign in again to use billing.' USING ERRCODE='GR403'; END IF;
  v_session := v_session_text::uuid;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id=v_session AND user_id=v_actor)
  THEN RAISE EXCEPTION 'Your session is no longer active.' USING ERRCODE='GR403'; END IF;
  SELECT s.role,s.location_id INTO v_role,v_assigned
    FROM golden_rose.staff_members s JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=v_actor AND s.status='active' AND s.revoked_at IS NULL
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<=now())
    FOR SHARE OF s;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','accountant')
  THEN RAISE EXCEPTION 'Billing access denied.' USING ERRCODE='GR403'; END IF;
  IF v_role <> 'owner' AND NOT EXISTS (
    SELECT 1 FROM golden_rose.locations WHERE id=v_assigned AND is_active AND location_type='store'
  ) THEN RAISE EXCEPTION 'An active store assignment is required.' USING ERRCODE='GR403'; END IF;
  IF to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)' INTO v_allowed USING v_actor,v_session;
    IF v_allowed IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Sign in again after changing your password.' USING ERRCODE='GR403'; END IF;
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>60000
  THEN RAISE EXCEPTION 'Invalid billing request.' USING ERRCODE='GR422'; END IF;
  v_store := nullif(p_payload->>'storeId','')::uuid;
  v_id := nullif(p_payload->>'id','')::uuid;
  IF v_store IS NOT NULL AND v_role<>'owner' AND v_store IS DISTINCT FROM v_assigned
  THEN RAISE EXCEPTION 'This store is outside your allocation.' USING ERRCODE='GR403'; END IF;

  IF p_action='list' THEN
    v_search := lower(golden_rose_billing.required_text(p_payload,'search',120));
    v_kind := coalesce(p_payload->>'kind','');
    v_state := coalesce(p_payload->>'status','');
    IF v_kind NOT IN ('','quotation','invoice') OR
       v_state NOT IN ('','draft','accepted','unpaid','partially_paid','paid','voided')
    THEN RAISE EXCEPTION 'Invalid register filters.' USING ERRCODE='GR422'; END IF;
    v_start := nullif(p_payload->>'from','')::date;
    v_end := nullif(p_payload->>'to','')::date;
    IF v_start>v_end THEN RAISE EXCEPTION 'The end date must follow the start date.' USING ERRCODE='GR422'; END IF;
    v_page := CASE WHEN p_payload ? 'page' THEN golden_rose_billing.integer_field(p_payload,'page',0,10000) ELSE 0 END;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'active',l.is_active,
      'taxBps',p.tax_bps,'identity',p.identity,'taxBasis',p.tax_basis) ORDER BY l.name,l.id),'[]') INTO v_stores
      FROM golden_rose.locations l LEFT JOIN golden_rose_billing.issuer_profiles p ON p.location_id=l.id
      WHERE l.location_type='store' AND (v_role='owner' OR l.id=v_assigned);
    SELECT coalesce(jsonb_agg(x.summary ORDER BY x.issue_date DESC,x.id),'[]') INTO v_docs FROM (
      SELECT d.issue_date,d.id,s.summary FROM golden_rose_billing.documents d
      CROSS JOIN LATERAL (SELECT golden_rose_billing.document_summary(d) AS summary) s
      WHERE (v_role='owner' OR d.location_id=v_assigned) AND (v_store IS NULL OR d.location_id=v_store)
        AND (v_start IS NULL OR d.issue_date>=v_start) AND (v_end IS NULL OR d.issue_date<=v_end)
        AND (v_kind='' OR d.kind=v_kind) AND (v_state='' OR s.summary->>'status'=v_state)
        AND (v_search='' OR strpos(lower(d.customer->>'recipient'),v_search)>0
          OR strpos(lower(d.customer->>'company'),v_search)>0
          OR (d.invoice_number IS NOT NULL AND strpos('gr-inv-'||d.invoice_number::text,v_search)>0)
          OR (d.kind='quotation' AND strpos('gr-qt-'||d.id::text,v_search)>0))
      ORDER BY d.issue_date DESC,d.id LIMIT 26 OFFSET v_page*25
    ) x;
    RETURN jsonb_build_object('documents',v_docs-25,'more',jsonb_array_length(v_docs)>25,
      'stores',v_stores,'page',v_page,'canConfigure',v_role='owner','today',v_lagos_date,
      'canReviewPayments',v_role IN ('owner','accountant'));
  END IF;

  IF p_action='customers' THEN
    v_store := coalesce(v_store,v_assigned);
    v_search := lower(golden_rose_billing.required_text(p_payload,'search',120));
    IF v_store IS NULL OR length(v_search)<2 THEN RETURN '[]'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.full_name,x.id),'[]') INTO v_docs FROM (
      SELECT id,full_name,email,phone FROM golden_rose_crm.customers
      WHERE location_id=v_store AND status='active' AND (
        strpos(lower(full_name),v_search)>0 OR strpos(lower(coalesce(email,'')),v_search)>0
        OR strpos(coalesce(phone,''),v_search)>0) ORDER BY full_name,id LIMIT 15
    ) x;
    RETURN v_docs;
  END IF;

  IF p_action='get' THEN
    SELECT d.* INTO v_doc FROM golden_rose_billing.documents d
    WHERE d.id=v_id AND (v_role='owner' OR d.location_id=v_assigned);
    IF NOT FOUND THEN RAISE EXCEPTION 'Billing document not found.' USING ERRCODE='GR404'; END IF;
    RETURN golden_rose_billing.document_summary(v_doc,true);
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('configure','save','accept','convert','issue','void','apply_pos','propose_payment','review_payment')
  THEN RAISE EXCEPTION 'Unknown billing operation.' USING ERRCODE='GR422'; END IF;

  IF (p_action IN ('configure','void') AND v_role<>'owner')
     OR (p_action='review_payment' AND v_role NOT IN ('owner','accountant'))
  THEN RAISE EXCEPTION 'Your role cannot perform this billing operation.' USING ERRCODE='GR403'; END IF;

  v_key := (p_payload->>'requestKey')::uuid;
  IF v_key IS NULL THEN RAISE EXCEPTION 'A billing request identifier is required.' USING ERRCODE='GR422'; END IF;
  v_fingerprint := sha256(convert_to(p_action||':'||(p_payload-'requestKey')::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||v_key::text, 137));
  SELECT * INTO v_prior FROM golden_rose_billing.requests WHERE actor_id=v_actor AND key=v_key;
  IF FOUND THEN
    IF v_role<>'owner' AND v_prior.location_id IS DISTINCT FROM v_assigned
    THEN RAISE EXCEPTION 'This store is outside your allocation.' USING ERRCODE='GR403'; END IF;
    IF v_prior.fingerprint<>v_fingerprint
    THEN RAISE EXCEPTION 'This billing request identifier was used for different details.' USING ERRCODE='GR409'; END IF;
    RETURN v_prior.result;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_doc FROM golden_rose_billing.documents d
      WHERE d.id=v_id AND (v_role='owner' OR d.location_id=v_assigned) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Billing document not found.' USING ERRCODE='GR404'; END IF;
    IF v_store IS NOT NULL AND v_store<>v_doc.location_id
    THEN RAISE EXCEPTION 'The saved document cannot change stores.' USING ERRCODE='GR409'; END IF;
    v_store:=v_doc.location_id;
  END IF;
  PERFORM 1 FROM golden_rose.locations WHERE id=v_store AND is_active AND location_type='store' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an active billing store.' USING ERRCODE='GR422'; END IF;
  IF p_action NOT IN ('configure','save') AND v_id IS NULL
  THEN RAISE EXCEPTION 'Save the document first.' USING ERRCODE='GR422'; END IF;

  IF p_action='configure' THEN
    IF v_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid issuer request.' USING ERRCODE='GR422'; END IF;
    INSERT INTO golden_rose_billing.issuer_profiles(location_id,identity,tax_bps,tax_basis,verified_by)
    VALUES(v_store,jsonb_build_object('name',golden_rose_billing.required_text(p_payload,'name',150,2),
      'address',golden_rose_billing.required_text(p_payload,'address',500,5),
      'contact',golden_rose_billing.required_text(p_payload,'contact',254,3),
      'taxId',golden_rose_billing.required_text(p_payload,'taxId',100)),
      golden_rose_billing.integer_field(p_payload,'taxBps',0,10000),
      golden_rose_billing.required_text(p_payload,'taxBasis',500,3),v_actor)
    ON CONFLICT (location_id) DO UPDATE SET identity=excluded.identity,tax_bps=excluded.tax_bps,
      tax_basis=excluded.tax_basis,verified_by=excluded.verified_by,verified_at=now()
    RETURNING * INTO v_profile;
    v_details:=jsonb_build_object('identity',v_profile.identity,'taxBps',v_profile.tax_bps,'taxBasis',v_profile.tax_basis);
    v_result:=jsonb_build_object('configured',true);
  ELSIF p_action='save' THEN
    v_kind:=p_payload->>'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('quotation','invoice') OR (v_id IS NOT NULL AND v_kind<>v_doc.kind)
    THEN RAISE EXCEPTION 'Invalid document type.' USING ERRCODE='GR422'; END IF;
    IF v_id IS NOT NULL AND (v_doc.state<>'draft' OR v_doc.original_quote_id IS NOT NULL OR
      golden_rose_billing.integer_field(p_payload,'revision',1,2147483647)<>v_doc.revision)
    THEN RAISE EXCEPTION 'This document cannot be edited or has changed. Reload it first.' USING ERRCODE='GR409'; END IF;
    IF coalesce(p_payload->>'issueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR coalesce(p_payload->>'dueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN RAISE EXCEPTION 'Enter valid document and due dates.' USING ERRCODE='GR422'; END IF;
    v_start:=(p_payload->>'issueDate')::date;
    v_end:=(p_payload->>'dueDate')::date;
    IF v_start>v_end THEN RAISE EXCEPTION 'The due date cannot precede the document date.' USING ERRCODE='GR422'; END IF;
    v_customer_id:=nullif(p_payload->>'customerId','')::uuid;
    IF v_customer_id IS NOT NULL THEN
      SELECT * INTO v_contact FROM golden_rose_crm.customers
        WHERE id=v_customer_id AND location_id=v_store AND status='active' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Select an active customer from this store.' USING ERRCODE='GR422'; END IF;
    END IF;
    v_customer:=jsonb_build_object(
      'recipient',coalesce(v_contact.full_name,golden_rose_billing.required_text(p_payload,'recipient',120,2)),
      'email',CASE WHEN v_customer_id IS NOT NULL THEN coalesce(v_contact.email,'') ELSE golden_rose_billing.required_text(p_payload,'email',254) END,
      'phone',CASE WHEN v_customer_id IS NOT NULL THEN coalesce(v_contact.phone,'') ELSE golden_rose_billing.required_text(p_payload,'phone',30) END,
      'company',golden_rose_billing.required_text(p_payload,'company',150),
      'address',golden_rose_billing.required_text(p_payload,'address',500));
    IF coalesce(jsonb_typeof(p_payload->'lines'),'')<>'array'
    THEN RAISE EXCEPTION 'Add at least one product or line item.' USING ERRCODE='GR422'; END IF;
    IF jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 30
    THEN RAISE EXCEPTION 'Use between 1 and 30 line items.' USING ERRCODE='GR422'; END IF;
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
      IF jsonb_typeof(v_line)<>'object' THEN RAISE EXCEPTION 'Invalid line item.' USING ERRCODE='GR422'; END IF;
      v_quantity:=golden_rose_billing.integer_field(v_line,'quantity',1,10000);
      v_variant:=nullif(v_line->>'variantId','')::uuid;
      IF v_variant IS NOT NULL THEN
        SELECT v.price_minor,v.sku,p.name,v.size_ml INTO v_product FROM golden_rose.product_variants v
          JOIN golden_rose.products p ON p.id=v.product_id WHERE v.id=v_variant
            AND v.is_active AND p.is_active AND v.currency='NGN' AND v.price_minor BETWEEN 1 AND 100000000000
            AND (v_role<>'accountant' OR p.is_published)
          FOR SHARE OF v,p;
        IF NOT FOUND THEN RAISE EXCEPTION 'A catalogue line is no longer available.' USING ERRCODE='GR422'; END IF;
        v_unit:=v_product.price_minor;
        v_line_text:=v_product.name||coalesce(' · '||v_product.size_ml||' ml','');
        v_sku:=v_product.sku;
      ELSE
        v_unit:=golden_rose_billing.integer_field(v_line,'unitPriceMinor',1,100000000000);
        v_line_text:=golden_rose_billing.required_text(v_line,'description',300,1);
        -- A custom line must not impersonate a priced catalogue SKU.
        v_sku:=golden_rose_billing.required_text(v_line,'sku',100);
        IF v_sku<>'' AND EXISTS(
          SELECT 1 FROM golden_rose.product_variants v JOIN golden_rose.products p ON p.id=v.product_id
          WHERE lower(v.sku)=lower(v_sku) AND (v_role<>'accountant' OR p.is_published))
        THEN RAISE EXCEPTION 'Select the catalogue variant instead of entering its SKU manually.' USING ERRCODE='GR422'; END IF;
      END IF;
      v_subtotal:=v_subtotal+v_quantity*v_unit;
      IF v_subtotal>100000000000000 THEN RAISE EXCEPTION 'The document subtotal is too large.' USING ERRCODE='GR422'; END IF;
      v_lines:=v_lines||jsonb_build_array(jsonb_build_object('variantId',v_variant,'description',v_line_text,
        'sku',v_sku,'quantity',v_quantity,'unitPriceMinor',v_unit,'lineTotalMinor',v_quantity*v_unit));
    END LOOP;
    v_discount:=golden_rose_billing.integer_field(p_payload,'discountMinor',0,v_subtotal-1);
    SELECT * INTO v_profile FROM golden_rose_billing.issuer_profiles WHERE location_id=v_store FOR SHARE;
    v_tax:=((v_subtotal-v_discount)*coalesce(v_profile.tax_bps,0)+5000)/10000;
    IF v_id IS NULL THEN
      INSERT INTO golden_rose_billing.documents(kind,location_id,customer_id,customer,lines,issue_date,due_date,terms,notes,
        subtotal_minor,discount_minor,tax_bps,tax_verified_at,tax_minor,created_by)
      VALUES(v_kind,v_store,v_customer_id,v_customer,v_lines,v_start,v_end,
        golden_rose_billing.required_text(p_payload,'terms',2000),golden_rose_billing.required_text(p_payload,'notes',2000),
        v_subtotal,v_discount,v_profile.tax_bps,v_profile.verified_at,v_tax,v_actor) RETURNING * INTO v_doc;
    ELSE
      UPDATE golden_rose_billing.documents SET customer_id=v_customer_id,customer=v_customer,lines=v_lines,issue_date=v_start,
        due_date=v_end,terms=golden_rose_billing.required_text(p_payload,'terms',2000),
        notes=golden_rose_billing.required_text(p_payload,'notes',2000),
        subtotal_minor=v_subtotal,discount_minor=v_discount,tax_bps=v_profile.tax_bps,tax_verified_at=v_profile.verified_at,
        tax_minor=v_tax,revision=revision+1,updated_at=now()
      WHERE id=v_id RETURNING * INTO v_doc;
    END IF;
    v_details:=jsonb_build_object('revision',v_doc.revision,'totalMinor',v_doc.total_minor);
  ELSIF p_action='accept' OR p_action='issue' THEN
    IF (p_action='accept' AND v_doc.kind<>'quotation') OR (p_action='issue' AND v_doc.kind<>'invoice')
    THEN RAISE EXCEPTION 'The document type cannot perform this action.' USING ERRCODE='GR409'; END IF;
    IF (p_action='accept' AND v_doc.state='accepted') OR (p_action='issue' AND v_doc.state='issued') THEN
      v_audit_action:=p_action||'_replay';
    ELSE
      IF v_doc.state<>'draft' OR golden_rose_billing.integer_field(p_payload,'revision',1,2147483647)<>v_doc.revision
      THEN RAISE EXCEPTION 'This draft has changed. Reload it first.' USING ERRCODE='GR409'; END IF;
      SELECT * INTO v_profile FROM golden_rose_billing.issuer_profiles WHERE location_id=v_store FOR SHARE;
      IF NOT FOUND OR v_profile.tax_bps IS DISTINCT FROM v_doc.tax_bps OR
        (v_doc.original_quote_id IS NULL AND v_profile.verified_at IS DISTINCT FROM v_doc.tax_verified_at)
      THEN RAISE EXCEPTION 'Verify the store issuer and tax setting and save the draft again before finalizing.' USING ERRCODE='GR409'; END IF;
      IF p_action='accept' THEN
        IF v_doc.due_date<v_lagos_date
        THEN RAISE EXCEPTION 'This quotation has expired. Update it before recording acceptance.' USING ERRCODE='GR422'; END IF;
        v_reason:=golden_rose_billing.required_text(p_payload,'reason',500,3);
        UPDATE golden_rose_billing.documents SET state='accepted',
          issuer=v_profile.identity||jsonb_build_object('taxBasis',v_profile.tax_basis),
          revision=revision+1,updated_at=now() WHERE id=v_id RETURNING * INTO v_doc;
        v_details:=jsonb_build_object('acceptanceReference',v_reason);
      ELSE
        IF v_doc.due_date<v_lagos_date
        THEN RAISE EXCEPTION 'The due date cannot precede the invoice issuance date.' USING ERRCODE='GR422'; END IF;
        UPDATE golden_rose_billing.invoice_counter SET last_number=last_number+1 WHERE singleton RETURNING last_number INTO v_number;
        UPDATE golden_rose_billing.documents SET state='issued',
          issuer=v_profile.identity||jsonb_build_object('taxBasis',v_profile.tax_basis),
          tax_verified_at=v_profile.verified_at,invoice_number=v_number,
          issue_date=v_lagos_date,issued_at=now(),revision=revision+1,updated_at=now()
          WHERE id=v_id RETURNING * INTO v_doc;
        v_details:=jsonb_build_object('invoiceNumber',v_number,'originalQuoteId',v_doc.original_quote_id);
      END IF;
    END IF;
  ELSIF p_action='convert' THEN
    IF v_doc.kind<>'quotation' OR v_doc.state<>'accepted'
    THEN RAISE EXCEPTION 'Only an accepted quotation can be converted.' USING ERRCODE='GR409'; END IF;
    SELECT d.* INTO v_doc FROM golden_rose_billing.documents d WHERE d.original_quote_id=v_id;
    IF FOUND THEN
      v_audit_action:='convert_replay';
    ELSE
      IF coalesce(p_payload->>'dueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN RAISE EXCEPTION 'Select the invoice payment due date.' USING ERRCODE='GR422'; END IF;
      v_end:=(p_payload->>'dueDate')::date;
      IF v_end<v_lagos_date THEN RAISE EXCEPTION 'The invoice due date cannot be in the past.' USING ERRCODE='GR422'; END IF;
      INSERT INTO golden_rose_billing.documents(kind,location_id,customer_id,original_quote_id,customer,lines,
        issue_date,due_date,terms,notes,subtotal_minor,discount_minor,tax_bps,tax_verified_at,tax_minor,created_by)
      SELECT 'invoice',location_id,customer_id,id,customer,lines,v_lagos_date,
        v_end,terms,notes,subtotal_minor,discount_minor,tax_bps,tax_verified_at,tax_minor,v_actor
      FROM golden_rose_billing.documents WHERE id=v_id RETURNING * INTO v_doc;
    END IF;
    v_details:=jsonb_build_object('originalQuoteId',v_id);
  ELSE
    IF v_doc.kind<>'invoice' OR v_doc.state<>'issued'
    THEN RAISE EXCEPTION 'Select an issued invoice.' USING ERRCODE='GR409'; END IF;
    SELECT coalesce(sum(amount_minor),0) INTO v_paid FROM golden_rose_billing.payments
      WHERE document_id=v_id AND status='verified';
    IF p_action='void' THEN
      IF v_paid>0 OR EXISTS(SELECT 1 FROM golden_rose_billing.payments WHERE document_id=v_id AND status='pending')
      THEN RAISE EXCEPTION 'Resolve all payments before voiding. Verified payments require a separate credit process.'
        USING ERRCODE='GR409'; END IF;
      v_reason:=golden_rose_billing.required_text(p_payload,'reason',500,3);
      UPDATE golden_rose_billing.documents SET state='voided',revision=revision+1,updated_at=now()
        WHERE id=v_id RETURNING * INTO v_doc;
      v_details:=jsonb_build_object('reason',v_reason);
    ELSIF p_action='apply_pos' THEN
      v_number:=golden_rose_billing.integer_field(p_payload,'receiptNumber',1,999999999999999);
      SELECT * INTO v_pos FROM golden_rose.pos_sales WHERE sale_number=v_number AND location_id=v_store
        AND status='completed' AND currency=v_doc.currency FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'No completed POS receipt with that number exists in this store.' USING ERRCODE='GR404'; END IF;
      IF EXISTS(SELECT 1 FROM golden_rose_billing.payments WHERE pos_sale_id=v_pos.id)
      THEN RAISE EXCEPTION 'That POS receipt has already been allocated.' USING ERRCODE='GR409'; END IF;
      IF v_pos.total_minor>v_doc.total_minor-v_paid
      THEN RAISE EXCEPTION 'The POS receipt exceeds the outstanding invoice balance.' USING ERRCODE='GR409'; END IF;
      INSERT INTO golden_rose_billing.payments(document_id,location_id,source,reference,pos_sale_id,amount_minor,status,
        submitted_by,reviewed_by,reviewed_at)
      VALUES(v_id,v_store,'pos','POS '||v_number,v_pos.id,v_pos.total_minor,'verified',v_actor,v_actor,now())
      RETURNING * INTO v_payment;
    ELSIF p_action='propose_payment' THEN
      v_amount:=golden_rose_billing.integer_field(p_payload,'amountMinor',1,100000000000000);
      IF v_amount>v_doc.total_minor-v_paid
      THEN RAISE EXCEPTION 'The proposed payment exceeds the outstanding balance.' USING ERRCODE='GR409'; END IF;
      v_reference:=golden_rose_billing.required_text(p_payload,'reference',120,3);
      INSERT INTO golden_rose_billing.payments(document_id,location_id,source,reference,evidence,amount_minor,status,submitted_by)
      VALUES(v_id,v_store,'offline',v_reference,golden_rose_billing.required_text(p_payload,'evidence',500,10),
        v_amount,'pending',v_actor) RETURNING * INTO v_payment;
    ELSIF p_action='review_payment' THEN
      SELECT * INTO v_payment FROM golden_rose_billing.payments
        WHERE id=(p_payload->>'paymentId')::uuid AND document_id=v_id AND source='offline' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Payment evidence not found.' USING ERRCODE='GR404'; END IF;
      v_state:=p_payload->>'decision';
      IF v_state IS NULL OR v_state NOT IN ('verified','rejected')
      THEN RAISE EXCEPTION 'Select a valid review decision.' USING ERRCODE='GR422'; END IF;
      IF v_payment.status<>'pending' OR v_payment.submitted_by=v_actor
      THEN RAISE EXCEPTION 'A different authorized reviewer must review pending evidence.' USING ERRCODE='GR409'; END IF;
      IF v_state='verified' AND v_payment.amount_minor>v_doc.total_minor-v_paid
      THEN RAISE EXCEPTION 'Payment verification would overpay this invoice.' USING ERRCODE='GR409'; END IF;
      UPDATE golden_rose_billing.payments SET status=v_state,reviewed_by=v_actor,reviewed_at=now(),
        review_note=golden_rose_billing.required_text(p_payload,'reason',500,3)
      WHERE id=v_payment.id RETURNING * INTO v_payment;
    END IF;
    IF v_payment.id IS NOT NULL THEN
      v_details:=jsonb_build_object('paymentId',v_payment.id,'status',v_payment.status,'amountMinor',v_payment.amount_minor,
        'source',v_payment.source,'reference',v_payment.reference);
    END IF;
  END IF;

  IF v_result IS NULL THEN v_result:=golden_rose_billing.document_summary(v_doc,true); END IF;
  INSERT INTO golden_rose_billing.events(location_id,actor_id,document_id,request_key,action,details)
  VALUES(v_store,v_actor,v_doc.id,v_key,v_audit_action,v_details);
  INSERT INTO golden_rose_billing.requests(actor_id,key,location_id,fingerprint,result)
  VALUES(v_actor,v_key,v_store,v_fingerprint,v_result);
  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range
  THEN RAISE EXCEPTION 'A billing identifier, date or amount is invalid.' USING ERRCODE='GR422';
  WHEN unique_violation
  THEN RAISE EXCEPTION 'This billing record or payment reference has already been used.' USING ERRCODE='GR409';
END;
$fn$;

-- PostgREST sees only the invoker wrapper. The private definer enforces all access.
CREATE FUNCTION public.gr_billing(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
  SELECT golden_rose_billing.command(p_action,p_payload);
$fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA golden_rose_billing FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gr_billing(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION golden_rose_billing.command(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gr_billing(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
