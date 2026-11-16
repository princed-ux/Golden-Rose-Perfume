'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getStaffPasswordState } from '@/src/lib/golden-rose/staff';
import { employeePasswordHint, strongEmployeePassword } from '@/src/lib/golden-rose/employee-passwords';
import { employeeAdminClient, employeeEmailConfirmation, employeePublicAuthClient } from '@/src/lib/golden-rose/employee-admin';
import { UUID, type OperationResult } from '@/src/lib/golden-rose/contracts';

export async function changeEmployeePassword(_: OperationResult, form: FormData): Promise<OperationResult> {
  const current = form.get('currentPassword');
  const next = form.get('password');
  const errorResult = (message: string): OperationResult => ({ status: 'error', message });
  if (typeof current !== 'string' || !current || current.length > 256) return errorResult('Enter your temporary password.');
  if (!strongEmployeePassword(next)) return errorResult(employeePasswordHint);
  if (next !== form.get('passwordConfirmation')) return errorResult('The new passwords do not match.');
  if (current === next) return errorResult('Choose a different password.');
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user?.email_confirmed_at || !user.email || await getStaffPasswordState(client) !== 'change_required') {
      return errorResult('Sign in again with your verified work email and current password. Ask the owner if the temporary password expired.');
    }
    const admin = employeeAdminClient();
    if (!admin) return errorResult('Staff password changes are unavailable. Ask the owner to check the staff configuration.');
    if (await employeeEmailConfirmation() !== 'required') {
      return errorResult('Staff password changes require work email confirmation. Ask the owner to check Supabase Auth settings.');
    }
    // Verify the current password even when the project's optional Auth setting is disabled.
    const freshClient = employeePublicAuthClient();
    const reauth = await freshClient.auth.signInWithPassword({ email: user.email, password: current });
    if (reauth.error || !reauth.data.session || reauth.data.user?.id !== user.id) {
      return errorResult(reauth.error?.status === 429 ? 'Too many attempts. Wait before trying again.' : 'The current password was not accepted.');
    }
    try {
      const { data: verified } = await freshClient.auth.getClaims(reauth.data.session.access_token);
      const sessionId = verified?.claims.session_id;
      if (verified?.claims.sub !== user.id || typeof sessionId !== 'string' || !UUID.test(sessionId) ||
          (await freshClient.rpc('gr_employee_password_state')).data !== 'change_required') {
        return errorResult('This password change is no longer available. Sign in again or contact the owner.');
      }
      const updated = await freshClient.auth.updateUser({ password: next, current_password: current });
      if (updated.error) return errorResult('The password could not be changed. Verify your credentials or try a different, stronger password.');
      const finished = await admin.rpc('gr_employee_password_complete', { p_actor: user.id, p_session: sessionId });
      await client.auth.signOut({ scope: 'local' });
      if (finished.data !== 'complete' || finished.error) {
        return errorResult('Your password changed, but staff access could not be enabled. Sign in with your new password; if still asked to change it, contact the owner.');
      }
    } finally {
      await freshClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  } catch {
    return errorResult('Password change could not be confirmed. Sign in again before retrying.');
  }
  redirect('/staff/login?reason=password-changed');
}
