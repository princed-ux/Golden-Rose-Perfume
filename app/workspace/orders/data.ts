import 'server-only';

import {
  getSupabaseConfig,
} from '@/src/lib/supabase/config';

import type {
  PosReceipt,
} from '@/app/workspace/pos/types';

import {
  isPaymentMethod,
  validSalePayment,
  type PaymentMethod,
} from '@/src/lib/golden-rose/pos-payments';

/* =========================================================
   GOLDEN ROSE PERFUME

   Protected sales history data service.
   ========================================================= */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE =
  /^\d{4}-\d{2}-\d{2}$/;

export interface SalesRecord {
  saleId: string;
  saleNumber: number;
  createdAt: string;
  locationId: string;
  locationName: string;
  cashierId: string;
  currency: 'NGN';
  method: PaymentMethod;
  customerName?: string | null;
  status: 'completed';
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lineCount: number;
  units: number;
}

export type RecordedReceipt =
  PosReceipt & {
    status: 'completed';
  };

export interface SalesPage {
  items: SalesRecord[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface SaleFilters {
  search: string;
  from: string;
  to: string;
  offset: number;
  locationId?: string;
}

/* =========================================================
   RESPONSE VALIDATION
   ========================================================= */

function isNonnegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function validCustomerName(
  value: unknown,
): boolean {
  return (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.length <= 120 &&
      !/[\u0000-\u001f\u007f]/.test(value)
    )
  );
}

function validDate(
  value: string,
): boolean {
  if (!DATE.test(value)) {
    return false;
  }

  const date =
    new Date(value + 'T00:00:00.000Z');

  return (
    Number.isFinite(date.getTime()) &&

    date.toISOString().slice(0, 10) ===
      value
  );
}

function isSalesRecord(
  value: unknown,
): value is SalesRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const sale =
    value as SalesRecord;

  return (
    typeof sale.saleId === 'string' &&
    UUID.test(sale.saleId) &&

    typeof sale.locationId === 'string' &&
    UUID.test(sale.locationId) &&

    typeof sale.locationName === 'string' &&

    typeof sale.cashierId === 'string' &&
    UUID.test(sale.cashierId) &&

    Number.isSafeInteger(sale.saleNumber) &&
    sale.saleNumber > 0 &&

    typeof sale.createdAt === 'string' &&
    Number.isFinite(
      Date.parse(sale.createdAt),
    ) &&

    sale.status === 'completed' &&
    sale.currency === 'NGN' &&

    isPaymentMethod(sale.method) &&

    validCustomerName(
      sale.customerName,
    ) &&

    [
      sale.subtotalMinor,
      sale.discountMinor,
      sale.taxMinor,
      sale.totalMinor,
      sale.units,
      sale.lineCount,
    ].every(isNonnegativeInteger) &&

    sale.discountMinor <=
      sale.subtotalMinor &&

    sale.totalMinor ===
      sale.subtotalMinor -
        sale.discountMinor +
        sale.taxMinor
  );
}

function isRecordedReceipt(
  value: unknown,
): value is RecordedReceipt {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const receipt =
    value as RecordedReceipt;

  if (
    typeof receipt.saleId !== 'string' ||
    !UUID.test(receipt.saleId) ||

    typeof receipt.locationId !== 'string' ||
    !UUID.test(receipt.locationId) ||

    typeof receipt.locationName !== 'string' ||

    typeof receipt.cashierId !== 'string' ||
    !UUID.test(receipt.cashierId) ||

    !Number.isSafeInteger(receipt.saleNumber) ||
    receipt.saleNumber <= 0 ||

    typeof receipt.createdAt !== 'string' ||

    !Number.isFinite(
      Date.parse(receipt.createdAt),
    ) ||

    receipt.status !== 'completed' ||
    receipt.currency !== 'NGN' ||

    !isPaymentMethod(receipt.method) ||

    !validCustomerName(
      receipt.customerName,
    ) ||

    !Array.isArray(receipt.items) ||
    receipt.items.length < 1 ||

    ![
      receipt.subtotalMinor,
      receipt.discountMinor,
      receipt.taxMinor,
      receipt.totalMinor,
      receipt.tenderedMinor,
      receipt.changeMinor,
    ].every(isNonnegativeInteger) ||

    receipt.discountMinor >
      receipt.subtotalMinor ||

    receipt.totalMinor !==
      receipt.subtotalMinor -
        receipt.discountMinor +
        receipt.taxMinor ||

    !validSalePayment(
      receipt,
      receipt.totalMinor,
    ) ||

    receipt.changeMinor !==
      receipt.tenderedMinor -
        receipt.totalMinor
  ) {
    return false;
  }

  const validLines =
    receipt.items.every(line => (
      line &&

      typeof line.variantId === 'string' &&
      UUID.test(line.variantId) &&

      typeof line.name === 'string' &&

      Number.isInteger(line.quantity) &&
      line.quantity > 0 &&

      Number.isSafeInteger(
        line.unitPriceMinor,
      ) &&

      line.unitPriceMinor > 0 &&

      Number.isSafeInteger(
        line.lineTotalMinor,
      ) &&

      line.lineTotalMinor ===
        line.quantity *
          line.unitPriceMinor
    ));

  if (!validLines) {
    return false;
  }

  const subtotal =
    receipt.items.reduce(
      (sum, line) =>
        sum + line.lineTotalMinor,
      0,
    );

  return (
    Number.isSafeInteger(subtotal) &&

    subtotal === receipt.subtotalMinor
  );
}

