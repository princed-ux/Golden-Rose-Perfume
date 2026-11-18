'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { NEW_PASSWORD_HINT, newPasswordError, resolveAuthOrigin, validEmail } from '@/src/lib/customer/auth-policy';
import { UUID, type OperationResult } from '@/src/lib/golden-rose/contracts';
import { employeeAdminClient, employeeEmailConfirmation, employeePublicAuthClient } from '@/src/lib/golden-rose/employee-admin';
import { isEmployeeRole } from '@/src/lib/golden-rose/employees';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';

const failed = (message: string): OperationResult => ({ status: 'error', message });

async function sendConfirmation(email: string) {
  const origin = resolveAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL, (await headers()).get('host'));
  if (!origin) return false;
  try {
    const { error } = await employeePublicAuthClient().auth.resend({
      type: 'signup', email, options: { emailRedirectTo: new URL('/staff/login', origin).toString() },
    });
    return !error;
  } catch { return false; }
}

export async function manageEmployeeAccount(_: OperationResult, form: FormData): Promise<OperationResult> {
  const access = await getStaffAccess();
  if ('reason' in access || access.role !== 'owner') return failed('Active owner access is required.');
  const { data: identity } = await (await createClient()).auth.getUser(access.token);
  if (identity.user?.id !== access.userId || !identity.user.email_confirmed_at || identity.user.is_anonymous) {
    return failed('Sign in with your verified owner account before managing employee passwords.');
  }
  const admin = employeeAdminClient();
  if (!admin) return failed('Direct account creation and password replacement require the server staff admin key.');
  const confirmation = await employeeEmailConfirmation();
  if (confirmation !== 'required') return failed(confirmation === 'disabled'
    ? 'Supabase Auth must require work email confirmation before managing direct employee credentials.'
    : 'The web server could not verify Auth email confirmation settings. Try again later.');

  const field = (name: string) => String(form.get(name) ?? '').trim();
  const operation = field('operation');
  const id = field('id');
  const rpc = (p_action: string, p_payload: Record<string, string>) =>
    admin.rpc('gr_owner_employee_account', { p_owner: access.userId, p_action, p_payload });
  const rpcError = (error: { code: string; message: string }, fallback: string) => failed(
    error.code === '22023' ? error.message
      : error.code === 'PGRST202' ? 'Direct employee accounts await the reviewed database migration.' : fallback,
  );

  try {
    if (operation === 'resend_confirmation' && UUID.test(id)) {
      const { data, error } = await rpc('confirmation', { id });
      if (error) return rpcError(error, 'Email confirmation could not be requested.');
      if (typeof data?.email !== 'string' || !await sendConfirmation(data.email)) {
        return failed('Email confirmation could not be sent. Check Supabase email delivery and try again.');
      }
      return { status: 'success', message: 'Confirmation email requested. The employee must open it before signing in.' };
    }
    const password = form.get('password');
    if (typeof password !== 'string') return failed(NEW_PASSWORD_HINT);
    const passwordError = newPasswordError(password, form.get('passwordConfirmation'));
    if (passwordError) return failed(passwordError);

    if (operation === 'create_account') {
      const email = field('email').toLowerCase();
      const fullName = field('fullName');
      const username = field('username').toLowerCase();
      const role = field('role');
      const locationId = field('locationId');
      if (!validEmail(email) || fullName.length < 2 || fullName.length > 120 ||
        (username && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) ||
        !isEmployeeRole(role) || !UUID.test(locationId)) return failed('Check the name, work email, role and active store.');

      const profile = { email, fullName, username, role, locationId };
      const reserved = await rpc('reserve', profile);
      if (reserved.error) return rpcError(reserved.error, 'Could not prepare this employee account.');
      if (!UUID.test(reserved.data?.version ?? '')) return failed('Could not verify the account request.');
      const recovered = UUID.test(reserved.data?.userId ?? '');
      let userId = recovered ? reserved.data.userId as string : null;
      if (!userId) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: false, app_metadata: { gr_staff_provision: reserved.data.version },
        });
        if (error || !data.user) return failed(
          error?.code === 'email_exists' || error?.code === 'user_already_exists'
            ? 'This email already has an account, or a previous request just created it. Retry once to recover the request; otherwise use an invitation.'
            : 'Auth could not confirm creation. Check the password policy, then retry with the same work email.',
        );
        userId = data.user.id;
      }
      const { data, error } = await rpc('complete_creation', { ...profile, id: userId });
      if (error) return rpcError(error, 'The Auth account may already exist, but staff access was not enabled. Retry Add Employee with the same email to recover it.');
      revalidatePath('/workspace/staff');
      const confirmed = data?.confirmed === true;
      const sent = !confirmed && await sendConfirmation(email);
      return { status: 'success', message: [
        recovered
          ? 'Account recovered. The previous temporary password remains in effect; replace it from the directory if needed.'
          : 'Employee created. Give them the temporary password privately; it expires in 24 hours.',
        confirmed ? 'Their verified email is on file.' : sent ? 'They must confirm their work email first.'
          : 'Confirmation email could not be sent. Check Auth email delivery and use Resend confirmation.',
        'They must change the temporary password before using the workspace.',
      ].join(' ') };
    }

    if (operation === 'replace_password' && UUID.test(id)) {
      const started = await rpc('begin_reset', { id });
      if (started.error) return rpcError(started.error, 'Could not start the password replacement.');
      const version = started.data?.version;
      if (!UUID.test(version ?? '')) return failed('Could not verify the password replacement request.');
      const { error } = await admin.auth.admin.updateUserById(id, { password, app_metadata: { gr_staff_reset: version } });
      if (error) {
        revalidatePath('/workspace/staff');
        return failed('Replacement was not confirmed. Business access remains blocked; wait two minutes and retry with a strong password.');
      }
      const completed = await rpc('complete_reset', { id, version });
      revalidatePath('/workspace/staff');
      if (completed.error) return failed('The new password may be set, but the account is still blocked. Wait two minutes and retry the replacement.');
      const needsConfirmation = completed.data?.confirmed !== true;
      const sent = needsConfirmation && typeof completed.data?.email === 'string' && await sendConfirmation(completed.data.email);
      return { status: 'success', message: 'Temporary password replaced. Share it privately. It expires in 24 hours, and the employee must change it before returning to the workspace.' +
        (needsConfirmation ? sent ? ' A new confirmation email was requested.' : ' Use Resend email confirmation to get a new confirmation link.' : '') };
    }
    return failed('Choose an employee account operation.');
  } catch {
    return failed('The operation could not be confirmed. Refresh the directory before retrying.');
  }
}
