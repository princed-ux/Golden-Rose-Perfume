-- GOLDEN ROSE PERFUME
-- Atomic POS payment allocations, optional customer name
-- and owner-only payment reporting.
--
-- Validate on staging before applying to production.

BEGIN;

ALTER TABLE golden_rose.pos_sales
  ADD COLUMN cash_tendered_minor bigint,
  ADD COLUMN bank_transfer_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN card_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN customer_name text,
  ADD COLUMN manual_non_cash_confirmed boolean NOT NULL DEFAULT false;

-- Existing tender_method constraint guarantees historical cash records.

UPDATE golden_rose.pos_sales
SET cash_tendered_minor = tendered_minor;

ALTER TABLE golden_rose.pos_sales
  ALTER COLUMN cash_tendered_minor SET NOT NULL,

  DROP CONSTRAINT pos_sales_tender_method_check,

  ADD CONSTRAINT pos_sales_tender_method_check
    CHECK (
      tender_method IN ('cash', 'bank_transfer', 'card', 'split')
    ),

  ADD CONSTRAINT pos_sales_customer_name_check
    CHECK (
      customer_name IS NULL OR (
        length(customer_name) BETWEEN 1 AND 120
        AND customer_name !~ '[[:cntrl:]]'
      )
    ),

  ADD CONSTRAINT pos_sales_payment_amounts_check
    CHECK (
      cash_tendered_minor >= 0
      AND bank_transfer_minor >= 0
      AND card_minor >= 0

      AND tendered_minor =
        cash_tendered_minor + bank_transfer_minor + card_minor

      AND change_minor <= cash_tendered_minor

      AND (
        cash_tendered_minor = 0
        OR cash_tendered_minor > change_minor
      )

      AND total_minor =
        cash_tendered_minor - change_minor +
        bank_transfer_minor + card_minor

      AND manual_non_cash_confirmed =
        (bank_transfer_minor + card_minor > 0)

      AND tender_method = CASE
        WHEN (
          CASE WHEN cash_tendered_minor - change_minor > 0
            THEN 1 ELSE 0 END
          +
          CASE WHEN bank_transfer_minor > 0
            THEN 1 ELSE 0 END
          +
          CASE WHEN card_minor > 0
            THEN 1 ELSE 0 END
        ) > 1 THEN 'split'

        WHEN bank_transfer_minor > 0 THEN 'bank_transfer'
        WHEN card_minor > 0 THEN 'card'
        ELSE 'cash'
      END
    );


-- =========================================================
-- POS REGISTER
-- =========================================================