/* =========================================================
   AUTHENTICATED EDGE FUNCTION REQUEST
   ========================================================= */

async function requestHistory<T>(
  token: string,
  params: URLSearchParams,
  kind: 'list' | 'receipt',
): Promise<T> {
  if (
    typeof token !== 'string' ||
    !token.trim()
  ) {
    throw new Error(
      'Your staff session expired. Sign in again.',
    );
  }

  const {
    url,
    publishableKey,
  } = getSupabaseConfig();

  const endpoint = new URL(
    '/functions/v1/sales-history',
    url,
  );

  const query =
    new URLSearchParams(params);

  query.set('view', kind);

  endpoint.search =
    query.toString();

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'GET',

      headers: {
        apikey:
          publishableKey,

        authorization:
          'Bearer ' + token,

        accept:
          'application/json',
      },

      cache:
        'no-store',

      redirect:
        'error',

      signal:
        AbortSignal.timeout(12_000),
    });

  } catch {
    throw new Error(
      'Cannot reach Sales History. Check your connection and retry.',
    );
  }

  const body: unknown =
    await response.json().catch(
      () => null,
    );

  const result = body as {
    ok?: unknown;
    error?: unknown;
  } | null;

  if (
    !response.ok ||
    result?.ok !== true
  ) {
    if (response.status === 401) {
      throw new Error(
        'Your session expired. Sign in again.',
      );
    }

    if (response.status === 403) {
      throw new Error(
        'This staff account cannot view these sales.',
      );
    }

    if (response.status === 404) {
      throw new Error(
        'The requested receipt was not found.',
      );
    }

    if (
      response.status < 500 &&
      typeof result?.error === 'string'
    ) {
      throw new Error(
        result.error.slice(0, 180),
      );
    }

    throw new Error(
      'Sales History is temporarily unavailable. Retry this page.',
    );
  }

  return body as T;
}

/* =========================================================
   PAGINATED SALES HISTORY
   ========================================================= */

export async function loadSalesPage(
  token: string,
  filters: SaleFilters,
): Promise<SalesPage> {
  if (
    !Number.isSafeInteger(filters.offset) ||
    filters.offset < 0 ||
    filters.offset > 10_000
  ) {
    throw new Error(
      'The requested sales page is invalid.',
    );
  }

  if (
    (
      filters.from &&
      !validDate(filters.from)
    ) ||

    (
      filters.to &&
      !validDate(filters.to)
    )
  ) {
    throw new Error(
      'Select valid calendar dates.',
    );
  }

  if (
    filters.from &&
    filters.to &&
    filters.from > filters.to
  ) {
    throw new Error(
      'The start date must be before the end date.',
    );
  }

  const search =
    filters.search.trim().slice(0, 100);

  const normalized =
    /^GR-0*\d+$/i.test(search)

      ? search.replace(
          /^GR-0*/i,
          '',
        ) || '0'

      : search;

  const params = new URLSearchParams({
    search:
      normalized,

    from:
      filters.from,

    to:
      filters.to,

    offset:
      String(filters.offset),

    limit:
      '30',
  });

  if (filters.locationId) {
    if (!UUID.test(filters.locationId)) {
      throw new Error(
        'Select a valid sales location.',
      );
    }

    params.set(
      'locationId',
      filters.locationId,
    );
  }

  const result = await requestHistory<{
    ok: true;
    items: unknown;
    hasMore: unknown;
    offset?: unknown;
    limit?: unknown;
  }>(
    token,
    params,
    'list',
  );

  if (
    !Array.isArray(result.items) ||

    result.items.length > 30 ||

    typeof result.hasMore !== 'boolean' ||

    !result.items.every(
      isSalesRecord,
    )
  ) {
    throw new Error(
      'Sales History returned an unexpected response.',
    );
  }

  return {
    items:
      result.items,

    hasMore:
      result.hasMore,

    offset:
      filters.offset,

    limit:
      30,
  };
}

/* =========================================================
   RETRIEVE A RECORDED RECEIPT
   ========================================================= */

export async function loadRecordedReceipt(
  token: string,
  saleId: string,
): Promise<RecordedReceipt> {
  if (!UUID.test(saleId)) {
    throw new Error(
      'The requested receipt reference is invalid.',
    );
  }

  const result = await requestHistory<{
    ok: true;
    receipt: unknown;
  }>(
    token,

    new URLSearchParams({
      saleId,
    }),

    'receipt',
  );

  if (
    !isRecordedReceipt(
      result.receipt,
    ) ||

    result.receipt.saleId.toLowerCase() !==
      saleId.toLowerCase()
  ) {
    throw new Error(
      'Receipt data could not be verified.',
    );
  }

  return result.receipt;
}