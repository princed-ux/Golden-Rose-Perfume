'use server';

import { revalidatePath } from 'next/cache';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import type { CashSaleRequest, RegisterCatalog, RegisterReceipt } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POS_ROLES = new Set(['owner', 'manager', 'cashier', 'sales_staff']);

async function verifiedToken(): Promise<string> {
  const access = await getStaffAccess();
  if ('reason' in access) throw new Error('Your staff session has expired. Please sign in again.');
  if (!POS_ROLES.has(access.role)) throw new Error('This account is not authorized to operate the register.');
  return access.token;
}

async function posApi<T>(token: string, params?: URLSearchParams, body?: object): Promise<T> {
  const { url, publishableKey } = getSupabaseConfig();
  const endpoint = new URL('/functions/v1/pos-register', url);
  if (params) endpoint.search = params.toString();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        apikey: publishableKey,
        authorization: 'Bearer ' + token,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('The register could not reach Golden Rose. Check your connection and retry the same transaction.');
  }

  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') {
    throw new Error('The register returned an invalid response. Retry the same transaction.');
  }
  const json = result as Record<string, unknown>;
  if (!response.ok || json.ok !== true) {
    const message = typeof json.error === 'string' && response.status < 500
      ? json.error.slice(0, 220)
      : 'The register could not confirm the request. Retry the same transaction.';
    throw new Error(message);
  }
  return json as T;
}

export async function loadRegisterProducts(
  search = '', locationId: string | null = null, offset = 0,
): Promise<RegisterCatalog> {
  const token = await verifiedToken();
  if (locationId !== null && !UUID.test(locationId)) throw new Error('Invalid store location.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new Error('Invalid catalogue page.');
  }
  const params = new URLSearchParams({ search: search.trim().slice(0, 100), offset: String(offset), limit: '40' });
  if (locationId) params.set('locationId', locationId);
  const response = await posApi<{ ok: true } & RegisterCatalog>(token, params);
  if (!Array.isArray(response.items) || !Array.isArray(response.locations)) {
    throw new Error('The catalogue returned an unexpected response.');
  }
  return {
    items: response.items,
    locations: response.locations,
    selectedLocationId: response.selectedLocationId ?? null,
    hasMore: Boolean(response.hasMore),
  };
}

export async function recordCashSale(request: CashSaleRequest): Promise<RegisterReceipt> {
  const token = await verifiedToken();
  if (!UUID.test(request.idempotencyKey) || !UUID.test(request.locationId) ||
    request.method !== 'cash' || !Array.isArray(request.items) ||
    request.items.length < 1 || request.items.length > 40 ||
    !Number.isSafeInteger(request.discountMinor) || request.discountMinor < 0 ||
    !Number.isSafeInteger(request.tenderedMinor) || request.tenderedMinor <= 0 ||
    request.items.some(line =>
      !UUID.test(line.variantId) || !Number.isInteger(line.quantity) || line.quantity < 1 ||
      line.quantity > 100 || !Number.isSafeInteger(line.expectedPriceMinor) ||
      line.expectedPriceMinor <= 0
    ) || new Set(request.items.map(line => line.variantId)).size !== request.items.length
  ) throw new Error('The sale contains invalid items or amounts.');

  const response = await posApi<{ ok: true; receipt: RegisterReceipt }>(
    token, undefined, { action: 'checkout', ...request },
  );
  if (!response.receipt || !UUID.test(response.receipt.saleId) ||
    !Array.isArray(response.receipt.items)) {
    throw new Error('Sale confirmation could not be verified. Retry using the same transaction.');
  }

  revalidatePath('/workspace/pos');
  revalidatePath('/workspace/inventory');
  revalidatePath('/workspace/products');
  revalidatePath('/shop');
  return response.receipt;
}
