'use server';

import { createHash } from 'node:crypto';
import { createClient as createAuthClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRoleHome } from '@/src/domain/permissions';
import { resolveAuthOrigin, validEmail, validNewPassword } from '@/src/lib/customer/auth-policy';
import type { OperationResult } from '@/src/lib/golden-rose/contracts';
import { employeeInviteCode, isEmployeeRole } from '@/src/lib/golden-rose/employees';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { createClient } from '@/src/lib/supabase/server';

export async function acceptEmployeeInvitation(_: OperationResult, form: FormData): Promise<OperationResult> {
  const value = (name: string) => typeof form.get(name) === 'string' ? String(form.get(name)) : '';
  const code = value('invite').trim();
  const mode = value('mode');
  const email = value('email').trim().toLowerCase();
  const password = value('password');
  const failed = (message: string): OperationResult => ({ status: 'error', message });
  if (!employeeInviteCode.test(code)) return failed('Use the invitation link from your employer.');
  if (mode !== 'current' && (!validEmail(email) || !password || password.length > 256)) {
    return failed('Enter your work email and password.');
  }
  const hash = createHash('sha256').update(code).digest('hex');
  let role: string | null = null;
  try {
    const supabase = await createClient();
    if (mode === 'register') {
      if (!validNewPassword(password, value('confirmation'))) return failed('Use at least 8 characters and enter the same password twice.');
      const { data: valid, error: validationError } = await supabase.rpc('gr_staff_invite_valid', { p_hash: hash, p_email: email });
      if (validationError?.code === 'PGRST202') return failed('Employee invitations are awaiting the reviewed database migration.');
      if (validationError || valid !== true) return failed('This invitation is invalid, expired, or for another email.');
      const origin = resolveAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL, (await headers()).get('host'));
      if (!origin) return failed('Email confirmation is unavailable on this website address.');
      const callback = new URL('/auth/callback', origin);
      callback.searchParams.set('employee_invite', code);
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: callback.toString() },
      });
      if (error || data.session) {
        if (data.session) await supabase.auth.signOut({ scope: 'local' });
        return failed(error?.status === 429 ? 'Too many attempts. Wait before trying again.'
          : 'Could not start email confirmation. Existing account holders can choose Sign in.');
      }
      return { status: 'success', message: 'Check your work email to confirm your account. After confirmation, return to this link or use the signed-in account option.' };
    }
    if (mode === 'current') {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user?.email_confirmed_at) return failed('Confirm your work email and sign in first.');
      const accepted = await supabase.rpc('gr_staff_invite_accept', { p_hash: hash });
      if (accepted.error || typeof accepted.data !== 'string' || !isEmployeeRole(accepted.data)) {
        return failed('This invitation is unavailable for the signed-in account. Contact your employer.');
      }
      role = accepted.data;
    } else if (mode === 'login') {
      const { url, publishableKey } = getSupabaseConfig();
      const client = createAuthClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) return failed('Sign-in failed. Use the confirmed work account named in your invitation.');
      const accepted = await client.rpc('gr_staff_invite_accept', { p_hash: hash });
      if (accepted.error || typeof accepted.data !== 'string' || !isEmployeeRole(accepted.data)) {
        return failed('This invitation is invalid, expired, or for another account. Contact your employer.');
      }
      role = accepted.data;
      const { error: cookieError } = await supabase.auth.setSession(data.session);
      if (cookieError) return { status: 'success', message: 'Invitation accepted. Use staff sign-in to open your workspace.' };
    }
  } catch {
    return failed('The invitation could not be processed. Try again.');
  }
  if (!role || !isEmployeeRole(role)) return failed('Choose how to establish your work account.');
  redirect(getRoleHome(role) + '?notice=signed-in');
}
