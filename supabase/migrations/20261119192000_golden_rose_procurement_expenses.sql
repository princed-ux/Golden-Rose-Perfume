
BEGIN;

CREATE SCHEMA IF NOT EXISTS golden_rose_ops;
REVOKE ALL ON SCHEMA golden_rose_ops
FROM PUBLIC, anon, authenticated;

CREATE TABLE golden_rose_ops.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
    CHECK (length(btrim(name)) BETWEEN 2 AND 150),
  contact_name text NOT NULL DEFAULT ''
    CHECK (length(contact_name) <= 120),
  email text NOT NULL DEFAULT ''
    CHECK (length(email) <= 254),
  phone text NOT NULL DEFAULT ''
    CHECK (length(phone) <= 40),
  address text NOT NULL DEFAULT ''
    CHECK (length(address) <= 300),
  terms_days integer NOT NULL DEFAULT 0
    CHECK (terms_days BETWEEN 0 AND 365),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gr_supplier_name_unique
ON golden_rose_ops.suppliers (lower(btrim(name)));

CREATE TABLE golden_rose_ops.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES golden_rose_ops.suppliers(id),
  location_id uuid NOT NULL
    REFERENCES golden_rose.locations(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'approved',
      'partially_received', 'received', 'cancelled'
    )),
  note text NOT NULL DEFAULT ''
    CHECK (length(note) <= 500),
  expected_date date,
  total_minor bigint NOT NULL DEFAULT 0
    CHECK (total_minor BETWEEN 0 AND 900000000000000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX gr_po_location_created
ON golden_rose_ops.purchase_orders (
  location_id, created_at DESC
);

CREATE TABLE golden_rose_ops.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL
    REFERENCES golden_rose_ops.purchase_orders(id),
  variant_id uuid NOT NULL
    REFERENCES golden_rose.product_variants(id),
  sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL
    CHECK (quantity BETWEEN 1 AND 100000),
  received_quantity integer NOT NULL DEFAULT 0
    CHECK (
      received_quantity >= 0
      AND received_quantity <= quantity
    ),
  unit_cost_minor bigint NOT NULL
    CHECK (unit_cost_minor BETWEEN 1 AND 900000000000),
  UNIQUE (purchase_id, variant_id)
);

CREATE TABLE golden_rose_ops.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  line_id uuid NOT NULL
    REFERENCES golden_rose_ops.purchase_lines(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  movement_id uuid NOT NULL UNIQUE
    REFERENCES golden_rose.stock_movements(id),
  received_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE golden_rose_ops.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL
    REFERENCES golden_rose.locations(id),
  category text NOT NULL
    CHECK (length(btrim(category)) BETWEEN 2 AND 60),
  description text NOT NULL
    CHECK (length(btrim(description)) BETWEEN 3 AND 500),
  expense_date date NOT NULL,
  amount_minor bigint NOT NULL
    CHECK (amount_minor BETWEEN 1 AND 900000000000000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'approved', 'recorded_paid', 'voided'
    )),
  payment_reference text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  paid_recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_recorded_at timestamptz
);

CREATE INDEX gr_expenses_location_date
ON golden_rose_ops.expenses (
  location_id, expense_date DESC
);

