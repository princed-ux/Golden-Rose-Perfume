import 'server-only';

import { getSupabaseConfig } from '@/src/lib/supabase/config';
import type { PosReceipt } from '@/app/workspace/pos/types';

export interface SalesRecord {
  saleId: string;
  saleNumber: number;
  createdAt: string;
  locationId: string;
  locationName: string;
  cashierId: string;
  currency: 'NGN';
  method: 'cash';
  status: 'completed';
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lineCount: number;
  units: number;
}

export type RecordedReceipt = PosReceipt & { status: 'completed' };
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

async function requestHistory<T>(
  token: string,
  params: URLSearchParams,
  kind: 'list' | 'receipt',
): Promise<T> {
  const { url, publishableKey } = getSupabaseConfig();
  const endpoint = new URL('/functions/v1/sales-history', url);
  params.set('view', kind);
  endpoint.search = params.toString();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
        authorization: 'Bearer ' + token,
        accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('Cannot reach Sales History. Check your connection and retry.');
  }

  const body: unknown = await response.json().catch(() => null);
  const result = body as { ok?: unknown; error?: unknown } | null;
  if (!response.ok || result?.ok !== true) {
    if (response.status === 401) throw new Error('Your session expired. Sign in again.');
    if (response.status === 403) throw new Error('This staff account cannot view these sales.');
    if (response.status === 404) throw new Error('The requested receipt was not found.');
    if (response.status < 500 && typeof result?.error === 'string') {
      throw new Error(result.error.slice(0, 180));
    }
    throw new Error('Sales History is temporarily unavailable. Retry this page.');
  }
  return body as T;
}

export async function loadSalesPage(
  token: string,
  filters: SaleFilters,
): Promise<SalesPage> {
  const params = new URLSearchParams({
    search: /^GR-0*\d+$/i.test(filters.search) ? filters.search.replace(/^GR-0*/i, '') || '0' : filters.search,
    from: filters.from,
    to: filters.to,
    offset: String(filters.offset),
    limit: '30',
  });
  if (filters.locationId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.locationId)) throw new Error('Select a valid sales location.');
    params.set('locationId', filters.locationId);
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('The start date must be before the end date.');
  const result = await requestHistory<SalesPage & { ok: true }>(token, params, 'list');
  if (!Array.isArray(result.items) || typeof result.hasMore !== 'boolean' || result.items.some(sale =>
    sale.status !== 'completed' || sale.currency !== 'NGN' ||
    ![sale.subtotalMinor, sale.discountMinor, sale.taxMinor, sale.totalMinor, sale.units, sale.lineCount].every(value => Number.isSafeInteger(value) && value >= 0) ||
    sale.totalMinor !== sale.subtotalMinor - sale.discountMinor + sale.taxMinor)) {
    throw new Error('Sales History returned an unexpected response.');
  }
  return {
    items: result.items,
    hasMore: result.hasMore,
    offset: filters.offset,
    limit: 30,
  };
}

export async function loadRecordedReceipt(
  token: string,
  saleId: string,
): Promise<RecordedReceipt> {
  const result = await requestHistory<{ ok: true; receipt: RecordedReceipt }>(
    token,
    new URLSearchParams({ saleId }),
    'receipt',
  );
  if (!result.receipt || result.receipt.saleId !== saleId ||
      result.receipt.status !== 'completed' || !Array.isArray(result.receipt.items)) {
    throw new Error('Receipt data could not be verified.');
  }
  return result.receipt;
}
