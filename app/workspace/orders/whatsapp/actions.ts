
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  canViewModule,
} from '@/src/domain/permissions';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES = new Set([
  'contacted',
  'confirmed',
  'cancelled',
]);

/**
 * Staff-only enquiry progression.
 *
 * This does NOT record payment, issue a receipt,
 * create a POS sale or deduct inventory.
 *
 * The database independently checks:
 * - Authenticated staff session
 * - Active owner/manager/sales role
 * - Allowed status transition
 */
export async function updateWhatsAppEnquiryStatus(
  form: FormData,
): Promise<void> {
  const staff = await getStaffAccess();

  if (
    'reason' in staff ||
    !canViewModule(staff.role, 'orders')
  ) {
    redirect('/staff/login?reason=denied');
  }

  const id = form.get('id');
  const status = form.get('status');

  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    typeof status !== 'string' ||
    !STATUSES.has(status)
  ) {
    redirect(
      '/workspace/orders/whatsapp?notice=invalid',
    );
  }

  let successful = false;

  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_whatsapp_enquiry_update',
      {
        p_id: id,
        p_status: status,
      },
    );

    successful =
      !error &&
      data?.status === status;
  } catch {
    successful = false;
  }

  if (!successful) {
    redirect(
      '/workspace/orders/whatsapp?notice=failed',
    );
  }

  revalidatePath(
    '/workspace/orders/whatsapp',
  );

  revalidatePath(
    '/account/orders',
  );

  redirect(
    '/workspace/orders/whatsapp?notice=updated',
  );
}