CREATE TABLE golden_rose_ops.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE golden_rose_ops.suppliers
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_ops.purchase_orders
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_ops.purchase_lines
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_ops.purchase_receipts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_ops.expenses
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose_ops.audit
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA golden_rose_ops
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA golden_rose_ops
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gr_operations(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_session_text text := auth.jwt()->>'session_id';
  v_session uuid;
  v_role text;
  v_assigned uuid;
  v_supplier golden_rose_ops.suppliers%ROWTYPE;
  v_po golden_rose_ops.purchase_orders%ROWTYPE;
  v_line golden_rose_ops.purchase_lines%ROWTYPE;
  v_expense golden_rose_ops.expenses%ROWTYPE;
  v_id uuid;
  v_location uuid;
  v_key uuid;
  v_receipt golden_rose_ops.purchase_receipts%ROWTYPE;
  v_qty integer;
  v_total bigint := 0;
  v_price bigint;
  v_sku text;
  v_item jsonb;
  v_items jsonb;
  v_variants integer;
  v_variant uuid;
  v_product text;
  v_movement uuid;
  v_supplier_json jsonb;
  v_po_json jsonb;
  v_expenses_json jsonb;
  v_locations_json jsonb;
  v_allowed boolean;
BEGIN
  IF v_actor IS NULL OR coalesce(v_session_text,'') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Active employee login required'
      USING ERRCODE='42501';
  END IF;

  v_session := v_session_text::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions
    WHERE id=v_session AND user_id=v_actor
  ) THEN
    RAISE EXCEPTION 'Session expired'
      USING ERRCODE='42501';
  END IF;

  SELECT s.role, s.location_id
  INTO v_role, v_assigned
  FROM golden_rose.staff_members s
  JOIN auth.users u ON u.id=s.user_id
  WHERE s.user_id=v_actor
    AND s.status='active'
    AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL
    AND (
      u.banned_until IS NULL
      OR u.banned_until<=now()
    )
  FOR SHARE OF s;

  IF v_role NOT IN (
    'owner', 'manager', 'inventory_staff', 'accountant'
  ) OR v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE='42501';
  END IF;

  IF v_role<>'owner' AND (
    v_assigned IS NULL OR NOT EXISTS (
      SELECT 1 FROM golden_rose.locations
      WHERE id=v_assigned AND is_active
    )
  ) THEN
    RAISE EXCEPTION 'Active location assignment required'
      USING ERRCODE='42501';
  END IF;

  IF to_regprocedure(
    'public.gr_employee_session_allowed(uuid,uuid)'
  ) IS NOT NULL THEN
    EXECUTE
      'SELECT public.gr_employee_session_allowed($1,$2)'
    INTO v_allowed
    USING v_actor,v_session;

    IF v_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Employee password reset required'
        USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_payload IS NULL
    OR jsonb_typeof(p_payload)<>'object'
    OR octet_length(p_payload::text)>50000
  THEN
    RAISE EXCEPTION 'Invalid request'
      USING ERRCODE='22023';
  END IF;

  IF p_action='list' THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'name',s.name,
          'contactName',s.contact_name,
          'email',s.email,
          'phone',s.phone,
          'address',s.address,
          'termsDays',s.terms_days,
          'active',s.active
        )
        ORDER BY s.name,s.id
      ),
      '[]'::jsonb
    )
    INTO v_supplier_json
    FROM golden_rose_ops.suppliers s;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',l.id,
          'name',l.name,
          'type',l.location_type
        )
        ORDER BY l.name,l.id
      ),
      '[]'::jsonb
    )
    INTO v_locations_json
    FROM golden_rose.locations l
    WHERE l.is_active
      AND (
        v_role='owner'
        OR l.id=v_assigned
      );

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',po.id,
          'supplierId',po.supplier_id,
          'supplierName',s.name,
          'locationId',po.location_id,
          'locationName',loc.name,
          'status',po.status,
          'totalMinor',po.total_minor,
          'note',po.note,
          'expectedDate',po.expected_date,
          'createdAt',po.created_at,
          'lines',(
            SELECT coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id',pl.id,
                  'sku',pl.sku,
                  'productName',pl.product_name,
                  'quantity',pl.quantity,
                  'receivedQuantity',pl.received_quantity,
                  'unitCostMinor',pl.unit_cost_minor
                )
                ORDER BY pl.sku,pl.id
              ),
              '[]'::jsonb
            )
            FROM golden_rose_ops.purchase_lines pl
            WHERE pl.purchase_id=po.id
          )
        )
        ORDER BY po.created_at DESC,po.id
      ),
      '[]'::jsonb
    )
    INTO v_po_json
    FROM golden_rose_ops.purchase_orders po
    JOIN golden_rose_ops.suppliers s
      ON s.id=po.supplier_id
    JOIN golden_rose.locations loc
      ON loc.id=po.location_id
    WHERE v_role='owner'
      OR po.location_id=v_assigned;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',e.id,
          'locationId',e.location_id,
          'locationName',loc.name,
          'category',e.category,
          'description',e.description,
          'expenseDate',e.expense_date,
          'amountMinor',e.amount_minor,
          'status',e.status,
          'paymentReference',e.payment_reference,
          'createdAt',e.created_at
        )
        ORDER BY e.expense_date DESC,e.id
      ),
      '[]'::jsonb
    )
    INTO v_expenses_json
    FROM golden_rose_ops.expenses e
    JOIN golden_rose.locations loc
      ON loc.id=e.location_id
    WHERE v_role='owner'
      OR e.location_id=v_assigned;

    RETURN jsonb_build_object(
      'suppliers',v_supplier_json,
      'purchases',v_po_json,
      'expenses',v_expenses_json,
      'locations',v_locations_json
    );
  END IF;

  IF p_action='supplier.save' THEN
    IF v_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION 'Supplier updates require a manager'
        USING ERRCODE='42501';
    END IF;

    IF length(btrim(coalesce(p_payload->>'name','')))
        NOT BETWEEN 2 AND 150
      OR length(coalesce(p_payload->>'contactName',''))>120
      OR length(coalesce(p_payload->>'email',''))>254
      OR length(coalesce(p_payload->>'phone',''))>40
      OR length(coalesce(p_payload->>'address',''))>300
      OR coalesce(p_payload->>'termsDays','')
        !~ '^[0-9]{1,3}$'
      OR (p_payload->>'termsDays')::int>365
    THEN
      RAISE EXCEPTION 'Invalid supplier details'
        USING ERRCODE='22023';
    END IF;

    v_id:=nullif(p_payload->>'id','')::uuid;

    IF v_id IS NULL THEN
      INSERT INTO golden_rose_ops.suppliers(
        name,contact_name,email,phone,address,
        terms_days,created_by
      )
      VALUES (
        btrim(p_payload->>'name'),
        btrim(coalesce(p_payload->>'contactName','')),
        btrim(coalesce(p_payload->>'email','')),
        btrim(coalesce(p_payload->>'phone','')),
        btrim(coalesce(p_payload->>'address','')),
        (p_payload->>'termsDays')::integer,
        v_actor
      )
      RETURNING id INTO v_id;
    ELSE
      UPDATE golden_rose_ops.suppliers
      SET name=btrim(p_payload->>'name'),
        contact_name=btrim(
          coalesce(p_payload->>'contactName','')
        ),
        email=btrim(coalesce(p_payload->>'email','')),
        phone=btrim(coalesce(p_payload->>'phone','')),
        address=btrim(coalesce(p_payload->>'address','')),
        terms_days=(p_payload->>'termsDays')::int,
        updated_at=now()
      WHERE id=v_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found'
          USING ERRCODE='P0002';
      END IF;
    END IF;

  ELSIF p_action='supplier.toggle' THEN
    IF v_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION 'Supplier updates require a manager'
        USING ERRCODE='42501';
    END IF;

    v_id:=(p_payload->>'id')::uuid;

    UPDATE golden_rose_ops.suppliers
    SET active=(p_payload->>'active')::boolean,
      updated_at=now()
    WHERE id=v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Supplier not found'
        USING ERRCODE='P0002';
    END IF;

  ELSIF p_action='purchase.create' THEN
    IF v_role NOT IN (
      'owner','manager','inventory_staff'
    ) THEN
      RAISE EXCEPTION 'Purchasing is restricted'
        USING ERRCODE='42501';
    END IF;

    v_location:=(p_payload->>'locationId')::uuid;

    IF v_role<>'owner'
      AND v_location IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM golden_rose.locations
      WHERE id=v_location AND is_active
    ) THEN
      RAISE EXCEPTION 'Location unavailable'
        USING ERRCODE='22023';
    END IF;

    SELECT * INTO v_supplier
    FROM golden_rose_ops.suppliers
    WHERE id=(p_payload->>'supplierId')::uuid
      AND active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose an active supplier'
        USING ERRCODE='22023';
    END IF;

    v_items:=p_payload->'lines';

    IF jsonb_typeof(v_items) IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 40
    THEN
      RAISE EXCEPTION 'Order requires 1-40 product lines'
        USING ERRCODE='22023';
    END IF;

    IF length(coalesce(p_payload->>'note',''))>500 THEN
      RAISE EXCEPTION 'Order note too long'
        USING ERRCODE='22023';
    END IF;

    INSERT INTO golden_rose_ops.purchase_orders(
      supplier_id,location_id,note,expected_date,created_by
    )
    VALUES (
      v_supplier.id,
      v_location,
      btrim(coalesce(p_payload->>'note','')),
      nullif(p_payload->>'expectedDate','')::date,
      v_actor
    )
    RETURNING id INTO v_id;

    FOR v_item IN
      SELECT value FROM jsonb_array_elements(v_items)
    LOOP
      v_sku:=btrim(coalesce(v_item->>'sku',''));

      IF length(v_sku) NOT BETWEEN 1 AND 100
        OR coalesce(v_item->>'quantity','')
          !~ '^[1-9][0-9]{0,5}$'
        OR coalesce(v_item->>'unitCostMinor','')
          !~ '^[1-9][0-9]{0,11}$'
      THEN
        RAISE EXCEPTION 'Invalid SKU, quantity or price'
          USING ERRCODE='22023';
      END IF;

      v_qty:=(v_item->>'quantity')::integer;
      v_price:=(v_item->>'unitCostMinor')::bigint;

      IF v_qty>100000 THEN
        RAISE EXCEPTION 'Quantity too large'
          USING ERRCODE='22023';
      END IF;

      SELECT
        count(*),
        min(v.id::text)::uuid,
        min(p.name)
      INTO v_variants,v_variant,v_product
      FROM golden_rose.product_variants v
      JOIN golden_rose.products p
        ON p.id=v.product_id
      WHERE lower(v.sku)=lower(v_sku)
        AND v.is_active
        AND p.is_active;

      IF v_variants<>1 THEN
        RAISE EXCEPTION
          'SKU not found or ambiguous: %',v_sku
          USING ERRCODE='22023';
      END IF;

      INSERT INTO golden_rose_ops.purchase_lines(
        purchase_id,variant_id,sku,product_name,
        quantity,unit_cost_minor
      )
      VALUES (
        v_id,v_variant,v_sku,v_product,v_qty,v_price
      );

      v_total:=v_total+v_qty::bigint*v_price;

      IF v_total>900000000000000 THEN
        RAISE EXCEPTION 'Order total too large'
          USING ERRCODE='22023';
      END IF;
    END LOOP;

    UPDATE golden_rose_ops.purchase_orders
    SET total_minor=v_total
    WHERE id=v_id;

  ELSIF p_action='purchase.approve' THEN
    IF v_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION
        'Purchase approval requires a manager'
        USING ERRCODE='42501';
    END IF;

    v_id:=(p_payload->>'id')::uuid;

    SELECT * INTO v_po
    FROM golden_rose_ops.purchase_orders
    WHERE id=v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase not found'
        USING ERRCODE='P0002';
    END IF;

    IF v_role<>'owner'
      AND v_po.location_id IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF v_po.status<>'draft' THEN
      RAISE EXCEPTION 'Only draft orders can be approved'
        USING ERRCODE='22023';
    END IF;

    UPDATE golden_rose_ops.purchase_orders
    SET status='approved',
      approved_by=v_actor,
      approved_at=now()
    WHERE id=v_id;

  ELSIF p_action='purchase.receive' THEN
    IF v_role NOT IN (
      'owner','manager','inventory_staff'
    ) THEN
      RAISE EXCEPTION 'Stock receiving restricted'
        USING ERRCODE='42501';
    END IF;

    v_id:=(p_payload->>'lineId')::uuid;
    v_qty:=(p_payload->>'quantity')::integer;
    v_key:=(p_payload->>'requestKey')::uuid;

    IF v_key IS NULL
      OR v_qty NOT BETWEEN 1 AND 100000
    THEN
      RAISE EXCEPTION 'Invalid receipt'
        USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_key::text,0)
    );

    SELECT * INTO v_receipt
    FROM golden_rose_ops.purchase_receipts
    WHERE request_key=v_key;

    IF FOUND THEN
      IF v_receipt.line_id<>v_id
        OR v_receipt.quantity<>v_qty
        OR v_receipt.received_by<>v_actor
      THEN
        RAISE EXCEPTION 'Receipt key reused'
          USING ERRCODE='22023';
      END IF;

      RETURN jsonb_build_object(
        'ok',true,
        'receiptId',v_receipt.id,
        'replayed',true
      );
    END IF;

    SELECT * INTO v_line
    FROM golden_rose_ops.purchase_lines
    WHERE id=v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase line not found'
        USING ERRCODE='P0002';
    END IF;

    SELECT * INTO v_po
    FROM golden_rose_ops.purchase_orders
    WHERE id=v_line.purchase_id
    FOR UPDATE;

    IF v_role<>'owner'
      AND v_po.location_id IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF v_po.status NOT IN (
      'approved','partially_received'
    ) OR v_qty>v_line.quantity-v_line.received_quantity
    THEN
      RAISE EXCEPTION
        'Receipt exceeds outstanding purchase quantity'
        USING ERRCODE='22023';
    END IF;

    v_movement:=golden_rose.receive_stock(
      v_actor,
      v_line.variant_id,
      v_po.location_id,
      v_qty,
      'grpo:'||v_key::text,
      'purchase_order',
      v_po.id::text,
      'PO line '||v_line.id::text
    );

    INSERT INTO golden_rose_ops.purchase_receipts(
      request_key,line_id,quantity,movement_id,received_by
    )
    VALUES (
      v_key,v_id,v_qty,v_movement,v_actor
    );

    UPDATE golden_rose_ops.purchase_lines
    SET received_quantity=received_quantity+v_qty
    WHERE id=v_id;

    UPDATE golden_rose_ops.purchase_orders
    SET status=CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM golden_rose_ops.purchase_lines
        WHERE purchase_id=v_po.id
          AND received_quantity<quantity
      ) THEN 'received'
      ELSE 'partially_received'
    END
    WHERE id=v_po.id;

  ELSIF p_action='expense.create' THEN
    IF v_role NOT IN ('owner','manager','accountant')
    THEN
      RAISE EXCEPTION 'Expense access restricted'
        USING ERRCODE='42501';
    END IF;

    v_location:=(p_payload->>'locationId')::uuid;

    IF v_role<>'owner'
      AND v_location IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM golden_rose.locations
      WHERE id=v_location AND is_active
    ) THEN
      RAISE EXCEPTION 'Location unavailable'
        USING ERRCODE='22023';
    END IF;

    IF length(btrim(coalesce(p_payload->>'category','')))
        NOT BETWEEN 2 AND 60
      OR length(
        btrim(coalesce(p_payload->>'description',''))
      ) NOT BETWEEN 3 AND 500
      OR coalesce(p_payload->>'amountMinor','')
        !~ '^[1-9][0-9]{0,14}$'
      OR nullif(p_payload->>'expenseDate','') IS NULL
    THEN
      RAISE EXCEPTION 'Invalid expense'
        USING ERRCODE='22023';
    END IF;

    INSERT INTO golden_rose_ops.expenses(
      location_id,category,description,
      expense_date,amount_minor,created_by
    )
    VALUES (
      v_location,
      btrim(p_payload->>'category'),
      btrim(p_payload->>'description'),
      (p_payload->>'expenseDate')::date,
      (p_payload->>'amountMinor')::bigint,
      v_actor
    )
    RETURNING id INTO v_id;

  ELSIF p_action='expense.approve' THEN
    IF v_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION 'Expense approval restricted'
        USING ERRCODE='42501';
    END IF;

    v_id:=(p_payload->>'id')::uuid;

    SELECT * INTO v_expense
    FROM golden_rose_ops.expenses
    WHERE id=v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense not found'
        USING ERRCODE='P0002';
    END IF;

    IF v_role<>'owner'
      AND v_expense.location_id IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF v_expense.status<>'pending' THEN
      RAISE EXCEPTION 'Expense already reviewed'
        USING ERRCODE='22023';
    END IF;

    UPDATE golden_rose_ops.expenses
    SET status='approved',
      approved_by=v_actor,
      approved_at=now()
    WHERE id=v_id;

  ELSIF p_action='expense.record_paid' THEN
    IF v_role NOT IN ('owner','accountant') THEN
      RAISE EXCEPTION
        'Only owner/accountant can record payment'
        USING ERRCODE='42501';
    END IF;

    v_id:=(p_payload->>'id')::uuid;

    SELECT * INTO v_expense
    FROM golden_rose_ops.expenses
    WHERE id=v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense not found'
        USING ERRCODE='P0002';
    END IF;

    IF v_role<>'owner'
      AND v_expense.location_id IS DISTINCT FROM v_assigned
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE='42501';
    END IF;

    IF v_expense.status<>'approved'
      OR length(
        btrim(coalesce(p_payload->>'reference',''))
      ) NOT BETWEEN 5 AND 120
    THEN
      RAISE EXCEPTION
        'Approved expense and real payment reference required'
        USING ERRCODE='22023';
    END IF;

    UPDATE golden_rose_ops.expenses
    SET status='recorded_paid',
      payment_reference=btrim(p_payload->>'reference'),
      paid_recorded_by=v_actor,
      paid_recorded_at=now()
    WHERE id=v_id;

  ELSE
    RAISE EXCEPTION 'Unsupported operation'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO golden_rose_ops.audit(
    actor,action,subject_id
  )
  VALUES (
    v_actor,p_action,v_id
  );

  RETURN jsonb_build_object(
    'ok',true,
    'id',v_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.gr_operations(text,jsonb)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.gr_operations(text,jsonb)
TO authenticated;

COMMIT;
