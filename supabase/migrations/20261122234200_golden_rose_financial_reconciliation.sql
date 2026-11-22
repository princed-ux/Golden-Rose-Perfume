
-- Golden Rose Perfume: financial reconciliation evidence.
-- READ-ONLY reporting facade; does not mutate sales, costs, or inventory.
-- Rehearse before applying. Depends on public.gr_financial_overview and
-- golden_rose_finance.pos_line_cost_snapshots.

BEGIN;

CREATE OR REPLACE FUNCTION public.gr_financial_reconciliation(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_financial jsonb;
  v_start date;
  v_end date;
  v_scope uuid;
  v_lines bigint := 0;
  v_valid_cost_lines bigint := 0;
  v_missing_snapshots bigint := 0;
  v_missing_costs bigint := 0;
  v_snapshot_mismatches bigint := 0;
  v_sale_without_lines bigint := 0;
  v_total_mismatches bigint := 0;
  v_known_cost_minor numeric := 0;
BEGIN
  -- This function is deliberately invoked BEFORE querying protected tables.
  -- It verifies the real auth session, active staff enrollment, permitted
  -- role (owner, manager, accountant), date range and requested location.
  -- An unauthorized request cannot bypass those checks through this facade.
  v_financial := public.gr_financial_overview(p_from, p_to, p_location_id);

  IF jsonb_typeof(v_financial) IS DISTINCT FROM 'object'
    OR (v_financial->>'currency') IS DISTINCT FROM 'NGN'
  THEN
    RAISE EXCEPTION 'Reporting service returned an invalid response'
      USING ERRCODE = '22023';
  END IF;

  v_start := (v_financial->>'from')::date;
  v_end := (v_financial->>'to')::date;
  v_scope := nullif(v_financial->>'locationId','')::uuid;

  WITH selected_sales AS (
    SELECT s.id
    FROM golden_rose.pos_sales s
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
          BETWEEN v_start AND v_end
      AND (v_scope IS NULL OR s.location_id = v_scope)
  ), selected_lines AS (
    SELECT l.sale_id, l.line_number, l.variant_id, l.quantity
    FROM golden_rose.pos_sale_lines l
    JOIN selected_sales s ON s.id = l.sale_id
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (
      WHERE c.sale_id IS NOT NULL
        AND c.quantity = l.quantity
        AND c.variant_id = l.variant_id
        AND c.catalogue_unit_cost_minor IS NOT NULL
        AND c.catalogue_unit_cost_minor >= 0
    )::bigint,
    count(*) FILTER (WHERE c.sale_id IS NULL)::bigint,
    count(*) FILTER (
      WHERE c.sale_id IS NOT NULL
        AND (c.catalogue_unit_cost_minor IS NULL OR c.catalogue_unit_cost_minor < 0)
    )::bigint,
    count(*) FILTER (
      WHERE c.sale_id IS NOT NULL
        AND (c.quantity IS DISTINCT FROM l.quantity
          OR c.variant_id IS DISTINCT FROM l.variant_id)
    )::bigint,
    coalesce(sum(c.catalogue_unit_cost_minor::numeric * c.quantity) FILTER (
      WHERE c.sale_id IS NOT NULL
        AND c.quantity = l.quantity
        AND c.variant_id = l.variant_id
        AND c.catalogue_unit_cost_minor IS NOT NULL
        AND c.catalogue_unit_cost_minor >= 0
    ), 0)
  INTO v_lines, v_valid_cost_lines, v_missing_snapshots,
       v_missing_costs, v_snapshot_mismatches, v_known_cost_minor
  FROM selected_lines l
  LEFT JOIN golden_rose_finance.pos_line_cost_snapshots c
    ON c.sale_id = l.sale_id AND c.line_number = l.line_number;

  SELECT
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM golden_rose.pos_sale_lines l
        WHERE l.sale_id = s.id
      )
    )::bigint,
    count(*) FILTER (
      WHERE s.total_minor IS DISTINCT FROM
        (s.subtotal_minor - s.discount_minor + s.tax_minor)
    )::bigint
  INTO v_sale_without_lines, v_total_mismatches
  FROM golden_rose.pos_sales s
  WHERE s.status = 'completed'
    AND (s.created_at AT TIME ZONE 'Africa/Lagos')::date
        BETWEEN v_start AND v_end
    AND (v_scope IS NULL OR s.location_id = v_scope);

  RETURN jsonb_build_object(
    'from', v_start,
    'to', v_end,
    'locationId', v_scope,
    'currency', 'NGN',
    'completedSales', (v_financial->'sales'->'transactions'),
    'completedRevenueMinor', (v_financial->'sales'->'totalMinor'),
    'qaCodedSales', (v_financial->'sales'->'qaCodedTransactions'),
    'approvedExpensesMinor', (v_financial->'expenses'->'approvedMinor'),
    'paidRecordedExpensesMinor', (v_financial->'expenses'->'paidRecordedMinor'),
    'invoiceOutstandingMinor', (v_financial->'invoices'->'outstandingMinor'),
    'purchaseCommitmentsMinor', (v_financial->'purchasing'->'commitmentsMinor'),
    'saleLines', v_lines,
    'validCostSnapshots', v_valid_cost_lines,
    'missingCostSnapshots', v_missing_snapshots,
    'missingUnitCosts', v_missing_costs,
    'costSnapshotMismatches', v_snapshot_mismatches,
    'salesWithoutLines', v_sale_without_lines,
    'saleTotalMismatches', v_total_mismatches,
    'knownSnapshotCostMinor', v_known_cost_minor,
    'costSnapshotsComplete',
      (v_lines > 0 AND v_valid_cost_lines = v_lines
        AND v_missing_snapshots = 0
        AND v_missing_costs = 0
        AND v_snapshot_mismatches = 0
        AND v_sale_without_lines = 0),
    'refundLedgerConnected', false,
    'profitAvailable', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gr_financial_reconciliation(date,date,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gr_financial_reconciliation(date,date,uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
