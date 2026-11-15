'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { resolveAuthOrigin, validEmail } from '@/src/lib/customer/auth-policy';
import { UUID, type OperationResult } from '@/src/lib/golden-rose/contracts';
import { isEmployeeRole } from '@/src/lib/golden-rose/employees';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';

export type EmployeeAction = OperationResult & { inviteUrl?: string };

async function sendInvite(email: string, link: string, tokenHash: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.STAFF_INVITE_FROM?.trim();
  if (!key || !from || !link.startsWith('https://')) return 'unconfigured';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
        'Idempotency-Key': 'golden-rose-employee/' + tokenHash,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from, to: [email], subject: 'Your Golden Rose staff invitation',
        text: 'You have been invited to the Golden Rose staff workspace.\n\n' +
          'Open this link and use your work email to set your own password or sign in to an existing account.\n' +
          link + '\n\nThe invitation expires in 24 hours. If you were not expecting it, ignore this email.',
      }),
    });
    return response.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

export async function manageEmployee(_: EmployeeAction, form: FormData): Promise<EmployeeAction> {
  const staff = await getStaffAccess();
  if ('reason' in staff || staff.role !== 'owner') return { status: 'error', message: 'Active owner access is required.' };
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const action = field('operation');
  const id = field('id');
  let payload: Record<string, unknown> = {};
  if (action === 'invite' || action === 'update') {
    const role = field('role');
    const locationId = field('locationId');
    if (!isEmployeeRole(role) || !UUID.test(locationId)) return { status: 'error', message: 'Choose an employee role and an active store.' };
    payload = { role, locationId };
  }
  if (action === 'invite') {
    const fullName = field('fullName');
    const email = field('email').toLowerCase();
    const username = field('username').toLowerCase();
    if (!validEmail(email) || fullName.length < 2 || fullName.length > 120 ||
        (username && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))) {
      return { status: 'error', message: 'Check the name, email and optional username.' };
    }
    payload = { ...payload, fullName, email, username };
  } else if (['update', 'reissue', 'cancel_invite', 'suspend', 'restore', 'revoke'].includes(action) && UUID.test(id)) {
    payload.id = id;
  } else return { status: 'error', message: 'Choose an employee or invitation first.' };

  const issue = action === 'invite' || action === 'reissue';
  const origin = issue ? resolveAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL, (await headers()).get('host')) : null;
  if (issue && !origin) return { status: 'error', message: 'Set the website address before issuing an invitation.' };
  const code = issue ? randomBytes(32).toString('base64url') : null;
  const tokenHash = code ? createHash('sha256').update(code).digest('hex') : '';
  if (code) payload.tokenHash = tokenHash;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gr_staff_manage', { p_action: action, p_payload: payload });
  if (error) return { status: 'error', message: error.code === '22023' ? error.message
    : error.code === 'PGRST202' ? 'Employee management is awaiting the reviewed database migration.'
    : 'Staff access could not be updated. Refresh the page before retrying.' };
  revalidatePath('/workspace/staff');
  if (!code || !origin || typeof data?.email !== 'string') return { status: 'success', message: 'Staff access updated.' };

  const link = new URL('/staff/employee-invite', origin);
  link.searchParams.set('invite', code);
  const delivered = await sendInvite(data.email, link.toString(), tokenHash);
  if (delivered === 'sent') return { status: 'success', message: 'Invitation sent to the employee’s work email.' };
  return { status: 'success', inviteUrl: link.toString(), message: delivered === 'failed'
    ? 'Email delivery could not be confirmed. Share this invitation link privately or reissue it.'
    : 'Invitation created. Share this link privately with the employee. It expires in 24 hours.' };
}