CREATE OR REPLACE FUNCTION public.gr_pos_register(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
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

  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tender bigint := 0;

  v_cash bigint := 0;
  v_transfer bigint := 0;
  v_card bigint := 0;

  v_method text;
  v_customer text;
  v_payments jsonb;
  v_bank jsonb;
  v_applied_cash bigint;
  v_change bigint;
  v_expected_method text;
  v_new_contract boolean;
  v_total bigint;
  v_hash text;
  v_key uuid;
  v_items jsonb;
  v_movement uuid;
  v_line_no integer := 0;
  v_locations jsonb;
  v_page jsonb;
  v_search text;
  v_offset integer;
  v_limit integer;

BEGIN

  IF NOT golden_rose.pos_actor_has_confirmed_email(p_actor_id)
  THEN
    RAISE EXCEPTION 'Verified staff identity required.'
      USING ERRCODE = 'GR403';
  END IF;

  SELECT role, location_id
  INTO v_role, v_assigned_store
  FROM golden_rose.staff_members
  WHERE user_id = p_actor_id
    AND status = 'active'
  FOR SHARE;

  IF v_role NOT IN ('owner', 'manager', 'cashier')
     OR v_role IS NULL
  THEN
    RAISE EXCEPTION 'POS access is not permitted for this role.'
      USING ERRCODE = 'GR403';
  END IF;

  IF v_role <> 'owner'
     AND v_assigned_store IS NULL
  THEN
    RAISE EXCEPTION 'Ask an owner to assign your store.'
      USING ERRCODE = 'GR403';
  END IF;

  -- LIVE CATALOGUE

  IF p_action = 'catalog' THEN

    v_search := left(
      btrim(coalesce(p_payload->>'search', '')),
      100
    );

    v_offset := least(
      greatest(
        coalesce((p_payload->>'offset')::integer, 0),
        0
      ),
      1000000
    );

    v_limit := least(
      greatest(
        coalesce((p_payload->>'limit')::integer, 40),
        1
      ),
      80
    );

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'code', code,
          'type', location_type
        ) ORDER BY name, id
      ),
      '[]'::jsonb
    )
    INTO v_locations
    FROM golden_rose.locations
    WHERE is_active
      AND location_type = 'store'
      AND (
        v_role = 'owner'
        OR id = v_assigned_store
      );

    IF p_payload ? 'locationId'
       AND nullif(p_payload->>'locationId', '') IS NOT NULL
    THEN
      v_location_id := (p_payload->>'locationId')::uuid;

      IF v_role <> 'owner'
         AND v_location_id IS DISTINCT FROM v_assigned_store
      THEN
        RAISE EXCEPTION 'This register is outside your assigned store.'
          USING ERRCODE = 'GR403';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM golden_rose.locations
        WHERE id = v_location_id
          AND is_active
          AND location_type = 'store'
      )
      THEN
        RAISE EXCEPTION 'Select an active store register location.'
          USING ERRCODE = '22023';
      END IF;

    ELSE

      SELECT id INTO v_location_id
      FROM golden_rose.locations
      WHERE is_active
        AND location_type = 'store'
        AND (
          v_role = 'owner'
          OR id = v_assigned_store
        )
      ORDER BY name, id
      LIMIT 1;

    END IF;

    SELECT coalesce(
      jsonb_agg(item ORDER BY name, sku, id),
      '[]'::jsonb
    )
    INTO v_page
    FROM (
      SELECT
        v.id,
        v.sku,
        p.name,

        jsonb_build_object(
          'id', v.id,
          'productId', p.id,
          'name', p.name,
          'brand', b.name,
          'sku', v.sku,
          'barcode', v.barcode,
          'sizeMl', v.size_ml,
          'priceMinor', v.price_minor,
          'currency', v.currency,
          'available', coalesce(sb.on_hand - sb.reserved, 0),

          'imagePath', (
            SELECT i.storage_path
            FROM golden_rose.product_images i
            WHERE i.product_id = p.id
            ORDER BY i.sort_order, i.created_at, i.id
            LIMIT 1
          )
        ) AS item

      FROM golden_rose.product_variants v

      JOIN golden_rose.products p
        ON p.id = v.product_id

      LEFT JOIN golden_rose.brands b
        ON b.id = p.brand_id

      LEFT JOIN golden_rose.stock_balances sb
        ON sb.variant_id = v.id
        AND sb.location_id = v_location_id

      WHERE p.is_active
        AND v.is_active
        AND v.currency = 'NGN'
        AND v.price_minor > 0
        AND v_location_id IS NOT NULL

        AND (
          v_search = ''
          OR strpos(
            lower(
              concat_ws(
                ' ',
                p.name,
                b.name,
                v.sku,
                v.barcode,
                v.name
              )
            ),
            lower(v_search)
          ) > 0
        )

      ORDER BY p.name, v.sku, v.id
      LIMIT v_limit
      OFFSET v_offset

    ) page;

    SELECT jsonb_build_object(
      'bankName', bank_name,
      'accountName', bank_account_name,
      'accountNumber', bank_account_number
    )
    INTO v_bank
    FROM public.gr_business_profile
    WHERE id = 1
      AND length(btrim(bank_name)) > 0
      AND length(btrim(bank_account_name)) > 0
      AND bank_account_number ~ '^[0-9]{10}$';

    RETURN jsonb_build_object(
      'ok', true,
      'items', v_page,
      'locations', v_locations,
      'selectedLocationId', v_location_id,
      'hasMore', jsonb_array_length(v_page) = v_limit,
      'paymentVersion', 2,
      'receivingAccount', v_bank
    );

  -- RETRIEVE EXISTING RECEIPT

  ELSIF p_action = 'receipt' THEN

    v_sale_id := (p_payload->>'saleId')::uuid;

    IF v_sale_id IS NULL THEN
      RAISE EXCEPTION 'Sale ID required'
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_sale
    FROM golden_rose.pos_sales
    WHERE id = v_sale_id
      AND (
        v_role = 'owner'
        OR location_id = v_assigned_store
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt not found'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,

      'receipt', jsonb_build_object(
        'saleId', v_sale.id,
        'saleNumber', v_sale.sale_number,
        'createdAt', v_sale.created_at,
        'locationId', v_sale.location_id,

        'locationName', (
          SELECT name
          FROM golden_rose.locations
          WHERE id = v_sale.location_id
        ),

        'cashierId', v_sale.performed_by,
        'currency', 'NGN',
        'method', v_sale.tender_method,
        'customerName', v_sale.customer_name,

        'payments', jsonb_build_object(
          'cashMinor', v_sale.cash_tendered_minor,
          'transferMinor', v_sale.bank_transfer_minor,
          'cardMinor', v_sale.card_minor
        ),

        'manualConfirmed', v_sale.manual_non_cash_confirmed,
        'subtotalMinor', v_sale.subtotal_minor,
        'discountMinor', v_sale.discount_minor,
        'taxMinor', v_sale.tax_minor,
        'totalMinor', v_sale.total_minor,
        'tenderedMinor', v_sale.tendered_minor,
        'changeMinor', v_sale.change_minor,

        'items', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'variantId', variant_id,
                'name', product_name,
                'sku', sku,
                'sizeMl', size_ml,
                'quantity', quantity,
                'unitPriceMinor', unit_price_minor,
                'lineTotalMinor', line_subtotal_minor
              ) ORDER BY line_number
            ),
            '[]'::jsonb
          )
          FROM golden_rose.pos_sale_lines
          WHERE sale_id = v_sale.id
        )
      )
    );

  ELSIF p_action <> 'checkout' THEN

    RAISE EXCEPTION 'Unknown register action'
      USING ERRCODE = '22023';

  END IF;

  -- VALIDATE CHECKOUT

  IF coalesce(jsonb_typeof(p_payload->'items'), '') <> 'array'
     OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 40
  THEN
    RAISE EXCEPTION 'Select 1–40 distinct products'
      USING ERRCODE = '22023';
  END IF;

  v_method := coalesce(p_payload->>'method', '');

  IF v_method NOT IN (
    'cash',
    'bank_transfer',
    'card',
    'split'
  )
  THEN
    RAISE EXCEPTION 'Choose a supported payment method.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'idempotencyKey', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Invalid transaction ID'
      USING ERRCODE = '22023';
  END IF;

  v_key := (p_payload->>'idempotencyKey')::uuid;

  IF coalesce(p_payload->>'discountMinor', '') !~ '^[0-9]{1,12}$'
     OR coalesce(p_payload->>'tenderedMinor', '') !~ '^[0-9]{1,13}$'
  THEN
    RAISE EXCEPTION 'Enter valid discount and tender amounts'
      USING ERRCODE = '22023';
  END IF;

  v_discount := (p_payload->>'discountMinor')::bigint;
  v_tender := (p_payload->>'tenderedMinor')::bigint;
  v_new_contract := p_payload ? 'payments';

  IF p_payload ? 'customerName'
     AND jsonb_typeof(p_payload->'customerName')
       IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION 'Invalid customer name'
      USING ERRCODE = '22023';
  END IF;

  v_customer := nullif(
    btrim(coalesce(p_payload->>'customerName', '')),
    ''
  );

  IF length(v_customer) > 120
     OR v_customer ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'Customer name must contain at most 120 printable characters.'
      USING ERRCODE = '22023';
  END IF;

  -- PAYMENT ALLOCATION VALIDATION

  IF v_new_contract THEN

    v_payments := p_payload->'payments';

    IF jsonb_typeof(v_payments) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_payments->'cashMinor') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_payments->'transferMinor') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_payments->'cardMinor') IS DISTINCT FROM 'number'
       OR coalesce(v_payments->>'cashMinor', '') !~ '^[0-9]{1,13}$'
       OR coalesce(v_payments->>'transferMinor', '') !~ '^[0-9]{1,13}$'
       OR coalesce(v_payments->>'cardMinor', '') !~ '^[0-9]{1,13}$'
    THEN
      RAISE EXCEPTION 'Payment amounts must be nonnegative integer kobo.'
        USING ERRCODE = '22023';
    END IF;

    v_cash := (v_payments->>'cashMinor')::bigint;
    v_transfer := (v_payments->>'transferMinor')::bigint;
    v_card := (v_payments->>'cardMinor')::bigint;

    IF v_cash + v_transfer + v_card <> v_tender
    THEN
      RAISE EXCEPTION 'Payment amounts do not match the tender total.'
        USING ERRCODE = '22023';
    END IF;

    IF v_transfer + v_card > 0
       AND (p_payload->'manualConfirmed')
         IS DISTINCT FROM 'true'::jsonb
    THEN
      RAISE EXCEPTION 'Confirm actual receipt of transfer or terminal funds first.'
        USING ERRCODE = '22023';
    END IF;

  ELSE

    -- Backward compatibility for legacy cash requests.

    IF v_method <> 'cash'
       OR v_customer IS NOT NULL
    THEN
      RAISE EXCEPTION 'Updated payment details are required.'
        USING ERRCODE = '22023';
    END IF;

    v_cash := v_tender;

  END IF;

  -- STORE AND PRODUCT VALIDATION

  v_location_id := (p_payload->>'locationId')::uuid;

  IF v_role <> 'owner'
     AND v_location_id IS DISTINCT FROM v_assigned_store
  THEN
    RAISE EXCEPTION 'This register is outside your assigned store.'
      USING ERRCODE = 'GR403';
  END IF;

  IF v_location_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM golden_rose.locations
    WHERE id = v_location_id
      AND is_active
      AND location_type = 'store'
  )
  THEN
    RAISE EXCEPTION 'An active store location is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT x."variantId")
  INTO v_count, v_line_no
  FROM jsonb_to_recordset(p_payload->'items')
    AS x("variantId" uuid, quantity integer);

  IF v_count <> v_line_no OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_payload->'items')
      AS x("variantId" uuid, quantity integer)
    WHERE x."variantId" IS NULL
      OR x.quantity IS NULL
      OR x.quantity NOT BETWEEN 1 AND 100
  )
  THEN
    RAISE EXCEPTION 'Invalid or repeated product lines'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'variantId', x."variantId",
      'quantity', x.quantity
    ) ORDER BY x."variantId"
  )
  INTO v_items
  FROM jsonb_to_recordset(p_payload->'items')
    AS x("variantId" uuid, quantity integer);

  -- TRANSACTION IDEMPOTENCY

  IF v_new_contract THEN

    v_hash := md5(
      jsonb_build_object(
        'version', 2,
        'locationId', v_location_id,
        'items', v_items,
        'discountMinor', v_discount,
        'tenderedMinor', v_tender,
        'method', v_method,
        'customerName', v_customer,

        'payments', jsonb_build_object(
          'cashMinor', v_cash,
          'transferMinor', v_transfer,
          'cardMinor', v_card
        )
      )::text
    );

  ELSE

    -- Preserve the original hash for interrupted legacy cash requests.

    v_hash := md5(
      jsonb_build_object(
        'locationId', v_location_id,
        'items', v_items,
        'discountMinor', v_discount,
        'tenderedMinor', v_tender,
        'method', 'cash'
      )::text
    );

  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'golden_rose_pos:' || v_key::text,
      0
    )
  );

  SELECT * INTO v_sale
  FROM golden_rose.pos_sales
  WHERE idempotency_key = v_key;

  IF FOUND THEN

    IF v_sale.request_hash <> v_hash
       OR v_sale.performed_by <> p_actor_id
    THEN
      RAISE EXCEPTION 'Transaction ID already used for another sale.'
        USING ERRCODE = '22023';
    END IF;

    RETURN public.gr_pos_register(
      p_actor_id,
      'receipt',
      jsonb_build_object('saleId', v_sale.id)
    );

  END IF;

  -- CALCULATE LIVE PRICES

  FOR v_line IN

    SELECT
      v.id AS variant_id,
      v.product_id,
      v.price_minor,
      v.currency,
      p.name,
      p.is_active AS product_active,
      v.is_active AS variant_active,
      input.quantity

    FROM jsonb_to_recordset(p_payload->'items')
      AS input("variantId" uuid, quantity integer)

    LEFT JOIN golden_rose.product_variants v
      ON v.id = input."variantId"

    LEFT JOIN golden_rose.products p
      ON p.id = v.product_id

    ORDER BY input."variantId"

  LOOP

    IF v_line.variant_id IS NULL
       OR NOT coalesce(v_line.product_active, false)
       OR NOT coalesce(v_line.variant_active, false)
       OR v_line.currency <> 'NGN'
       OR v_line.price_minor IS NULL
       OR v_line.price_minor <= 0
       OR v_line.price_minor > 100000000000
    THEN
      RAISE EXCEPTION 'A selected product is unavailable or has no valid price.'
        USING ERRCODE = '22023';
    END IF;

    v_subtotal :=
      v_subtotal +
      v_line.quantity * v_line.price_minor;

    IF v_subtotal > 1000000000000
    THEN
      RAISE EXCEPTION 'Sale exceeds maximum amount'
        USING ERRCODE = '22023';
    END IF;

  END LOOP;

  IF v_discount > v_subtotal * (
    CASE WHEN v_role IN ('owner', 'manager')
      THEN 30 ELSE 10 END
  ) / 100
  THEN
    RAISE EXCEPTION 'Discount exceeds allowed register limit'
      USING ERRCODE = '22023';
  END IF;

  v_total := v_subtotal - v_discount;

  -- FINAL PAYMENT VALIDATION

  IF v_tender < v_total
     OR v_tender > 9999999999999
     OR v_transfer + v_card > v_total
  THEN
    RAISE EXCEPTION 'Payments must cover the sale without non-cash overpayment.'
      USING ERRCODE = '22023';
  END IF;

  v_change := v_tender - v_total;
  v_applied_cash := v_cash - v_change;

  IF v_applied_cash < 0
     OR (v_cash > 0 AND v_applied_cash = 0)
  THEN
    RAISE EXCEPTION 'Change can only come from cash used to pay for the sale.'
      USING ERRCODE = '22023';
  END IF;

  v_expected_method := CASE
    WHEN (
      CASE WHEN v_applied_cash > 0 THEN 1 ELSE 0 END
      +
      CASE WHEN v_transfer > 0 THEN 1 ELSE 0 END
      +
      CASE WHEN v_card > 0 THEN 1 ELSE 0 END
    ) > 1 THEN 'split'
    WHEN v_transfer > 0 THEN 'bank_transfer'
    WHEN v_card > 0 THEN 'card'
    ELSE 'cash'
  END;

  IF v_method <> v_expected_method
  THEN
    RAISE EXCEPTION 'Selected payment method does not match its allocation.'
      USING ERRCODE = '22023';
  END IF;

  IF v_transfer > 0 THEN

    PERFORM 1
    FROM public.gr_business_profile
    WHERE id = 1
      AND length(btrim(bank_name)) > 0
      AND length(btrim(bank_account_name)) > 0
      AND bank_account_number ~ '^[0-9]{10}$'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bank transfer is unavailable until the owner configures a receiving account.'
        USING ERRCODE = '22023';
    END IF;

  END IF;

  -- CREATE ONE COMPLETED SALE

  INSERT INTO golden_rose.pos_sales (
    idempotency_key,
    request_hash,
    location_id,
    performed_by,
    subtotal_minor,
    discount_minor,
    tax_minor,
    total_minor,
    tendered_minor,
    change_minor,
    tender_method,
    cash_tendered_minor,
    bank_transfer_minor,
    card_minor,
    customer_name,
    manual_non_cash_confirmed
  )
  VALUES (
    v_key,
    v_hash,
    v_location_id,
    p_actor_id,
    v_subtotal,
    v_discount,
    0,
    v_total,
    v_tender,
    v_change,
    v_method,
    v_cash,
    v_transfer,
    v_card,
    v_customer,
    (v_transfer + v_card > 0)
  )
  RETURNING * INTO v_sale;

  -- INVENTORY DEDUCTION AND SALE LINES

  v_line_no := 0;

  FOR v_line IN

    SELECT
      v.id AS variant_id,
      v.product_id,
      v.sku,
      v.size_ml,
      v.price_minor,
      p.name,
      input.quantity

    FROM jsonb_to_recordset(p_payload->'items')
      AS input("variantId" uuid, quantity integer)

    JOIN golden_rose.product_variants v
      ON v.id = input."variantId"

    JOIN golden_rose.products p
      ON p.id = v.product_id

    ORDER BY input."variantId"

  LOOP

    v_line_no := v_line_no + 1;

    v_movement := public.gr_sell_stock(
      p_actor_id,
      v_line.variant_id,
      v_location_id,
      v_line.quantity,
      'grpos:' || v_sale.id::text || ':' || v_line.variant_id::text,
      'pos_sale',
      v_sale.id::text
    );

    INSERT INTO golden_rose.pos_sale_lines (
      sale_id,
      line_number,
      product_id,
      variant_id,
      product_name,
      sku,
      size_ml,
      quantity,
      unit_price_minor,
      line_subtotal_minor,
      stock_movement_id
    )
    VALUES (
      v_sale.id,
      v_line_no,
      v_line.product_id,
      v_line.variant_id,
      v_line.name,
      v_line.sku,
      v_line.size_ml,
      v_line.quantity,
      v_line.price_minor,
      v_line.quantity * v_line.price_minor,
      v_movement
    );

  END LOOP;

  RETURN public.gr_pos_register(
    p_actor_id,
    'receipt',
    jsonb_build_object('saleId', v_sale.id)
  );

