BEGIN;
-- Lock displayed prices inside the same transaction as the sale, so the cashier
-- cannot be charged against a changed catalogue price without refreshing.
CREATE FUNCTION public.gr_pos_checked_checkout(p_actor_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  v_key uuid;
  v_line record;
  v_price bigint;
BEGIN
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
$$;
REVOKE ALL ON FUNCTION public.gr_pos_checked_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gr_pos_checked_checkout(uuid,jsonb) TO service_role;
COMMIT;