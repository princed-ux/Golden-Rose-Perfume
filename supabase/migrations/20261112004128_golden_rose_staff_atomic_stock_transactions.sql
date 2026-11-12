
-- Golden Rose Platform: Staff authorization + atomic inventory receiving and sales.
BEGIN;

CREATE TABLE golden_rose.staff_members (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner','manager','cashier','inventory_staff','sales_staff','accountant')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_members_role_idx ON golden_rose.staff_members(role) WHERE status = 'active';
ALTER TABLE golden_rose.staff_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE golden_rose.staff_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE golden_rose.staff_members TO service_role;

-- Functions remain private; only service_role can execute the public API wrappers.
CREATE FUNCTION golden_rose.receive_stock(
    p_actor_id uuid,
    p_variant_id uuid,
    p_location_id uuid,
    p_quantity integer,
    p_idempotency_key text,
    p_reference_type text DEFAULT 'receiving',
    p_reference_id text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_existing golden_rose.stock_movements%ROWTYPE;
  v_after integer;
  v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_variant_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'actor, variant, and location are required' USING ERRCODE='22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'receiving quantity must be 1..1000000' USING ERRCODE='22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 OR length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE='22023';
  END IF;

  SELECT role INTO v_role FROM golden_rose.staff_members
   WHERE user_id=p_actor_id AND status='active'
   FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','inventory_staff') THEN
    RAISE EXCEPTION 'staff member may not receive stock' USING ERRCODE='42501';
  END IF;

  -- Serializes equal-key retries; unique index remains final safety net.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  SELECT * INTO v_existing FROM golden_rose.stock_movements
   WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.movement_type <> 'receiving'
       OR v_existing.performed_by IS DISTINCT FROM p_actor_id
       OR v_existing.variant_id <> p_variant_id
       OR v_existing.location_id <> p_location_id
       OR v_existing.quantity_delta <> p_quantity
       OR v_existing.reference_type IS DISTINCT FROM p_reference_type
       OR v_existing.reference_id IS DISTINCT FROM p_reference_id THEN
      RAISE EXCEPTION 'idempotency key reused for a different transaction' USING ERRCODE='22023';
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO golden_rose.stock_balances(variant_id,location_id,on_hand,reserved)
  VALUES (p_variant_id,p_location_id,0,0)
  ON CONFLICT(variant_id,location_id) DO NOTHING;

  UPDATE golden_rose.stock_balances
     SET on_hand=on_hand+p_quantity,
         updated_at=now()
   WHERE variant_id=p_variant_id AND location_id=p_location_id
   RETURNING on_hand INTO v_after;

  INSERT INTO golden_rose.stock_movements
  (variant_id,location_id,movement_type,quantity_delta,balance_after,
   reference_type,reference_id,idempotency_key,performed_by,notes)
  VALUES
  (p_variant_id,p_location_id,'receiving',p_quantity,v_after,
   p_reference_type,p_reference_id,p_idempotency_key,p_actor_id,p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION golden_rose.sell_stock(
    p_actor_id uuid,
    p_variant_id uuid,
    p_location_id uuid,
    p_quantity integer,
    p_idempotency_key text,
    p_reference_type text DEFAULT 'pos_sale',
    p_reference_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_existing golden_rose.stock_movements%ROWTYPE;
  v_after integer;
  v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_variant_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'actor, variant, and location are required' USING ERRCODE='22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'sale quantity must be 1..1000000' USING ERRCODE='22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 OR length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE='22023';
  END IF;

  SELECT role INTO v_role FROM golden_rose.staff_members
   WHERE user_id=p_actor_id AND status='active'
   FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('owner','manager','cashier','sales_staff') THEN
    RAISE EXCEPTION 'staff member may not sell stock' USING ERRCODE='42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  SELECT * INTO v_existing FROM golden_rose.stock_movements
   WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.movement_type <> 'sale'
       OR v_existing.performed_by IS DISTINCT FROM p_actor_id
       OR v_existing.variant_id <> p_variant_id
       OR v_existing.location_id <> p_location_id
       OR v_existing.quantity_delta <> -p_quantity
       OR v_existing.reference_type IS DISTINCT FROM p_reference_type
       OR v_existing.reference_id IS DISTINCT FROM p_reference_id THEN
      RAISE EXCEPTION 'idempotency key reused for a different transaction' USING ERRCODE='22023';
    END IF;
    RETURN v_existing.id;
  END IF;

  -- PostgreSQL row locks the balance until transaction completion.
  -- The quantity predicate is evaluated against the current locked row.
  UPDATE golden_rose.stock_balances
     SET on_hand=on_hand-p_quantity,
         updated_at=now()
   WHERE variant_id=p_variant_id AND location_id=p_location_id
     AND (on_hand-reserved)>=p_quantity
   RETURNING on_hand INTO v_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient available stock' USING ERRCODE='23514';
  END IF;

  INSERT INTO golden_rose.stock_movements
  (variant_id,location_id,movement_type,quantity_delta,balance_after,
   reference_type,reference_id,idempotency_key,performed_by)
  VALUES
  (p_variant_id,p_location_id,'sale',-p_quantity,v_after,
   p_reference_type,p_reference_id,p_idempotency_key,p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION golden_rose.receive_stock(uuid,uuid,uuid,integer,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION golden_rose.sell_stock(uuid,uuid,uuid,integer,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION golden_rose.receive_stock(uuid,uuid,uuid,integer,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION golden_rose.sell_stock(uuid,uuid,uuid,integer,text,text,text) TO service_role;

-- PostgREST exposes public by default. These wrappers are callable by service_role ONLY.
-- They use invoker permissions and do not permit a browser publishable key.
CREATE FUNCTION public.gr_receive_stock(
    p_actor_id uuid, p_variant_id uuid, p_location_id uuid, p_quantity integer,
    p_idempotency_key text, p_reference_type text DEFAULT 'receiving',
    p_reference_id text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT golden_rose.receive_stock(
    p_actor_id,p_variant_id,p_location_id,p_quantity,
    p_idempotency_key,p_reference_type,p_reference_id,p_notes);
$$;
CREATE FUNCTION public.gr_sell_stock(
    p_actor_id uuid, p_variant_id uuid, p_location_id uuid, p_quantity integer,
    p_idempotency_key text, p_reference_type text DEFAULT 'pos_sale',
    p_reference_id text DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT golden_rose.sell_stock(
    p_actor_id,p_variant_id,p_location_id,p_quantity,
    p_idempotency_key,p_reference_type,p_reference_id);
$$;

REVOKE ALL ON FUNCTION public.gr_receive_stock(uuid,uuid,uuid,integer,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gr_sell_stock(uuid,uuid,uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_receive_stock(uuid,uuid,uuid,integer,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gr_sell_stock(uuid,uuid,uuid,integer,text,text,text) TO service_role;

COMMIT;
