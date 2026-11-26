BEGIN;

-- ========================================================
-- GOLDEN ROSE PERFUME
-- WHOLESALE FINANCIAL REPORTING
--
-- Dependencies:
--   staff_module_permissions.sql
--   wholesale_sales.sql
--
-- All monetary values are integer kobo.
-- Reporting dates use Africa/Lagos.
-- ========================================================

CREATE OR REPLACE FUNCTION public.gr_wholesale_finance(
    p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_staff golden_rose.staff_members%ROWTYPE;

    v_as_of timestamptz := statement_timestamp();

    v_today date;

    v_from date;

    v_start timestamptz;

    v_orders jsonb;

    v_dispatches jsonb;

    v_payments jsonb;

    v_outstanding jsonb;

    v_locations jsonb;

    v_result jsonb;

BEGIN
    -- ====================================================
    -- AUTHENTICATION AND AUTHORIZATION
    --
    -- Wholesale executive reporting is owner-only.
    -- Permission to create a wholesale sale does not
    -- automatically grant access to company-wide finances.
    -- ====================================================

    v_staff :=
        golden_rose_employment.permission_staff_context();

    IF v_staff.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION
            'Owner access is required for wholesale financial reporting.'
            USING ERRCODE = '42501';
    END IF;

    IF p_days IS NULL
       OR p_days NOT IN (1, 7, 30, 90)
    THEN
        RAISE EXCEPTION
            'Select a supported reporting period.'
            USING ERRCODE = '22023';
    END IF;

    -- ====================================================
    -- REPORTING PERIOD
    --
    -- Inclusive local starting date.
    -- All records are restricted to the report timestamp.
    -- ====================================================

    v_today :=
        (v_as_of AT TIME ZONE 'Africa/Lagos')::date;

    v_from :=
        v_today - (p_days - 1);

    v_start :=
        v_from::timestamp AT TIME ZONE 'Africa/Lagos';

    -- ====================================================
    -- WHOLESALE ORDER ACTIVITY
    --
    -- Order value is the agreed commercial amount,
    -- not necessarily collected cash or dispatched revenue.
    -- ====================================================

    SELECT jsonb_build_object(
        'count',
            count(*),

        'totalMinor',
            coalesce(sum(o.total_minor), 0),

        'dispatchedCount',
            count(*) FILTER (
                WHERE o.dispatched_at IS NOT NULL
                  AND o.dispatched_at <= v_as_of
            ),

        'pendingCount',
            count(*) FILTER (
                WHERE o.dispatched_at IS NULL
                   OR o.dispatched_at > v_as_of
            )
    )

    INTO v_orders

    FROM golden_rose_wholesale.orders o

    WHERE o.created_at >= v_start
      AND o.created_at <= v_as_of;

    -- ====================================================
    -- CONFIRMED DISPATCH ACTIVITY
    --
    -- Use dispatch dates, not order creation dates.
    -- A previously created order may be dispatched today.
    --
    -- Aggregate product quantities separately so joining
    -- order lines cannot multiply the order total.
    -- ====================================================

    WITH dispatched_orders AS (
        SELECT
            o.id,
            o.total_minor

        FROM golden_rose_wholesale.orders o

        WHERE o.dispatched_at >= v_start
          AND o.dispatched_at <= v_as_of
    ),

    bottle_totals AS (
        SELECT
            coalesce(
                sum(line.base_quantity),
                0
            ) AS units

        FROM golden_rose_wholesale.order_lines line

        JOIN dispatched_orders o
            ON o.id = line.order_id
    )

    SELECT jsonb_build_object(
        'count',
            count(*),

        'valueMinor',
            coalesce(sum(o.total_minor), 0),

        'bottles',
            (
                SELECT units
                FROM bottle_totals
            )
    )

    INTO v_dispatches

    FROM dispatched_orders o;

    -- ====================================================
    -- PAYMENTS RECEIVED
    --
    -- Aggregate individual payment events according to
    -- when payment was recorded.
    --
    -- This includes payments against older orders.
    -- ====================================================

    SELECT jsonb_build_object(
        'count',
            count(*),

        'totalMinor',
            coalesce(sum(p.amount_minor), 0),

        'cashMinor',
            coalesce(
                sum(p.amount_minor) FILTER (
                    WHERE p.method = 'cash'
                ),
                0
            ),

        'transferMinor',
            coalesce(
                sum(p.amount_minor) FILTER (
                    WHERE p.method = 'bank_transfer'
                ),
                0
            ),

        'cardMinor',
            coalesce(
                sum(p.amount_minor) FILTER (
                    WHERE p.method = 'card'
                ),
                0
            )
    )

    INTO v_payments

    FROM golden_rose_wholesale.payments p

    WHERE p.created_at >= v_start
      AND p.created_at <= v_as_of;

    -- ====================================================
    -- CURRENT OUTSTANDING BALANCES
    --
    -- These are all-time current balances.
    -- They must not be limited to orders created within
    -- the selected reporting period.
    --
    -- Check the payment-event ledger against the stored
    -- order payment balance.
    -- ====================================================

    WITH payment_totals AS (
        SELECT
            p.order_id,

            sum(p.amount_minor) AS paid_minor

        FROM golden_rose_wholesale.payments p

        WHERE p.created_at <= v_as_of

        GROUP BY p.order_id
    ),

    balances AS (
        SELECT
            o.id,

            o.total_minor,

            o.paid_minor,

            coalesce(
                p.paid_minor,
                0
            ) AS ledger_paid_minor,

            o.dispatched_at

        FROM golden_rose_wholesale.orders o

        LEFT JOIN payment_totals p
            ON p.order_id = o.id

        WHERE o.created_at <= v_as_of
    )

    SELECT jsonb_build_object(
        'totalMinor',
            coalesce(
                sum(total_minor - paid_minor),
                0
            ),

        'unpaidCount',
            count(*) FILTER (
                WHERE paid_minor = 0
            ),

        'partiallyPaidCount',
            count(*) FILTER (
                WHERE paid_minor > 0
                  AND paid_minor < total_minor
            ),

        'paidCount',
            count(*) FILTER (
                WHERE paid_minor = total_minor
            ),

        'pendingDispatchCount',
            count(*) FILTER (
                WHERE dispatched_at IS NULL
                   OR dispatched_at > v_as_of
            ),

        'dispatchedOutstandingMinor',
            coalesce(
                sum(total_minor - paid_minor) FILTER (
                    WHERE dispatched_at IS NOT NULL
                      AND dispatched_at <= v_as_of
                ),
                0
            ),

        'paymentMismatchCount',
            count(*) FILTER (
                WHERE ledger_paid_minor <> paid_minor
            )
    )

    INTO v_outstanding

    FROM balances;

    -- ====================================================
    -- REPORTING BY SELLING LOCATION
    --
    -- Pre-aggregate every event category independently.
    -- This prevents multiplication between order lines,
    -- payment events and dispatches.
    -- ====================================================

    WITH ordered AS (
        SELECT
            o.location_id,

            count(*) AS order_count,

            sum(o.total_minor) AS order_minor

        FROM golden_rose_wholesale.orders o

        WHERE o.created_at >= v_start
          AND o.created_at <= v_as_of

        GROUP BY o.location_id
    ),

    dispatched AS (
        SELECT
            o.location_id,

            count(*) AS dispatch_count,

            sum(o.total_minor) AS dispatch_minor

        FROM golden_rose_wholesale.orders o

        WHERE o.dispatched_at >= v_start
          AND o.dispatched_at <= v_as_of

        GROUP BY o.location_id
    ),

    received AS (
        SELECT
            o.location_id,

            sum(p.amount_minor) AS received_minor

        FROM golden_rose_wholesale.payments p

        JOIN golden_rose_wholesale.orders o
            ON o.id = p.order_id

        WHERE p.created_at >= v_start
          AND p.created_at <= v_as_of

        GROUP BY o.location_id
    ),

    outstanding AS (
        SELECT
            o.location_id,

            sum(
                o.total_minor - o.paid_minor
            ) AS balance_minor

        FROM golden_rose_wholesale.orders o

        WHERE o.created_at <= v_as_of

        GROUP BY o.location_id
    )

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', loc.id,

                'name', loc.name,

                'active', loc.is_active,

                'orderCount',
                    coalesce(ordered.order_count, 0),

                'orderMinor',
                    coalesce(ordered.order_minor, 0),

                'dispatchCount',
                    coalesce(dispatched.dispatch_count, 0),

                'dispatchMinor',
                    coalesce(dispatched.dispatch_minor, 0),

                'receivedMinor',
                    coalesce(received.received_minor, 0),

                'outstandingMinor',
                    coalesce(outstanding.balance_minor, 0)
            )

            ORDER BY loc.name, loc.id
        ),

        '[]'::jsonb
    )

    INTO v_locations

    FROM golden_rose.locations loc

    LEFT JOIN ordered
        ON ordered.location_id = loc.id

    LEFT JOIN dispatched
        ON dispatched.location_id = loc.id

    LEFT JOIN received
        ON received.location_id = loc.id

    LEFT JOIN outstanding
        ON outstanding.location_id = loc.id

    WHERE loc.location_type = 'store'

       OR ordered.location_id IS NOT NULL

       OR dispatched.location_id IS NOT NULL

       OR received.location_id IS NOT NULL

       OR outstanding.location_id IS NOT NULL;

    -- ====================================================
    -- FINAL REPORT
    --
    -- This is not a consolidated accounting statement.
    -- Profit, tax, refunds, invoice integration and
    -- historical imported sales require reconciliation.
    -- ====================================================

    v_result := jsonb_build_object(
        'ok', true,

        'currency', 'NGN',

        'timeZone', 'Africa/Lagos',

        'days', p_days,

        'from', v_from,

        'to', v_today,

        'asOf', v_as_of,

        'orders', v_orders,

        'dispatches', v_dispatches,

        'payments', v_payments,

        'outstanding', v_outstanding,

        'locations', v_locations,

        'profitAvailable', false,

        'refundLedgerConnected', false,

        'invoiceLedgerConnected', false
    );

    RETURN v_result;
END;
$function$;

-- ========================================================
-- RESTRICT DATABASE FUNCTION ACCESS
--
-- Authenticated users can request the report only through
-- the function's verified owner authorization guard.
-- ========================================================

REVOKE ALL ON FUNCTION
    public.gr_wholesale_finance(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.gr_wholesale_finance(integer)
TO authenticated;

COMMIT;