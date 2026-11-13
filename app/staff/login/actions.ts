'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { verifyStaffToken } from '@/src/lib/golden-rose/staff';
import type { OperationResult } from '@/src/lib/golden-rose/contracts';

export async function signInStaff(_: OperationResult, form: FormData): Promise<OperationResult> {
  const email = form.get('email');
  const password = form.get('password');
  if (typeof email !== 'string' || email.length > 254 || !email.trim().includes('@') ||
      typeof password !== 'string' || !password || password.length > 256) {
    return { status: 'error', message: 'Enter your work email and password.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
      // Metadata only: never log credentials or authentication tokens.
      console.error('[Golden Rose staff auth] password sign-in failed', {
        status: error?.status ?? null,
        code: error?.code ?? 'missing_session_or_transport',
        type: error?.name ?? 'unknown',
      });
      const message = error?.status === 429 ? 'Too many attempts. Wait a moment before trying again.'
        : error?.code === 'email_not_confirmed' ? 'Confirm your email before signing in.'
          : !error?.status ? 'Could not connect to Golden Rose sign-in. Check your connection and try again.'
            : error.status >= 500 ? 'Golden Rose sign-in is having a service issue. Try again shortly.'
              : 'Your email or password was not accepted.';
      return { status: 'error', message };
    }

    try {
      if (!await verifyStaffToken(data.session.access_token)) {
        await supabase.auth.signOut({ scope: 'local' });
        return { status: 'error', message: 'This account does not have active staff access. Contact your owner or manager.' };
      }
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
      return { status: 'error', message: 'Staff access could not be verified. Try again.' };
    }
  } catch (error) {
    console.error('[Golden Rose staff auth] request exception', { type: error instanceof Error ? error.name : 'unknown' });
    return { status: 'error', message: 'Staff sign-in could not complete. Check your connection and try again.' };
  }
  redirect('/workspace?notice=signed-in');
}

export async function signOutStaff() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  redirect(error ? '/staff/login?reason=signout' : '/staff/login');
}
