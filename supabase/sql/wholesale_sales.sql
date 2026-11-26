BEGIN;

-- ========================================================
-- GOLDEN ROSE PERFUME
-- WHOLESALE SALES AND DISTRIBUTION
--
-- Requires staff_module_permissions.sql.
-- Monetary values are integer kobo.
-- Inventory quantities are individual bottles.
-- ========================================================

CREATE SCHEMA golden_rose_wholesale;

REVOKE ALL ON SCHEMA golden_rose_wholesale
FROM PUBLIC, anon, authenticated;

-- ========================================================
-- WHOLESALE SALE HEADER
-- ========================================================

CREATE TABLE golden_rose_wholesale.orders (
    id uuid PRIMARY KEY,

    location_id uuid NOT NULL
        REFERENCES golden_rose.locations(id),

    business_name text NOT NULL
        CHECK (length(btrim(business_name)) BETWEEN 2 AND 180),

    contact text NOT NULL DEFAULT ''
        CHECK (length(contact) <= 254),

    delivery_address text NOT NULL DEFAULT ''
        CHECK (length(delivery_address) <= 500),

    notes text NOT NULL DEFAULT ''
        CHECK (length(notes) <= 1000),

    currency text NOT NULL DEFAULT 'NGN'
        CHECK (currency = 'NGN'),

    total_minor bigint NOT NULL
        CHECK (
            total_minor BETWEEN 1
            AND 9007199254740991
        ),

    paid_minor bigint NOT NULL DEFAULT 0
        CHECK (
            paid_minor >= 0
            AND paid_minor <= total_minor
        ),

    created_by uuid NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    dispatched_at timestamptz,

    dispatched_by uuid,

    request_payload jsonb NOT NULL,

    CONSTRAINT gr_wholesale_dispatch_identity
        CHECK (
            (dispatched_at IS NULL AND dispatched_by IS NULL)
            OR
            (dispatched_at IS NOT NULL AND dispatched_by IS NOT NULL)
        )
);

CREATE INDEX gr_wholesale_orders_location_idx
    ON golden_rose_wholesale.orders (
        location_id,
        created_at DESC
    );

CREATE INDEX gr_wholesale_orders_created_idx
    ON golden_rose_wholesale.orders (
        created_at DESC,
        id
    );

-- ========================================================
-- WHOLESALE PRODUCT LINES
--
-- Preserve the original agreed price and packaging
-- conversion even when catalogue settings change later.
-- ========================================================

CREATE TABLE golden_rose_wholesale.order_lines (
    order_id uuid NOT NULL
        REFERENCES golden_rose_wholesale.orders(id),

    line_id uuid NOT NULL,

    line_number integer NOT NULL
        CHECK (line_number BETWEEN 1 AND 100),

    variant_id uuid NOT NULL
        REFERENCES golden_rose.product_variants(id),

    package_id uuid
        REFERENCES golden_rose_ops.variant_packages(id),

    product_name text NOT NULL,

    sku text,

    unit_name text NOT NULL,

    units_per_package integer NOT NULL
        CHECK (units_per_package BETWEEN 1 AND 100000),

    package_quantity integer NOT NULL
        CHECK (package_quantity BETWEEN 1 AND 1000000),

    base_quantity integer NOT NULL
        CHECK (base_quantity BETWEEN 1 AND 1000000),

    retail_unit_price_minor bigint NOT NULL
        CHECK (
            retail_unit_price_minor BETWEEN 1
            AND 9007199254740991
        ),

    package_price_minor bigint NOT NULL
        CHECK (
            package_price_minor BETWEEN 1
            AND 9007199254740991
        ),

    line_total_minor bigint NOT NULL
        CHECK (
            line_total_minor BETWEEN 1
            AND 9007199254740991
        ),

    PRIMARY KEY (order_id, line_id),

    UNIQUE (order_id, line_number),

    CHECK (
        base_quantity::bigint =
            units_per_package::bigint *
            package_quantity::bigint
    ),

    CHECK (
        line_total_minor::numeric =
            package_price_minor::numeric *
            package_quantity::numeric
    ),

    CHECK (
        package_id IS NOT NULL
        OR units_per_package = 1
    )
);

CREATE INDEX gr_wholesale_lines_variant_idx
    ON golden_rose_wholesale.order_lines(variant_id);

-- ========================================================
-- PAYMENT EVENTS
--
-- Manual cash, bank transfer and card-terminal recording.
-- These records do not charge a card or initiate a transfer.
-- ========================================================

