'use server';

import { canViewModule } from '@/src/domain/permissions';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import type {
  BillingAction, BillingDocument, BillingFilters, BillingPayload, BillingRegisterData, BillingResult,
} from '@/src/lib/golden-rose/billing';
import type { InvoiceCustomerChoice, LookupPage } from './lookup-actions';

type Command = BillingAction | 'list' | 'get' | 'customers';
const writes: readonly BillingAction[] = [
  'configure', 'save', 'accept', 'convert', 'issue', 'void', 'apply_pos', 'propose_payment', 'review_payment',
];

async function execute<T>(action: Command, payload: BillingPayload): Promise<BillingResult<T>> {
  try {
    const access = await getStaffAccess();
    if ('reason' in access || !canViewModule(access.role, 'invoices')) {
      return { error: 'Your active staff role does not allow access to billing.' };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { error: 'Invalid billing request.' };
    }
    const client = await createClient();
    const { data, error } = await client.rpc('gr_billing', { p_action: action, p_payload: payload });
    if (!error && data !== null && typeof data === 'object') return { data: data as T };
    if (error?.code === 'PGRST202' || error?.code === '42883') {
      return { error: 'The billing migration is not installed. Only local draft previews are available.', unavailable: true };
    }
    if (error && ['GR403', 'GR404', 'GR409', 'GR422'].includes(error.code)) {
      return { error: error.message };
    }
    console.error('Billing operation failed', { action, code: error?.code ?? 'unexpected_response' });
  } catch {
    console.error('Could not reach billing', { action });
  }
  return { error: 'Could not reach billing. Retry before assuming the operation completed.' };
}

export async function loadBilling(filters: BillingFilters): Promise<BillingResult<BillingRegisterData>> {
  return execute('list', { ...filters });
}

export async function getBillingDocument(id: string): Promise<BillingResult<BillingDocument>> {
  return execute('get', { id });
}

export async function updateBilling(action: BillingAction, payload: BillingPayload): Promise<BillingResult<BillingDocument | { configured: true }>> {
  if (!writes.includes(action)) return { error: 'Unknown billing operation.' };
  return execute(action, payload);
}

export async function findBillingCustomers(storeId: string, query: string): Promise<LookupPage<InvoiceCustomerChoice>> {
  const response = await execute<{ id: string; full_name: string; email: string | null; phone: string | null }[]>(
    'customers', { storeId, search: query },
  );
  if (!response.data) return { error: response.error };
  return { items: response.data.map(item => ({
    id: item.id, label: item.full_name, detail: item.email ?? item.phone ?? 'Customer at selected store',
    email: item.email, phone: item.phone,
  })), offset: 0, limit: 15, hasMore: false };
}
