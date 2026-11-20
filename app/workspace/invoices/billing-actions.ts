'use server';

import { revalidatePath } from 'next/cache';
import { canViewModule } from '@/src/domain/permissions';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import type {
  BillingAction, BillingDocument, BillingFilters, BillingPayload, BillingRegisterData, BillingResult,
} from '@/src/lib/golden-rose/billing';
import type { InvoiceCustomerChoice, LookupPage } from './lookup-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Command = BillingAction | 'list' | 'get' | 'customers';
const writes: readonly BillingAction[] = [
  'configure', 'save', 'accept', 'convert', 'issue', 'void', 'apply_pos', 'propose_payment', 'review_payment',
];

async function execute<T>(action: Command, payload: BillingPayload): Promise<BillingResult<T>> {
  try {
    const access = await getStaffAccess();
    if ('reason' in access && access.reason === 'unavailable') return { error: 'Staff verification is temporarily unavailable. Retry without signing out.' };
    if ('reason' in access || !canViewModule(access.role, 'invoices')) {
      return { error: 'Your active staff role does not allow access to billing.' };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { error: 'Invalid billing request.' };
    }
    const client = await createClient();
    const { data, error } = await client.rpc('gr_billing', { p_action: action, p_payload: payload });
    if (!error && data !== null && typeof data === 'object' && (Array.isArray(data) ? action === 'customers' : action !== 'customers')) return { data: data as T };
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
  const result = await execute<BillingRegisterData>('list', { ...filters });
  if (result.data && (!Array.isArray(result.data.documents) || !Array.isArray(result.data.stores) || typeof result.data.more !== 'boolean')) return {error:'Billing returned an unexpected register. Retry before making changes.'};
  return result;
}

export async function getBillingDocument(id: string): Promise<BillingResult<BillingDocument>> {
  if (!UUID.test(id)) return {error:'Select a valid billing document.'};
  const result = await execute<BillingDocument>('get', {id});
  if (result.data && (result.data.id !== id || !Array.isArray(result.data.lines) || !Array.isArray(result.data.payments))) return {error:'Billing returned an unverifiable document. Refresh and retry.'};
  return result;
}

export async function updateBilling(action: BillingAction, payload: BillingPayload): Promise<BillingResult<BillingDocument | { configured: true }>> {
  if (!writes.includes(action)) return { error: 'Unknown billing operation.' };
  const result = await execute<BillingDocument | {configured:true}>(action, payload);
  if (result.data) {
    revalidatePath('/workspace/invoices');
    revalidatePath('/workspace/customers');
    revalidatePath('/workspace/orders');
  }
  return result;
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