CREATE TABLE golden_rose_wholesale.payments (
    id uuid PRIMARY KEY,

    order_id uuid NOT NULL
        REFERENCES golden_rose_wholesale.orders(id),

    amount_minor bigint NOT NULL
        CHECK (
            amount_minor BETWEEN 1
            AND 9007199254740991
        ),

    method text NOT NULL
        CHECK (
            method IN (
                'cash',
                'bank_transfer',
                'card'
            )
        ),

    reference text NOT NULL DEFAULT ''
        CHECK (length(reference) <= 120),

    recorded_by uuid NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gr_wholesale_payments_order_idx
    ON golden_rose_wholesale.payments (
        order_id,
        created_at
    );

-- ========================================================
-- DISPATCH EVENTS
--
-- A confirmed dispatch retains its corresponding stock
-- movement IDs. Full-order dispatch is supported here.
-- ========================================================

CREATE TABLE golden_rose_wholesale.dispatches (
    id uuid PRIMARY KEY,

    order_id uuid NOT NULL UNIQUE
        REFERENCES golden_rose_wholesale.orders(id),

    performed_by uuid NOT NULL,

    movements jsonb NOT NULL
        CHECK (jsonb_typeof(movements) = 'array'),

    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE golden_rose_wholesale.orders
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE golden_rose_wholesale.order_lines
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE golden_rose_wholesale.payments
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE golden_rose_wholesale.dispatches
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES
IN SCHEMA golden_rose_wholesale
FROM PUBLIC, anon, authenticated;

-- ========================================================
-- PRIVATE PAYMENT SERVICE
--
-- Call only through the authorized wholesale RPC.
-- Lock the order before changing its payment balance.
-- ========================================================

CREATE OR REPLACE FUNCTION
golden_rose_wholesale.add_payment(
    p_actor uuid,
    p_order_id uuid,
    p_payment_id uuid,
    p_amount_minor bigint,
    p_method text,
    p_reference text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    v_order golden_rose_wholesale.orders%ROWTYPE;

    v_existing golden_rose_wholesale.payments%ROWTYPE;

    v_reference text :=
        btrim(coalesce(p_reference, ''));
BEGIN
    IF p_actor IS NULL
       OR p_payment_id IS NULL
       OR p_amount_minor IS NULL
       OR p_amount_minor <= 0
       OR p_amount_minor > 9007199254740991
       OR p_method IS NULL
       OR p_method NOT IN (
           'cash',
           'bank_transfer',
           'card'
       )
       OR length(v_reference) > 120
    THEN
        RAISE EXCEPTION
            'Invalid wholesale payment.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_order
    FROM golden_rose_wholesale.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Wholesale sale not found.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT *
    INTO v_existing
    FROM golden_rose_wholesale.payments
    WHERE id = p_payment_id;

    IF FOUND THEN
        IF v_existing.order_id
               IS DISTINCT FROM p_order_id
           OR v_existing.recorded_by
               IS DISTINCT FROM p_actor
           OR v_existing.amount_minor
               IS DISTINCT FROM p_amount_minor
           OR v_existing.method
               IS DISTINCT FROM p_method
           OR v_existing.reference
               IS DISTINCT FROM v_reference
        THEN
            RAISE EXCEPTION
                'Payment reference was reused for another transaction.'
                USING ERRCODE = '22023';
        END IF;

        -- Safe retry: payment is already recorded.
        RETURN;
    END IF;

    IF p_amount_minor >
        v_order.total_minor - v_order.paid_minor
    THEN
        RAISE EXCEPTION
            'Payment exceeds the outstanding balance.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO golden_rose_wholesale.payments (
        id,
        order_id,
        amount_minor,
        method,
        reference,
        recorded_by
    )
    VALUES (
        p_payment_id,
        p_order_id,
        p_amount_minor,
        p_method,
        v_reference,
        p_actor
    );

    UPDATE golden_rose_wholesale.orders
    SET paid_minor = paid_minor + p_amount_minor
    WHERE id = p_order_id;
END;
$function$;

-- ========================================================
-- PRIVATE DISPATCH SERVICE
--
-- Preserve the existing stock ledger and available-stock
-- protection. Deduct grouped SKU quantities atomically.
-- ========================================================

CREATE OR REPLACE FUNCTION
golden_rose_wholesale.dispatch_order(
    p_actor uuid,
    p_order_id uuid,
    p_dispatch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    v_order golden_rose_wholesale.orders%ROWTYPE;

    v_existing golden_rose_wholesale.dispatches%ROWTYPE;

    v_item record;

    v_movement uuid;

    v_movements jsonb := '[]'::jsonb;
BEGIN
    IF p_actor IS NULL OR p_dispatch_id IS NULL THEN
        RAISE EXCEPTION
            'A dispatch reference is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_order
    FROM golden_rose_wholesale.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Wholesale sale not found.'
            USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
    FROM golden_rose.locations
    WHERE id = v_order.location_id
      AND is_active
      AND location_type = 'store'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'The selling location is not active.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_existing
    FROM golden_rose_wholesale.dispatches
    WHERE id = p_dispatch_id;

    IF FOUND THEN
        IF v_existing.order_id
                IS DISTINCT FROM p_order_id
           OR v_existing.performed_by
                IS DISTINCT FROM p_actor
        THEN
            RAISE EXCEPTION
                'Dispatch reference was reused.'
                USING ERRCODE = '22023';
        END IF;

        -- A previously confirmed dispatch must
        -- never deduct stock again.
        RETURN;
    END IF;

    IF v_order.dispatched_at IS NOT NULL THEN
        RAISE EXCEPTION
            'This wholesale sale has already been dispatched.'
            USING ERRCODE = '22023';
    END IF;

    -- Group by product variant, not order line.
    -- Multiple package types may refer to the same SKU.
    --
    -- Acquire stock locks in a consistent variant order.

    FOR v_item IN
        SELECT
            variant_id,
            sum(base_quantity)::bigint AS quantity
        FROM golden_rose_wholesale.order_lines
        WHERE order_id = p_order_id
        GROUP BY variant_id
        ORDER BY variant_id
    LOOP
        IF v_item.quantity NOT BETWEEN 1 AND 1000000 THEN
            RAISE EXCEPTION
                'Dispatch quantity exceeds supported stock limits.'
                USING ERRCODE = '22023';
        END IF;

        -- Reuse the existing atomic stock-selling service.
        -- The public wholesale RPC verifies the actor's
        -- individual dispatch permission and store access.

        v_movement := golden_rose.sell_stock(
            p_actor,
            v_item.variant_id,
            v_order.location_id,
            v_item.quantity::integer,

            'grwholesale:' ||
            p_dispatch_id::text ||
            ':' ||
            v_item.variant_id::text,

            'wholesale_sale',

            p_order_id::text
        );

        v_movements :=
            v_movements ||
            jsonb_build_array(
                jsonb_build_object(
                    'variantId', v_item.variant_id,
                    'quantity', v_item.quantity,
                    'movementId', v_movement
                )
            );
    END LOOP;

    IF jsonb_array_length(v_movements) = 0 THEN
        RAISE EXCEPTION
            'The sale contains no dispatchable products.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO golden_rose_wholesale.dispatches (
        id,
        order_id,
        performed_by,
        movements
    )
    VALUES (
        p_dispatch_id,
        p_order_id,
        p_actor,
        v_movements
    );

    UPDATE golden_rose_wholesale.orders
    SET dispatched_at = now(),
        dispatched_by = p_actor
    WHERE id = p_order_id;

    -- Any stock failure rolls back the entire dispatch,
    -- including all earlier deductions in this transaction.
END;
$function$;

-- ========================================================
-- PRIVATE ORDER DETAILS
--
-- Dispatch-only employees see fulfilment information,
-- not payment amounts or negotiated selling prices.
-- ========================================================

CREATE OR REPLACE FUNCTION
golden_rose_wholesale.order_details(
    p_order_id uuid,
    p_financial boolean
)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $function$
    SELECT jsonb_build_object(
        'ok', true,

        'order',
            CASE WHEN p_financial THEN
                to_jsonb(o) - 'request_payload'
                ||
                jsonb_build_object(
                    'balance_minor',
                        o.total_minor - o.paid_minor,

                    'payment_status',
                        CASE
                            WHEN o.paid_minor = 0
                                THEN 'unpaid'
                            WHEN o.paid_minor = o.total_minor
                                THEN 'paid'
                            ELSE 'partially_paid'
                        END
                )
            ELSE
                to_jsonb(o)
                    - 'request_payload'
                    - 'paid_minor'
                    - 'total_minor'
            END,

        'lines',
            (
                SELECT coalesce(
                    jsonb_agg(
                        CASE WHEN p_financial THEN
                            to_jsonb(line)
                        ELSE
                            to_jsonb(line)
                                - 'retail_unit_price_minor'
                                - 'package_price_minor'
                                - 'line_total_minor'
                        END
                        ORDER BY line.line_number
                    ),
                    '[]'::jsonb
                )
                FROM golden_rose_wholesale.order_lines line
                WHERE line.order_id = o.id
            ),

        'payments',
            CASE WHEN p_financial THEN
                (
                    SELECT coalesce(
                        jsonb_agg(
                            to_jsonb(payment)
                            ORDER BY payment.created_at, payment.id
                        ),
                        '[]'::jsonb
                    )
                    FROM golden_rose_wholesale.payments payment
                    WHERE payment.order_id = o.id
                )
            ELSE
                '[]'::jsonb
            END,

        'dispatches',
            (
                SELECT coalesce(
                    jsonb_agg(to_jsonb(dispatch)),
                    '[]'::jsonb
                )
                FROM golden_rose_wholesale.dispatches dispatch
                WHERE dispatch.order_id = o.id
            )
    )
    FROM golden_rose_wholesale.orders o
    WHERE o.id = p_order_id;
$function$;

-- ========================================================
-- AUTHENTICATED WHOLESALE API
--
-- locations
-- catalogue
-- list
-- detail
-- create
-- payment
-- dispatch
-- ========================================================

CREATE OR REPLACE FUNCTION public.gr_wholesale(
    p_action text,

    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_staff golden_rose.staff_members%ROWTYPE;

    v_can_sell boolean;

    v_can_dispatch boolean;

    v_location uuid;

    v_order_id uuid;

    v_order golden_rose_wholesale.orders%ROWTYPE;

    v_items jsonb;

    v_search text;

    v_offset integer;

    v_result jsonb;

    v_line jsonb;

    v_line_no integer;

    v_line_id uuid;

    v_seen uuid[] := ARRAY[]::uuid[];

    v_variant_id uuid;

    v_package_id uuid;

    v_variant record;

    v_package golden_rose_ops.variant_packages%ROWTYPE;

    v_factor integer;

    v_quantity integer;

    v_base bigint;

    v_unit_name text;

    v_price bigint;

    v_line_total numeric;

    v_total numeric := 0;

    v_normalized_lines jsonb := '[]'::jsonb;

    v_business text;

    v_contact text;

    v_address text;

    v_notes text;

    v_payment bigint;

    v_dispatch_now boolean;
BEGIN
    -- Authenticate the actual staff session.

    v_staff :=
        golden_rose_employment
            .permission_staff_context();

    v_can_sell :=
        golden_rose_employment
            .wholesale_module_allowed('wholesale');

    v_can_dispatch :=
        golden_rose_employment
            .wholesale_module_allowed('dispatch');

    IF NOT v_can_sell AND NOT v_can_dispatch THEN
        RAISE EXCEPTION
            'Wholesale access is not permitted.'
            USING ERRCODE = '42501';
    END IF;

    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) <> 'object'
       OR octet_length(p_payload::text) > 200000
    THEN
        RAISE EXCEPTION
            'Invalid wholesale request.'
            USING ERRCODE = '22023';
    END IF;

    -- ====================================================
    -- AUTHORIZED SELLING LOCATIONS
    -- ====================================================

    IF p_action = 'locations' THEN
        SELECT coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', loc.id,
                    'name', loc.name,
                    'code', loc.code
                )
                ORDER BY loc.name
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM golden_rose.locations loc
        WHERE loc.is_active
          AND loc.location_type = 'store'
          AND (
              v_staff.role = 'owner'
              OR loc.id = v_staff.location_id
          );

        RETURN jsonb_build_object(
            'ok', true,
            'items', v_items,
            'canSell', v_can_sell,
            'canDispatch', v_can_dispatch
        );
    END IF;

    -- ====================================================
    -- CATALOGUE SEARCH AND WHOLESALE PACKAGING
    -- ====================================================

    IF p_action = 'catalogue' THEN
        IF NOT v_can_sell THEN
            RAISE EXCEPTION
                'Wholesale selling permission is required.'
                USING ERRCODE = '42501';
        END IF;

        v_location :=
            nullif(p_payload->>'locationId', '')::uuid;

        v_search :=
            lower(btrim(coalesce(p_payload->>'search', '')));

        v_offset :=
            coalesce(
                (p_payload->>'offset')::integer,
                0
            );

        IF v_location IS NULL
           OR length(v_search) > 100
           OR v_offset NOT BETWEEN 0 AND 10000
        THEN
            RAISE EXCEPTION
                'Invalid catalogue filters.'
                USING ERRCODE = '22023';
        END IF;

        IF v_staff.role <> 'owner'
           AND v_staff.location_id
                IS DISTINCT FROM v_location
        THEN
            RAISE EXCEPTION
                'This selling location is not permitted.'
                USING ERRCODE = '42501';
        END IF;

        PERFORM 1
        FROM golden_rose.locations
        WHERE id = v_location
          AND is_active
          AND location_type = 'store'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Choose an active selling location.'
                USING ERRCODE = '22023';
        END IF;

        WITH matched AS (
            SELECT
                variant.id,
                variant.sku,
                variant.barcode,
                product.name,
                variant.size_ml,
                variant.price_minor,

                greatest(
                    coalesce(balance.on_hand, 0) -
                    coalesce(balance.reserved, 0),
                    0
                ) AS available

            FROM golden_rose.product_variants variant

            JOIN golden_rose.products product
                ON product.id = variant.product_id

            LEFT JOIN golden_rose.stock_balances balance
                ON balance.variant_id = variant.id
                AND balance.location_id = v_location

            WHERE variant.is_active
              AND product.is_active
              AND variant.currency = 'NGN'
              AND variant.price_minor > 0

              AND (
                  v_search = ''

                  OR strpos(
                      lower(product.name),
                      v_search
                  ) > 0

                  OR strpos(
                      lower(coalesce(variant.sku, '')),
                      v_search
                  ) > 0

                  OR strpos(
                      lower(coalesce(variant.barcode, '')),
                      v_search
                  ) > 0
              )

            ORDER BY product.name, variant.id
            LIMIT 51 OFFSET v_offset
        ),
        numbered AS (
            SELECT
                matched.*,

                row_number() OVER (
                    ORDER BY name, id
                ) AS rn

            FROM matched
        )
        SELECT jsonb_build_object(
            'ok', true,

            'hasMore', count(*) > 50,

            'items',
                coalesce(
                    jsonb_agg(
                        jsonb_build_object(
                            'id', item.id,
                            'name', item.name,
                            'sku', item.sku,
                            'barcode', item.barcode,
                            'sizeMl', item.size_ml,

                            'priceMinor',
                                item.price_minor,

                            'available',
                                item.available,

                            'packages',
                                (
                                    SELECT coalesce(
                                        jsonb_agg(
                                            jsonb_build_object(
                                                'id', pkg.id,

                                                'unitName',
                                                    pkg.unit_name,

                                                'unitsPerPackage',
                                                    pkg.units_per_package
                                            )
                                            ORDER BY pkg.unit_name
                                        ),
                                        '[]'::jsonb
                                    )
                                    FROM
                                        golden_rose_ops.variant_packages pkg
                                    WHERE pkg.variant_id = item.id
                                      AND pkg.active
                                )
                        )
                        ORDER BY item.rn
                    ) FILTER (WHERE item.rn <= 50),
                    '[]'::jsonb
                )
        )
        INTO v_result
        FROM numbered item;

        RETURN v_result;
    END IF;

    -- ====================================================
    -- WHOLESALE SALES HISTORY
    -- ====================================================

    IF p_action = 'list' THEN
        v_search :=
            lower(btrim(coalesce(p_payload->>'search', '')));

        v_offset :=
            coalesce(
                (p_payload->>'offset')::integer,
                0
            );

        v_location :=
            nullif(p_payload->>'locationId', '')::uuid;

        IF length(v_search) > 100
           OR v_offset NOT BETWEEN 0 AND 10000
        THEN
            RAISE EXCEPTION
                'Invalid sales filters.'
                USING ERRCODE = '22023';
        END IF;

        IF v_staff.role <> 'owner' THEN
            IF v_location IS NOT NULL
               AND v_location <>
                   v_staff.location_id
            THEN
                RAISE EXCEPTION
                    'This store is not permitted.'
                    USING ERRCODE = '42501';
            END IF;

            v_location := v_staff.location_id;
        END IF;

        WITH matched AS (
            SELECT o.*
            FROM golden_rose_wholesale.orders o

            WHERE (
                v_location IS NULL
                OR o.location_id = v_location
            )

            AND (
                v_search = ''

                OR strpos(
                    lower(o.business_name),
                    v_search
                ) > 0

                OR strpos(
                    lower(o.contact),
                    v_search
                ) > 0

                OR strpos(
                    o.id::text,
                    v_search
                ) > 0
            )

            ORDER BY o.created_at DESC, o.id

            LIMIT 51 OFFSET v_offset
        ),
        numbered AS (
            SELECT
                matched.*,

                row_number() OVER (
                    ORDER BY created_at DESC, id
                ) AS rn

            FROM matched
        )
        SELECT jsonb_build_object(
            'ok', true,

            'hasMore', count(*) > 50,

            'items',
                coalesce(
                    jsonb_agg(
                        CASE WHEN v_can_sell THEN

                            to_jsonb(item)
                                - 'request_payload'
                                - 'rn'

                            ||
                            jsonb_build_object(
                                'balance_minor',
                                    item.total_minor -
                                    item.paid_minor
                            )

                        ELSE

                            to_jsonb(item)
                                - 'request_payload'
                                - 'rn'
                                - 'total_minor'
                                - 'paid_minor'

                        END
                        ORDER BY item.rn
                    ) FILTER (WHERE item.rn <= 50),

                    '[]'::jsonb
                )
        )
        INTO v_result
        FROM numbered item;

        RETURN v_result;
    END IF;

    -- ====================================================
    -- CREATE A WHOLESALE SALE
    -- ====================================================

    IF p_action = 'create' THEN
        IF NOT v_can_sell THEN
            RAISE EXCEPTION
                'Wholesale selling permission is required.'
                USING ERRCODE = '42501';
        END IF;

        v_order_id :=
            nullif(p_payload->>'orderId', '')::uuid;

        v_location :=
            nullif(p_payload->>'locationId', '')::uuid;

        v_business :=
            btrim(coalesce(p_payload->>'businessName', ''));

        v_contact :=
            btrim(coalesce(p_payload->>'contact', ''));

        v_address :=
            btrim(coalesce(p_payload->>'deliveryAddress', ''));

        v_notes :=
            btrim(coalesce(p_payload->>'notes', ''));

        v_payment :=
            coalesce(
                (p_payload->>'initialPaymentMinor')::bigint,
                0
            );

        IF p_payload ? 'dispatchNow'
           AND jsonb_typeof(
               p_payload->'dispatchNow'
           ) <> 'boolean'
        THEN
            RAISE EXCEPTION
                'Invalid dispatch selection.'
                USING ERRCODE = '22023';
        END IF;

        v_dispatch_now :=
            coalesce(
                p_payload->'dispatchNow' = 'true'::jsonb,
                false
            );

        IF v_order_id IS NULL
           OR v_location IS NULL

           OR length(v_business) NOT BETWEEN 2 AND 180
           OR length(v_contact) > 254
           OR length(v_address) > 500
           OR length(v_notes) > 1000

           OR v_payment < 0

           OR p_payload->'lines' IS NULL

           OR jsonb_typeof(
               p_payload->'lines'
           ) <> 'array'
        THEN
            RAISE EXCEPTION
                'Complete the wholesale sale details.'
                USING ERRCODE = '22023';
        END IF;

        IF jsonb_array_length(
            p_payload->'lines'
        ) NOT BETWEEN 1 AND 100
        THEN
            RAISE EXCEPTION
                'Enter between one and 100 products.'
                USING ERRCODE = '22023';
        END IF;

        IF v_dispatch_now AND NOT v_can_dispatch THEN
            RAISE EXCEPTION
                'Dispatch permission is required.'
                USING ERRCODE = '42501';
        END IF;

        IF v_staff.role <> 'owner'
           AND v_staff.location_id
               IS DISTINCT FROM v_location
        THEN
            RAISE EXCEPTION
                'This selling location is not permitted.'
                USING ERRCODE = '42501';
        END IF;

        PERFORM 1
        FROM golden_rose.locations
        WHERE id = v_location
          AND is_active
          AND location_type = 'store'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Choose an active selling location.'
                USING ERRCODE = '22023';
        END IF;

        -- Serialize retries of the same sale.

        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                'golden_rose_wholesale:' ||
                v_order_id::text,
                0
            )
        );

        SELECT *
        INTO v_order
        FROM golden_rose_wholesale.orders
        WHERE id = v_order_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_order.created_by
                    IS DISTINCT FROM v_staff.user_id
               OR v_order.location_id
                    IS DISTINCT FROM v_location
               OR v_order.request_payload
                    IS DISTINCT FROM p_payload
            THEN
                RAISE EXCEPTION
                    'Sale reference was reused for another transaction.'
                    USING ERRCODE = '22023';
            END IF;

            RETURN golden_rose_wholesale.order_details(
                v_order_id,
                true
            );
        END IF;

        -- Validate every product and conversion against
        -- the current database before persisting the sale.

        FOR v_line, v_line_no IN
            SELECT
                entry.value,
                entry.ordinality::integer

            FROM jsonb_array_elements(
                p_payload->'lines'
            ) WITH ORDINALITY AS entry(value, ordinality)
        LOOP
            IF jsonb_typeof(v_line) <> 'object' THEN
                RAISE EXCEPTION
                    'Invalid wholesale product line.'
                    USING ERRCODE = '22023';
            END IF;

            v_line_id :=
                nullif(v_line->>'lineId', '')::uuid;

            v_variant_id :=
                nullif(v_line->>'variantId', '')::uuid;

            v_package_id :=
                nullif(v_line->>'packageId', '')::uuid;

            v_quantity :=
                (v_line->>'packageQuantity')::integer;

            IF v_line_id IS NULL
               OR v_variant_id IS NULL
               OR v_line_id = ANY(v_seen)
               OR v_quantity IS NULL
               OR v_quantity NOT BETWEEN 1 AND 1000000
            THEN
                RAISE EXCEPTION
                    'Invalid or duplicated wholesale product line.'
                    USING ERRCODE = '22023';
            END IF;

            v_seen :=
                array_append(v_seen, v_line_id);

            SELECT
                variant.id,
                variant.sku,
                variant.price_minor,
                product.name

            INTO v_variant

            FROM golden_rose.product_variants variant

            JOIN golden_rose.products product
                ON product.id = variant.product_id

            WHERE variant.id = v_variant_id
              AND variant.is_active
              AND product.is_active
              AND variant.currency = 'NGN'
              AND variant.price_minor > 0

            FOR SHARE OF variant, product;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'A product is unavailable or has no selling price.'
                    USING ERRCODE = '22023';
            END IF;

            IF v_variant.price_minor
                IS DISTINCT FROM
                    (v_line->>'retailUnitPriceMinor')::bigint
            THEN
                RAISE EXCEPTION
                    'A selling price changed. Refresh the product before continuing.'
                    USING ERRCODE = '22023';
            END IF;

            v_factor := 1;

            v_unit_name := 'bottle';

            IF v_package_id IS NOT NULL THEN
                SELECT *
                INTO v_package
                FROM golden_rose_ops.variant_packages
                WHERE id = v_package_id
                  AND variant_id = v_variant_id
                  AND active
                FOR SHARE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION
                        'The selected product packaging is unavailable.'
                        USING ERRCODE = '22023';
                END IF;

                v_factor :=
                    v_package.units_per_package;

                v_unit_name :=
                    v_package.unit_name;
            END IF;

            IF v_factor IS DISTINCT FROM
                (v_line->>'unitsPerPackage')::integer
            THEN
                RAISE EXCEPTION
                    'Packaging changed. Refresh the product before continuing.'
                    USING ERRCODE = '22023';
            END IF;

            v_base :=
                v_factor::bigint *
                v_quantity::bigint;

            IF v_base NOT BETWEEN 1 AND 1000000 THEN
                RAISE EXCEPTION
                    'The product quantity is outside supported limits.'
                    USING ERRCODE = '22023';
            END IF;

            -- Default to catalogue bottle price multiplied
            -- by the number of bottles in the package.
            --
            -- Authorized wholesale staff may enter an
            -- agreed selling price for this transaction.

            v_price :=
                coalesce(
                    (
                        v_line
                            ->>'agreedPackagePriceMinor'
                    )::bigint,

                    v_variant.price_minor * v_factor
                );

            IF v_price NOT BETWEEN 1 AND 9007199254740991
            THEN
                RAISE EXCEPTION
                    'Enter a valid wholesale selling price.'
                    USING ERRCODE = '22023';
            END IF;

            v_line_total :=
                v_price::numeric *
                v_quantity::numeric;

            v_total :=
                v_total + v_line_total;

            IF v_total > 9007199254740991 THEN
                RAISE EXCEPTION
                    'Wholesale transaction amount exceeds supported limits.'
                    USING ERRCODE = '22023';
            END IF;

            v_normalized_lines :=
                v_normalized_lines ||
                jsonb_build_array(
                    jsonb_build_object(
                        'line_id', v_line_id,
                        'line_number', v_line_no,
                        'variant_id', v_variant_id,
                        'package_id', v_package_id,
                        'product_name', v_variant.name,
                        'sku', v_variant.sku,
                        'unit_name', v_unit_name,
                        'units_per_package', v_factor,
                        'package_quantity', v_quantity,
                        'base_quantity', v_base,
                        'retail_unit_price_minor',
                            v_variant.price_minor,
                        'package_price_minor', v_price,
                        'line_total_minor', v_line_total
                    )
                );
        END LOOP;

        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                v_normalized_lines
            ) AS item(value)
            GROUP BY item.value->>'variant_id'
            HAVING sum(
                (
                    item.value->>'base_quantity'
                )::bigint
            ) > 1000000
        )
        THEN
            RAISE EXCEPTION
                'Combined quantity for a product exceeds the stock transaction limit.'
                USING ERRCODE = '22023';
        END IF;

        IF v_payment > v_total THEN
            RAISE EXCEPTION
                'Initial payment exceeds the sale total.'
                USING ERRCODE = '22023';
        END IF;

        IF v_payment > 0
           AND p_payload->'paymentConfirmed'
               IS DISTINCT FROM 'true'::jsonb
        THEN
            RAISE EXCEPTION
                'Confirm that the payment has actually been received.'
                USING ERRCODE = '22023';
        END IF;

        INSERT INTO golden_rose_wholesale.orders (
            id,
            location_id,
            business_name,
            contact,
            delivery_address,
            notes,
            total_minor,
            created_by,
            request_payload
        )
        VALUES (
            v_order_id,
            v_location,
            v_business,
            v_contact,
            v_address,
            v_notes,
            v_total::bigint,
            v_staff.user_id,
            p_payload
        );

        INSERT INTO golden_rose_wholesale.order_lines (
            order_id,
            line_id,
            line_number,
            variant_id,
            package_id,
            product_name,
            sku,
            unit_name,
            units_per_package,
            package_quantity,
            base_quantity,
            retail_unit_price_minor,
            package_price_minor,
            line_total_minor
        )
        SELECT
            v_order_id,
            line.line_id,
            line.line_number,
            line.variant_id,
            line.package_id,
            line.product_name,
            line.sku,
            line.unit_name,
            line.units_per_package,
            line.package_quantity,
            line.base_quantity,
            line.retail_unit_price_minor,
            line.package_price_minor,
            line.line_total_minor

        FROM jsonb_to_recordset(
            v_normalized_lines
        ) AS line(
            line_id uuid,
            line_number integer,
            variant_id uuid,
            package_id uuid,
            product_name text,
            sku text,
            unit_name text,
            units_per_package integer,
            package_quantity integer,
            base_quantity integer,
            retail_unit_price_minor bigint,
            package_price_minor bigint,
            line_total_minor bigint
        );

        IF v_payment > 0 THEN
            PERFORM golden_rose_wholesale.add_payment(
                v_staff.user_id,
                v_order_id,
                v_order_id,
                v_payment,

                p_payload->>'paymentMethod',

                p_payload->>'paymentReference'
            );
        END IF;

        IF v_dispatch_now THEN
            PERFORM golden_rose_wholesale.dispatch_order(
                v_staff.user_id,
                v_order_id,
                v_order_id
            );
        END IF;

        RETURN golden_rose_wholesale.order_details(
            v_order_id,
            true
        );
    END IF;

    -- ====================================================
    -- ACCESS AN EXISTING WHOLESALE SALE
    -- ====================================================

    IF p_action IS NULL
       OR p_action NOT IN (
           'detail',
           'payment',
           'dispatch'
       )
    THEN
        RAISE EXCEPTION
            'Unsupported wholesale operation.'
            USING ERRCODE = '22023';
    END IF;

    v_order_id :=
        nullif(p_payload->>'orderId', '')::uuid;

    SELECT *
    INTO v_order
    FROM golden_rose_wholesale.orders
    WHERE id = v_order_id
      AND (
          v_staff.role = 'owner'
          OR location_id = v_staff.location_id
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Wholesale sale not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_action = 'detail' THEN
        RETURN golden_rose_wholesale.order_details(
            v_order_id,
            v_can_sell
        );
    END IF;

    -- ====================================================
    -- RECORD AN ADDITIONAL PAYMENT
    -- ====================================================

    IF p_action = 'payment' THEN
        IF NOT v_can_sell THEN
            RAISE EXCEPTION
                'Wholesale selling permission is required.'
                USING ERRCODE = '42501';
        END IF;

        IF p_payload->'confirmed'
            IS DISTINCT FROM 'true'::jsonb
        THEN
            RAISE EXCEPTION
                'Confirm receipt of payment before recording it.'
                USING ERRCODE = '22023';
        END IF;

        PERFORM golden_rose_wholesale.add_payment(
            v_staff.user_id,
            v_order_id,

            nullif(
                p_payload->>'paymentId',
                ''
            )::uuid,

            (p_payload->>'amountMinor')::bigint,

            p_payload->>'method',

            p_payload->>'reference'
        );

        RETURN golden_rose_wholesale.order_details(
            v_order_id,
            true
        );
    END IF;

    -- ====================================================
    -- CONFIRM DISPATCH
    -- ====================================================

    IF p_action = 'dispatch' THEN
        IF NOT v_can_dispatch THEN
            RAISE EXCEPTION
                'Dispatch permission is required.'
                USING ERRCODE = '42501';
        END IF;

        PERFORM golden_rose_wholesale.dispatch_order(
            v_staff.user_id,
            v_order_id,

            nullif(
                p_payload->>'dispatchId',
                ''
            )::uuid
        );

        RETURN golden_rose_wholesale.order_details(
            v_order_id,
            v_can_sell
        );
    END IF;

    RAISE EXCEPTION
        'Unsupported wholesale operation.'
        USING ERRCODE = '22023';
END;
$function$;

-- ========================================================
-- SECURITY
--
-- Private tables and helpers are inaccessible to ordinary
-- API users. Only the authenticated RPC is exposed.
-- ========================================================

REVOKE ALL ON ALL FUNCTIONS
IN SCHEMA golden_rose_wholesale
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.gr_wholesale(text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.gr_wholesale(text, jsonb)
TO authenticated;

COMMIT;