END;
$function$;

-- Preserve checked checkout and authenticated employee-session wrappers.

REVOKE ALL ON FUNCTION public.gr_pos_register(uuid, text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gr_pos_register(uuid, text, jsonb)
TO service_role;


-- =========================================================
-- SALES HISTORY
-- =========================================================

CREATE OR REPLACE FUNCTION golden_rose.sales_history(
  p_actor uuid,
  p_session uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$

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

  IF p_actor IS NULL
     OR p_session IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM auth.sessions
       WHERE id = p_session
         AND user_id = p_actor
     )
  THEN
    RAISE EXCEPTION 'A valid staff session is required.'
      USING ERRCODE = 'GR403';
  END IF;

  SELECT s.role, s.location_id
  INTO v_role, v_store
  FROM golden_rose.staff_members s

  JOIN auth.users u
    ON u.id = s.user_id

  WHERE s.user_id = p_actor
    AND s.status = 'active'
    AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous, false)
    AND (u.banned_until IS NULL OR u.banned_until <= now())

  FOR SHARE OF s;

  IF v_role IS NULL
     OR v_role NOT IN ('owner', 'manager', 'sales_staff')
  THEN
    RAISE EXCEPTION 'Sales history is restricted to authorized staff.'
      USING ERRCODE = 'GR403';
  END IF;

  IF v_role <> 'owner'
     AND v_store IS NULL
  THEN
    RAISE EXCEPTION 'An assigned store is required.'
      USING ERRCODE = 'GR403';
  END IF;

  IF to_regprocedure(
    'public.gr_employee_session_allowed(uuid,uuid)'
  ) IS NOT NULL
  THEN
    EXECUTE 'SELECT public.gr_employee_session_allowed($1,$2)'
    INTO v_allowed
    USING p_actor, p_session;

    IF v_allowed IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION 'Your employee session must be renewed.'
        USING ERRCODE = 'GR403';
    END IF;
  END IF;

  IF p_action = 'receipt' THEN

    IF coalesce(p_payload->>'saleId', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Invalid sale reference.'
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_sale
    FROM golden_rose.pos_sales
    WHERE id = (p_payload->>'saleId')::uuid
      AND (
        v_role = 'owner'
        OR location_id = v_store
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt not found.'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,

      'receipt', jsonb_build_object(
        'saleId', v_sale.id,
        'saleNumber', v_sale.sale_number,
        'createdAt', v_sale.created_at,
        'locationId', v_sale.location_id,

        'locationName', (
          SELECT name
          FROM golden_rose.locations
          WHERE id = v_sale.location_id
        ),

        'cashierId', v_sale.performed_by,
        'currency', v_sale.currency,
        'method', v_sale.tender_method,
        'status', v_sale.status,
        'customerName', v_sale.customer_name,

        'payments', jsonb_build_object(
          'cashMinor', v_sale.cash_tendered_minor,
          'transferMinor', v_sale.bank_transfer_minor,
          'cardMinor', v_sale.card_minor
        ),

        'manualConfirmed', v_sale.manual_non_cash_confirmed,
        'subtotalMinor', v_sale.subtotal_minor,
        'discountMinor', v_sale.discount_minor,
        'taxMinor', v_sale.tax_minor,
        'totalMinor', v_sale.total_minor,
        'tenderedMinor', v_sale.tendered_minor,
        'changeMinor', v_sale.change_minor,

        'items', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'variantId', variant_id,
                'name', product_name,
                'sku', sku,
                'sizeMl', size_ml,
                'quantity', quantity,
                'unitPriceMinor', unit_price_minor,
                'lineTotalMinor', line_subtotal_minor
              ) ORDER BY line_number
            ),
            '[]'::jsonb
          )
          FROM golden_rose.pos_sale_lines
          WHERE sale_id = v_sale.id
        )
      )
    );

  ELSIF p_action <> 'list' THEN

    RAISE EXCEPTION 'Unknown history request.'
      USING ERRCODE = '22023';

  END IF;

  -- PAGINATION AND SEARCH

  IF coalesce(p_payload->>'offset', '0') !~ '^[0-9]{1,5}$'
     OR (p_payload->>'offset')::integer > 10000
     OR coalesce(p_payload->>'limit', '30') !~ '^[0-9]{1,2}$'
     OR (p_payload->>'limit')::integer NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'Invalid sales page.'
      USING ERRCODE = '22023';
  END IF;

  v_offset := coalesce((p_payload->>'offset')::integer, 0);
  v_limit := coalesce((p_payload->>'limit')::integer, 30);
  v_search := lower(btrim(coalesce(p_payload->>'search', '')));

  IF length(v_search) > 100 THEN
    RAISE EXCEPTION 'Search is too long.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'from', '') IS NOT NULL THEN

    IF (p_payload->>'from') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION 'Invalid from date.'
        USING ERRCODE = '22023';
    END IF;

    v_from := (p_payload->>'from')::date;

  END IF;

  IF nullif(p_payload->>'to', '') IS NOT NULL THEN

    IF (p_payload->>'to') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION 'Invalid to date.'
        USING ERRCODE = '22023';
    END IF;

    v_to := (p_payload->>'to')::date;

  END IF;

  IF v_from IS NOT NULL
     AND v_to IS NOT NULL
     AND v_to < v_from
  THEN
    RAISE EXCEPTION 'End date must not precede start date.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'locationId', '') IS NOT NULL THEN

    IF (p_payload->>'locationId') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Invalid store selection.'
        USING ERRCODE = '22023';
    END IF;

    v_requested_store :=
      (p_payload->>'locationId')::uuid;

  END IF;

  IF v_role <> 'owner'
     AND v_requested_store IS NOT NULL
     AND v_requested_store <> v_store
  THEN
    RAISE EXCEPTION 'Sales from another store are restricted.'
      USING ERRCODE = 'GR403';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      row.item ORDER BY row.created_at DESC, row.sale_number DESC
    ),
    '[]'::jsonb
  )
  INTO v_items

  FROM (
    SELECT
      s.created_at,
      s.sale_number,

      jsonb_build_object(
        'saleId', s.id,
        'saleNumber', s.sale_number,
        'createdAt', s.created_at,
        'locationId', s.location_id,
        'locationName', l.name,
        'cashierId', s.performed_by,
        'currency', s.currency,
        'method', s.tender_method,
        'status', s.status,
        'customerName', s.customer_name,
        'subtotalMinor', s.subtotal_minor,
        'discountMinor', s.discount_minor,
        'taxMinor', s.tax_minor,
        'totalMinor', s.total_minor,

        'lineCount', (
          SELECT count(*)
          FROM golden_rose.pos_sale_lines
          WHERE sale_id = s.id
        ),

        'units', (
          SELECT coalesce(sum(quantity), 0)
          FROM golden_rose.pos_sale_lines
          WHERE sale_id = s.id
        )
      ) AS item

    FROM golden_rose.pos_sales s

    JOIN golden_rose.locations l
      ON l.id = s.location_id

    WHERE (
      v_role = 'owner'
      OR s.location_id = v_store
    )

      AND (
        v_requested_store IS NULL
        OR s.location_id = v_requested_store
      )

      AND (
        v_from IS NULL
        OR s.created_at >= (
          v_from::timestamp AT TIME ZONE 'Africa/Lagos'
        )
      )

      AND (
        v_to IS NULL
        OR s.created_at < (
          (v_to + 1)::timestamp AT TIME ZONE 'Africa/Lagos'
        )
      )

      AND (
        v_search = ''
        OR position(v_search IN s.sale_number::text) > 0
        OR position(
          v_search IN lower(coalesce(s.customer_name, ''))
        ) > 0

        OR EXISTS (
          SELECT 1
          FROM golden_rose.pos_sale_lines sl
          WHERE sl.sale_id = s.id
            AND (
              position(v_search IN lower(sl.product_name)) > 0
              OR position(
                v_search IN lower(coalesce(sl.sku, ''))
              ) > 0
            )
        )
      )

    ORDER BY s.created_at DESC, s.sale_number DESC
    LIMIT v_limit + 1
    OFFSET v_offset

  ) row;

  v_has_more :=
    jsonb_array_length(v_items) > v_limit;

  IF v_has_more THEN
    v_items := v_items - v_limit;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_items,
    'hasMore', v_has_more,
    'offset', v_offset,
    'limit', v_limit
  );

