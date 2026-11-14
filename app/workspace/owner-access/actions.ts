'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { validEmail } from '@/src/lib/customer/auth-policy';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { UUID, type OperationResult } from '@/src/lib/golden-rose/contracts';

export type OwnerActionResult = OperationResult & { code?: string };

export async function manageOwnerAccess(_: OwnerActionResult, form: FormData): Promise<OwnerActionResult> {
  const staff = await getStaffAccess();
  if ('reason' in staff || staff.role !== 'owner') return { status: 'error', message: 'Active owner access required.' };
  const action = form.get('operation');
  const email = form.get('email');
  const id = form.get('id');
  let payload: object;
  let code: string | undefined;
  if (action === 'invite' && typeof email === 'string' && validEmail(email.trim())) {
    code = randomBytes(32).toString('base64url');
    payload = { email: email.trim(), tokenHash: createHash('sha256').update(code).digest('hex') };
  } else if ((action === 'revoke' || action === 'suspend' || action === 'restore' || action === 'remove') &&
      typeof id === 'string' && UUID.test(id)) {
    payload = { id };
  } else {
    return { status: 'error', message: 'Enter the confirmed recipient email or select an access action.' };
  }
  try {
    const client = await createClient();
    const { error } = await client.rpc('gr_owner_access', { p_action: action, p_payload: payload });
    if (error) return { status: 'error', message: error.code === '22023' ? error.message : 'Owner access could not be updated.' };
    revalidatePath('/workspace/staff');
    return { status: 'success', message: code ? 'Invitation created. Share this code privately. It expires in 24 hours.' : 'Owner access updated.', code };
  } catch {
    return { status: 'error', message: 'Owner access is temporarily unavailable.' };
  }
}
