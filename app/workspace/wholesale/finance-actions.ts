'use server';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  UUID,
} from '@/src/lib/golden-rose/contracts';

/* =========================================================
   GOLDEN ROSE PERFUME
   WHOLESALE FINANCIAL REPORTING SERVICE
   ========================================================= */

export type WholesaleReportDays =
  | 1
  | 7
  | 30
  | 90;

export interface WholesaleOrderSummary {
  count: number;
  totalMinor: number;
  dispatchedCount: number;
  pendingCount: number;
}

export interface WholesaleDispatchSummary {
  count: number;
  valueMinor: number;
  bottles: number;
}

export interface WholesalePaymentSummary {
  count: number;
  totalMinor: number;
  cashMinor: number;
  transferMinor: number;
  cardMinor: number;
}

export interface WholesaleOutstandingSummary {
  totalMinor: number;
  unpaidCount: number;
  partiallyPaidCount: number;
  paidCount: number;
  pendingDispatchCount: number;
  dispatchedOutstandingMinor: number;
  paymentMismatchCount: number;
}

export interface WholesaleLocationSummary {
  id: string;
  name: string;
  active: boolean;
  orderCount: number;
  orderMinor: number;
  dispatchCount: number;
  dispatchMinor: number;
  receivedMinor: number;
  outstandingMinor: number;
}

export interface WholesaleFinanceReport {
  ok: true;
  currency: 'NGN';
  timeZone: 'Africa/Lagos';
  days: WholesaleReportDays;
  from: string;
  to: string;
  asOf: string;

  orders: WholesaleOrderSummary;

  dispatches: WholesaleDispatchSummary;

  payments: WholesalePaymentSummary;

  outstanding: WholesaleOutstandingSummary;

  locations: WholesaleLocationSummary[];

  profitAvailable: false;

  refundLedgerConnected: false;

  invoiceLedgerConnected: false;
}

export type WholesaleFinanceResult =
  | {
      ok: true;
      data: WholesaleFinanceReport;
    }
  | {
      ok: false;
      message: string;
    };

/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function integer(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function validDays(
  value: unknown,
): value is WholesaleReportDays {
  return (
    value === 1 ||
    value === 7 ||
    value === 30 ||
    value === 90
  );
}

function validDate(
  value: unknown,
): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const time =
    Date.parse(
      value + 'T00:00:00.000Z',
    );

  return (
    Number.isFinite(time) &&
    new Date(time)
      .toISOString()
      .slice(0, 10) === value
  );
}

function validTimestamp(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value))
  );
}

function safeSum(
  values: readonly number[],
): number | null {
  let total = 0;

  for (const value of values) {
    if (!integer(value)) {
      return null;
    }

    total += value;

    if (!integer(total)) {
      return null;
    }
  }

  return total;
}

/* =========================================================
   ORDER SUMMARY VALIDATION
   ========================================================= */

function validOrders(
  value: unknown,
): value is WholesaleOrderSummary {
  const item = record(value);

  if (
    !item ||
    !integer(item.count) ||
    !integer(item.totalMinor) ||
    !integer(item.dispatchedCount) ||
    !integer(item.pendingCount)
  ) {
    return false;
  }

  if (
    safeSum([
      item.dispatchedCount,
      item.pendingCount,
    ]) !== item.count
  ) {
    return false;
  }

  return (
    (item.count === 0) ===
    (item.totalMinor === 0)
  );
}

/* =========================================================
   DISPATCH SUMMARY VALIDATION
   ========================================================= */

function validDispatches(
  value: unknown,
): value is WholesaleDispatchSummary {
  const item = record(value);

  if (
    !item ||
    !integer(item.count) ||
    !integer(item.valueMinor) ||
    !integer(item.bottles)
  ) {
    return false;
  }

  if (item.count === 0) {
    return (
      item.valueMinor === 0 &&
      item.bottles === 0
    );
  }

  return (
    item.valueMinor > 0 &&
    item.bottles >= item.count
  );
}

/* =========================================================
   PAYMENT RECONCILIATION
   ========================================================= */

function validPayments(
  value: unknown,
): value is WholesalePaymentSummary {
  const item = record(value);

  if (
    !item ||
    !integer(item.count) ||
    !integer(item.totalMinor) ||
    !integer(item.cashMinor) ||
    !integer(item.transferMinor) ||
    !integer(item.cardMinor)
  ) {
    return false;
  }

  const allocation =
    safeSum([
      item.cashMinor,
      item.transferMinor,
      item.cardMinor,
    ]);

  return (
    allocation === item.totalMinor &&

    (item.count === 0) ===
      (item.totalMinor === 0)
  );
}

/* =========================================================
   OUTSTANDING BALANCE VALIDATION
   ========================================================= */

function validOutstanding(
  value: unknown,
): value is WholesaleOutstandingSummary {
  const item = record(value);

  if (
    !item ||

    !integer(item.totalMinor) ||

    !integer(item.unpaidCount) ||

    !integer(item.partiallyPaidCount) ||

    !integer(item.paidCount) ||

    !integer(item.pendingDispatchCount) ||

    !integer(item.dispatchedOutstandingMinor) ||

    !integer(item.paymentMismatchCount)
  ) {
    return false;
  }

  const allOrders =
    safeSum([
      item.unpaidCount,
      item.partiallyPaidCount,
      item.paidCount,
    ]);

  if (
    allOrders === null ||

    item.pendingDispatchCount > allOrders ||

    item.paymentMismatchCount > allOrders ||

    item.dispatchedOutstandingMinor >
      item.totalMinor
  ) {
    return false;
  }

  return (
    (item.totalMinor === 0) ===
    (
      item.unpaidCount === 0 &&
      item.partiallyPaidCount === 0
    )
  );
}