END;
$function$;

REVOKE ALL ON FUNCTION golden_rose.sales_history(uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION golden_rose.sales_history(uuid, uuid, text, jsonb)
TO service_role;


-- =========================================================
-- FINANCIAL REPORTING
-- =========================================================

CREATE OR REPLACE FUNCTION public.gr_financial_overview(
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$

DECLARE
  v_actor uuid := auth.uid();
  v_sid_text text := auth.jwt()->>'session_id';
  v_sid uuid;
  v_role text;
  v_assigned uuid;
  v_scope uuid;
  v_guard boolean;
  v_start date;
  v_end date;

  v_sales bigint := 0;
  v_transactions bigint := 0;
  v_subtotal bigint := 0;
  v_discounts bigint := 0;
  v_tax bigint := 0;
  v_qa_sales bigint := 0;

  v_approved_expenses bigint := 0;
  v_paid_expenses bigint := 0;
  v_pending_expenses bigint := 0;

  v_purchase_commitments bigint := 0;
  v_approved_orders bigint := 0;
  v_draft_orders bigint := 0;
  v_received_units bigint := 0;
  v_goods_receipts bigint := 0;

  v_issued_invoices bigint := 0;
  v_invoiced_total bigint := 0;
  v_invoice_outstanding bigint := 0;

  v_trend jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_store_sales jsonb := '[]'::jsonb;

  v_payment_summary jsonb;

BEGIN

  IF v_actor IS NULL
     OR coalesce(v_sid_text, '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Active staff session required'
      USING ERRCODE = '42501';
  END IF;

  v_sid := v_sid_text::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions
    WHERE id = v_sid
      AND user_id = v_actor
  )
  THEN
    RAISE EXCEPTION 'Session expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.role, s.location_id
  INTO v_role, v_assigned

  FROM golden_rose.staff_members s

  JOIN auth.users u
    ON u.id = s.user_id

  WHERE s.user_id = v_actor
    AND s.status = 'active'
    AND s.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())

  FOR SHARE OF s;

  IF v_role IS NULL
     OR v_role NOT IN ('owner', 'manager', 'accountant')
  THEN
    RAISE EXCEPTION 'Reporting access denied'
      USING ERRCODE = '42501';
  END IF;

  IF public.gr_employee_session_allowed(v_actor, v_sid)
     IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Employee access verification failed'
      USING ERRCODE = '42501';
  END IF;

  IF v_role = 'owner' THEN

    v_scope := p_location_id;

  ELSE

    IF v_assigned IS NULL
       OR (
         p_location_id IS NOT NULL
         AND p_location_id <> v_assigned
       )
    THEN
      RAISE EXCEPTION 'Location outside assignment'
        USING ERRCODE = '42501';
    END IF;

    v_scope := v_assigned;

  END IF;

  IF v_scope IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM golden_rose.locations
       WHERE id = v_scope
     )
  THEN
    RAISE EXCEPTION 'Unknown location'
      USING ERRCODE = '22023';
  END IF;

  v_end := coalesce(
    p_to,
    (now() AT TIME ZONE 'Africa/Lagos')::date
  );

  v_start := coalesce(p_from, v_end - 29);

  IF v_start > v_end OR v_end - v_start > 3660
  THEN
    RAISE EXCEPTION 'Choose a date range of no more than ten years'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name
      )
      ORDER BY name
    ),
    '[]'::jsonb
  )
  INTO v_locations
  FROM golden_rose.locations
  WHERE v_role = 'owner'
    OR id = v_assigned;

  -- COMPLETED POS SALES

  SELECT
    count(*)::bigint,
    coalesce(sum(s.total_minor), 0)::bigint,
    coalesce(sum(s.subtotal_minor), 0)::bigint,
    coalesce(sum(s.discount_minor), 0)::bigint,
    coalesce(sum(s.tax_minor), 0)::bigint

  INTO
    v_transactions,
    v_sales,
    v_subtotal,
    v_discounts,
    v_tax

  FROM golden_rose.pos_sales s

  WHERE s.status = 'completed'
    AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
      BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR s.location_id = v_scope
    );

  -- QA SALES

  SELECT count(DISTINCT s.id)::bigint
  INTO v_qa_sales

  FROM golden_rose.pos_sales s

  JOIN golden_rose.pos_sale_lines sl
    ON sl.sale_id = s.id

  WHERE s.status = 'completed'
    AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
      BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR s.location_id = v_scope
    )
    AND (
      upper(coalesce(sl.sku, '')) LIKE 'GRQA-%'
      OR upper(sl.product_name) LIKE 'QA TEST%'
    );

  -- OPERATING EXPENSES

  SELECT
    coalesce(
      sum(e.amount_minor)
      FILTER (
        WHERE e.status IN ('approved', 'recorded_paid')
      ),
      0
    )::bigint,

    coalesce(
      sum(e.amount_minor)
      FILTER (WHERE e.status = 'recorded_paid'),
      0
    )::bigint,

    coalesce(
      sum(e.amount_minor)
      FILTER (WHERE e.status = 'pending'),
      0
    )::bigint

  INTO
    v_approved_expenses,
    v_paid_expenses,
    v_pending_expenses

  FROM golden_rose_ops.expenses e

  WHERE e.expense_date BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR e.location_id = v_scope
    );

  -- PURCHASE ORDERS

  SELECT
    count(*) FILTER (
      WHERE po.status = 'draft'
    )::bigint,

    count(*) FILTER (
      WHERE po.status IN (
        'approved',
        'partially_received',
        'received'
      )
    )::bigint,

    coalesce(
      sum(po.total_minor) FILTER (
        WHERE po.status IN (
          'approved',
          'partially_received',
          'received'
        )
      ),
      0
    )::bigint

  INTO
    v_draft_orders,
    v_approved_orders,
    v_purchase_commitments

  FROM golden_rose_ops.purchase_orders po

  WHERE (po.created_at AT TIME ZONE 'Africa/Lagos')::date
    BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR po.location_id = v_scope
    );

  -- GOODS RECEIVED

  SELECT
    count(*)::bigint,
    coalesce(sum(pr.quantity), 0)::bigint

  INTO
    v_goods_receipts,
    v_received_units

  FROM golden_rose_ops.purchase_receipts pr

  JOIN golden_rose_ops.purchase_lines pl
    ON pl.id = pr.line_id

  JOIN golden_rose_ops.purchase_orders po
    ON po.id = pl.purchase_id

  WHERE (pr.created_at AT TIME ZONE 'Africa/Lagos')::date
    BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR po.location_id = v_scope
    );

  -- ISSUED INVOICES

  SELECT
    count(*)::bigint,
    coalesce(sum(d.total_minor), 0)::bigint,

    coalesce(
      sum(
        greatest(
          0,
          d.total_minor - coalesce(p.paid_minor, 0)
        )
      ),
      0
    )::bigint

  INTO
    v_issued_invoices,
    v_invoiced_total,
    v_invoice_outstanding

  FROM golden_rose_billing.documents d

  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(bp.amount_minor), 0)::bigint AS paid_minor
    FROM golden_rose_billing.payments bp
    WHERE bp.document_id = d.id
      AND bp.status = 'verified'
  ) p ON true

  WHERE d.kind = 'invoice'
    AND d.state = 'issued'
    AND d.issue_date BETWEEN v_start AND v_end
    AND (
      v_scope IS NULL
      OR d.location_id = v_scope
    );

  -- SALES TREND

  IF v_end - v_start <= 62 THEN

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'period', series.day::text,
          'totalMinor', coalesce(s.total_minor, 0),
          'transactions', coalesce(s.cnt, 0)
        ) ORDER BY series.day
      ),
      '[]'::jsonb
    )
    INTO v_trend

    FROM generate_series(
      v_start::timestamp,
      v_end::timestamp,
      interval '1 day'
    ) AS series(day)

    LEFT JOIN (
      SELECT
        (created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
        sum(total_minor)::bigint AS total_minor,
        count(*)::bigint AS cnt

      FROM golden_rose.pos_sales

      WHERE status = 'completed'
        AND (created_at AT TIME ZONE 'Africa/Lagos')::date
          BETWEEN v_start AND v_end
        AND (
          v_scope IS NULL
          OR location_id = v_scope
        )

      GROUP BY 1

    ) s ON s.day = series.day::date;

  ELSE

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'period', to_char(series.month, 'YYYY-MM'),
          'totalMinor', coalesce(s.total_minor, 0),
          'transactions', coalesce(s.cnt, 0)
        ) ORDER BY series.month
      ),
      '[]'::jsonb
    )
    INTO v_trend

    FROM generate_series(
      date_trunc('month', v_start::timestamp),
      date_trunc('month', v_end::timestamp),
      interval '1 month'
    ) AS series(month)

    LEFT JOIN (
      SELECT
        date_trunc(
          'month',
          created_at AT TIME ZONE 'Africa/Lagos'
        )::date AS month,

        sum(total_minor)::bigint AS total_minor,
        count(*)::bigint AS cnt

      FROM golden_rose.pos_sales

      WHERE status = 'completed'
        AND (created_at AT TIME ZONE 'Africa/Lagos')::date
          BETWEEN v_start AND v_end
        AND (
          v_scope IS NULL
          OR location_id = v_scope
        )

      GROUP BY 1

    ) s ON s.month = series.month::date;

  END IF;

  -- SALES BY LOCATION

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', summary.name,
        'totalMinor', summary.total_minor,
        'transactions', summary.cnt
      ) ORDER BY summary.total_minor DESC
    ),
    '[]'::jsonb
  )
  INTO v_store_sales

  FROM (
    SELECT
      l.name,
      sum(s.total_minor)::bigint AS total_minor,
      count(*)::bigint AS cnt

    FROM golden_rose.pos_sales s

    JOIN golden_rose.locations l
      ON l.id = s.location_id

    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
        BETWEEN v_start AND v_end
      AND (
        v_scope IS NULL
        OR s.location_id = v_scope
      )

    GROUP BY l.id, l.name

  ) summary;

  -- OWNER-ONLY PAYMENT METHOD BREAKDOWN

  IF v_role = 'owner' THEN

    SELECT jsonb_build_object(
      'cashMinor', coalesce(
        sum(s.cash_tendered_minor - s.change_minor),
        0
      ),

      'transferMinor', coalesce(
        sum(s.bank_transfer_minor),
        0
      ),

      'cardMinor', coalesce(
        sum(s.card_minor),
        0
      ),

      'splitTransactions', count(*) FILTER (
        WHERE s.tender_method = 'split'
      ),

      'cashTenderedMinor', coalesce(
        sum(s.cash_tendered_minor),
        0
      ),

      'cashChangeMinor', coalesce(
        sum(s.change_minor),
        0
      ),

      'totalMinor', coalesce(
        sum(s.total_minor),
        0
      )
    )
    INTO v_payment_summary

    FROM golden_rose.pos_sales s

    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
        BETWEEN v_start AND v_end
      AND (
        v_scope IS NULL
        OR s.location_id = v_scope
      );

  END IF;

  -- RETURN FINANCIAL REPORT

  RETURN jsonb_build_object(
    'paymentBreakdown', v_payment_summary,
    'from', v_start,
    'to', v_end,
    'locationId', v_scope,
    'locations', v_locations,
    'trend', v_trend,
    'storeSales', v_store_sales,
    'currency', 'NGN',
    'timeZone', 'Africa/Lagos',

    'sales', jsonb_build_object(
      'transactions', v_transactions,
      'totalMinor', v_sales,
      'subtotalMinor', v_subtotal,
      'discountMinor', v_discounts,
      'taxMinor', v_tax,
      'qaCodedTransactions', v_qa_sales
    ),

    'expenses', jsonb_build_object(
      'approvedMinor', v_approved_expenses,
      'paidRecordedMinor', v_paid_expenses,
      'pendingMinor', v_pending_expenses
    ),

    'purchasing', jsonb_build_object(
      'draftOrders', v_draft_orders,
      'approvedOrders', v_approved_orders,
      'commitmentsMinor', v_purchase_commitments,
      'receipts', v_goods_receipts,
      'receivedUnits', v_received_units
    ),

    'invoices', jsonb_build_object(
      'issuedCount', v_issued_invoices,
      'issuedMinor', v_invoiced_total,
      'outstandingMinor', v_invoice_outstanding
    ),

    'profitAvailable', false
  );

END;
$function$;

REVOKE ALL ON FUNCTION public.gr_financial_overview(date, date, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gr_financial_overview(date, date, uuid)
TO authenticated;

COMMIT;