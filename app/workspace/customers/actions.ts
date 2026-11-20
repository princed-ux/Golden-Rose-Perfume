'use server';

import { revalidatePath } from 'next/cache';
import { canViewModule } from '@/src/domain/permissions';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { crmMessage } from './data';

export type CrmActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const result = (status: CrmActionState['status'], message: string): CrmActionState =>
  ({ status, message });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitCrmCustomer(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const staff = await getStaffAccess();
  if ('reason' in staff && staff.reason === 'unavailable') return result('error', 'Staff verification is temporarily unavailable. Retry without signing out.');
  if ('reason' in staff || !canViewModule(staff.role, 'customers')) {
    return result('error', 'Sign in with an authorized CRM staff account.');
  }

  const value = (field: string) => String(form.get(field) ?? '').trim();
  const id = value('id');
  const updatedAt = value('updatedAt');
  const mode = value('mode');
  const locationId = value('locationId');

  if (!['create', 'update', 'archive', 'restore'].includes(mode)) {
    return result('error', 'Select a valid customer operation.');
  }
  if (mode !== 'create' && (!UUID.test(id) || updatedAt.length < 10 || updatedAt.length > 64)) {
    return result('error', 'Customer details have expired. Refresh the directory.');
  }
  if (locationId && !UUID.test(locationId)) {
    return result('error', 'Select a valid retail store.');
  }
  if (['archive', 'restore'].includes(mode) && staff.role === 'sales_staff') {
    return result('error', 'Only an owner or manager can change customer status.');
  }

  const payload: Record<string, string> = {
    id,
    locationId,
    updatedAt,
  };

  if (mode === 'create' || mode === 'update') {
    const fullName = value('fullName');
    const email = value('email').toLowerCase();
    const phone = value('phone');
    const notes = value('notes');
    if (fullName.length < 2 || fullName.length > 120 ||
        notes.length > 2000 || (!email && !phone) ||
        (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
        (phone && (phone.length > 25 || !/^[+0-9][0-9 ()-]{6,24}$/.test(phone)))) {
      return result('error', 'Enter a name, valid contact information, and notes under 2,000 characters.');
    }
    Object.assign(payload, { fullName, email, phone, notes });
  }

  try {
    const client = await createClient();
    const { data, error } = await client.rpc('gr_crm_manage', {
      p_action: mode,
      p_payload: payload,
    });
    if (error) return result('error', crmMessage(error));
    if (data?.ok !== true || !data.customer?.id) {
      return result('error', 'Customer update could not be confirmed. Refresh the directory.');
    }
    revalidatePath('/workspace/customers');
    revalidatePath('/workspace/invoices');
    return result('success',
      mode === 'create' ? 'Customer created and saved.' :
      mode === 'update' ? 'Customer details updated.' :
      mode === 'archive' ? 'Customer archived. Its history remains available.' :
      'Customer restored.');
  } catch {
    return result('error', 'Could not reach customer CRM. Check your connection and try again.');
  }
}