/* =========================================================
   LOCATION REPORT VALIDATION
   ========================================================= */

function validLocation(
  value: unknown,
): value is WholesaleLocationSummary {
  const item = record(value);

  if (!item) {
    return false;
  }

  return (
    typeof item.id === 'string' &&
    UUID.test(item.id) &&

    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&

    typeof item.active === 'boolean' &&

    integer(item.orderCount) &&

    integer(item.orderMinor) &&

    integer(item.dispatchCount) &&

    integer(item.dispatchMinor) &&

    integer(item.receivedMinor) &&

    integer(item.outstandingMinor) &&

    (
      (item.orderCount === 0) ===
      (item.orderMinor === 0)
    ) &&

    (
      (item.dispatchCount === 0) ===
      (item.dispatchMinor === 0)
    )
  );
}

/* =========================================================
   VALIDATE COMPLETE REPORT
   ========================================================= */

function parseReport(
  value: unknown,
  expectedDays: WholesaleReportDays,
): WholesaleFinanceReport | null {
  const data = record(value);

  if (
    !data ||

    data.ok !== true ||

    data.currency !== 'NGN' ||

    data.timeZone !== 'Africa/Lagos' ||

    !validDays(data.days) ||

    data.days !== expectedDays ||

    !validDate(data.from) ||

    !validDate(data.to) ||

    !validTimestamp(data.asOf) ||

    !validOrders(data.orders) ||

    !validDispatches(data.dispatches) ||

    !validPayments(data.payments) ||

    !validOutstanding(data.outstanding) ||

    !Array.isArray(data.locations) ||

    !data.locations.every(validLocation) ||

    data.profitAvailable !== false ||

    data.refundLedgerConnected !== false ||

    data.invoiceLedgerConnected !== false
  ) {
    return null;
  }

  /* Verify the selected calendar period. */

  const start =
    Date.parse(
      data.from + 'T00:00:00.000Z',
    );

  const end =
    Date.parse(
      data.to + 'T00:00:00.000Z',
    );

  if (
    (end - start) / 86_400_000 + 1 !==
    expectedDays
  ) {
    return null;
  }

  /* Reject duplicated reporting locations. */

  const locationIds = new Set(
    data.locations.map(
      item => item.id.toLowerCase(),
    ),
  );

  if (
    locationIds.size !== data.locations.length
  ) {
    return null;
  }

  /* =======================================================
     CROSS-RECONCILE LOCATION AND BUSINESS TOTALS
     ======================================================= */

  const checks = [
    {
      actual: safeSum(
        data.locations.map(
          item => item.orderCount,
        ),
      ),

      expected: data.orders.count,
    },

    {
      actual: safeSum(
        data.locations.map(
          item => item.orderMinor,
        ),
      ),

      expected: data.orders.totalMinor,
    },

    {
      actual: safeSum(
        data.locations.map(
          item => item.dispatchCount,
        ),
      ),

      expected: data.dispatches.count,
    },

    {
      actual: safeSum(
        data.locations.map(
          item => item.dispatchMinor,
        ),
      ),

      expected: data.dispatches.valueMinor,
    },

    {
      actual: safeSum(
        data.locations.map(
          item => item.receivedMinor,
        ),
      ),

      expected: data.payments.totalMinor,
    },

    {
      actual: safeSum(
        data.locations.map(
          item => item.outstandingMinor,
        ),
      ),

      expected: data.outstanding.totalMinor,
    },
  ];

  if (
    checks.some(
      item =>
        item.actual !== item.expected,
    )
  ) {
    return null;
  }

  return {
    ok: true,

    currency: 'NGN',

    timeZone: 'Africa/Lagos',

    days: data.days,

    from: data.from,

    to: data.to,

    asOf: data.asOf,

    orders: data.orders,

    dispatches: data.dispatches,

    payments: data.payments,

    outstanding: data.outstanding,

    locations: data.locations,

    profitAvailable: false,

    refundLedgerConnected: false,

    invoiceLedgerConnected: false,
  };
}

/* =========================================================
   AUTHENTICATED OWNER REPORT REQUEST

   Permission checks are repeated on the server and
   inside the database function.
   ========================================================= */

export async function loadWholesaleFinance(
  days: WholesaleReportDays = 30,
): Promise<WholesaleFinanceResult> {
  if (!validDays(days)) {
    return {
      ok: false,

      message:
        'Select a supported reporting period.',
    };
  }

  try {
    const staff =
      await getStaffAccess();

    if (
      'reason' in staff ||
      staff.role !== 'owner'
    ) {
      return {
        ok: false,

        message:
          'Owner access is required to view wholesale financial reporting.',
      };
    }

    const client =
      await createClient();

    const {
      data,
      error,
    } = await client.rpc(
      'gr_wholesale_finance',

      {
        p_days: days,
      },
    );

    if (error) {
      if (
        error.code === '42501' ||
        error.code === 'GR403'
      ) {
        return {
          ok: false,

          message:
            'Your current session is not authorized to view wholesale finances.',
        };
      }

      console.error(
        '[Golden Rose wholesale finance]',

        {
          code: error.code,
        },
      );

      return {
        ok: false,

        message:
          'Wholesale financial reporting is unavailable. Verify the database installation and retry.',
      };
    }

    const report =
      parseReport(
        data,
        days,
      );

    if (!report) {
      return {
        ok: false,

        message:
          'The wholesale figures could not be reconciled. Refresh the report before relying on these figures.',
      };
    }

    return {
      ok: true,

      data: report,
    };

  } catch {
    return {
      ok: false,

      message:
        'Unable to load wholesale financial reporting. Please retry.',
    };
  }
}