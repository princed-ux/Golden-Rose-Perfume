
'use server';

import { revalidatePath } from 'next/cache';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import type { CashSaleRequest, PosCatalogue, PosReceipt } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POS_ROLES = new Set(['owner', 'manager', 'cashier']);

async function requireRegisterToken(): Promise<string> {
  const staff = await getStaffAccess();

  if ('reason' in staff) {
    if (staff.reason === 'unavailable') {
      throw new Error('Staff access could not be checked. Check your connection and try again.');
    }
    if (staff.reason === 'denied') {
      throw new Error('Your account is not authorized to operate the register.');
    }
    throw new Error('Your staff session expired. Sign in again.');
  }

  if (!POS_ROLES.has(staff.role)) {
    throw new Error('Your account is not authorized to operate the register.');
  }

  return staff.token;
}

/**
 * Calls the deployed authenticated POS Edge Function.
 * Never passes a service-role key to the browser.
 */
async function callRegister<T>(
  token: string,
  search?: URLSearchParams,
  body?: object,
): Promise<T> {
  const { url, publishableKey } = getSupabaseConfig();
  const endpoint = new URL('/functions/v1/pos-register', url);

  if (search) {
    endpoint.search = search.toString();
  }

  let response: Response;
  const unavailable = body
    ? 'Register confirmation unavailable. Retry the same transaction reference.'
    : 'The register catalogue is temporarily unavailable. Check your connection and try again.';

  try {
    response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A sale may have committed even if the response was lost.
    throw new Error(unavailable);
  }

  if (response.status === 401) {
    throw new Error('Session expired. Sign in again.');
  }

  if (response.status === 403) {
    throw new Error('Your staff role cannot perform this operation.');
  }

  const data = await response.json().catch(() => null) as { ok?: boolean; error?: unknown } | null;

  if (!response.ok || data?.ok !== true) {
    if (!response.ok && response.status < 500 && typeof data?.error === 'string') {
      throw new Error(data.error.slice(0, 220));
    }

    throw new Error(unavailable);
  }

  return data as T;
}

/**
 * Live catalogue search.
 * Products are filtered server-side, allowing large imports.
 * Prices and stock come from the selected store location.
 */
export async function loadPosCatalogue(
  search = '',
  locationId: string | null = null,
  offset = 0,
): Promise<PosCatalogue> {
  const token = await requireRegisterToken();

  if (locationId !== null && !UUID.test(locationId)) {
    throw new Error('Invalid selling location.');
  }

  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new Error('Invalid catalogue offset.');
  }

  const params = new URLSearchParams({
    search: search.trim().slice(0, 100),
    offset: String(offset),
    limit: '40',
  });

  if (locationId) {
    params.set('locationId', locationId);
  }

  const data = await callRegister<PosCatalogue & { ok: true }>(
    token,
    params,
  );

  if (!Array.isArray(data.items) || !Array.isArray(data.locations)) {
    throw new Error('The live catalogue returned an unexpected response.');
  }

  return {
    items: data.items,
    locations: data.locations,
    selectedLocationId: data.selectedLocationId ?? null,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Records a completed cash sale.
 *
 * The database revalidates current prices and stock,
 * then creates the sale, stock movements, and receipt
 * within one atomic transaction.
 */
export async function completeCashSale(
  request: CashSaleRequest,
): Promise<PosReceipt> {
  const token = await requireRegisterToken();
  const items = request.items;

  if (
    !UUID.test(request.idempotencyKey) ||
    !UUID.test(request.locationId) ||
    request.method !== 'cash' ||
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 40 ||
    !Number.isSafeInteger(request.discountMinor) ||
    request.discountMinor < 0 ||
    !Number.isSafeInteger(request.tenderedMinor) ||
    request.tenderedMinor <= 0 ||
    items.some(
      item =>
        !UUID.test(item.variantId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100 ||
        !Number.isSafeInteger(item.expectedPriceMinor) ||
        item.expectedPriceMinor <= 0,
    ) ||
    new Set(items.map(item => item.variantId)).size !== items.length
  ) {
    throw new Error('Invalid items or cash amounts. Review the sale.');
  }

  const data = await callRegister<{
    ok: true;
    receipt: PosReceipt;
  }>(
    token,
    undefined,
    {
      action: 'checkout',
      ...request,
    },
  );

  if (
    !data.receipt ||
    !UUID.test(data.receipt.saleId) ||
    !Array.isArray(data.receipt.items)
  ) {
    throw new Error(
      'Receipt confirmation unavailable. Retry the SAME transaction.',
    );
  }

  revalidatePath('/workspace/pos');
  revalidatePath('/workspace/inventory');
  revalidatePath('/workspace/orders');
  revalidatePath('/workspace/customers');
  revalidatePath('/workspace/invoices');
  revalidatePath('/workspace/products');
  revalidatePath('/shop');

  return data.receipt;
}
