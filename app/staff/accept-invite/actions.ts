'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createClient as createAuthClient } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/server';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { validEmail } from '@/src/lib/customer/auth-policy';
import type { OperationResult } from '@/src/lib/golden-rose/contracts';

export async function acceptOwnerInvitation(_: OperationResult, form: FormData): Promise<OperationResult> {
  const email = form.get('email');
  const password = form.get('password');
  const code = form.get('code');
  if (typeof email !== 'string' || !validEmail(email.trim()) || typeof password !== 'string' ||
      !password || password.length > 256 || typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code.trim())) {
    return { status: 'error', message: 'Enter your email, existing password, and invitation code.' };
  }
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const client = createAuthClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) return {
      status: 'error',
      message: error?.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed. Use the confirmed account named on your invitation.',
    };

    const tokenHash = createHash('sha256').update(code.trim()).digest('hex');
    const { error: acceptanceError } = await client.rpc('gr_owner_access', { p_action: 'accept', p_payload: { tokenHash } });
    if (acceptanceError) {
      return { status: 'error', message: acceptanceError.code === '22023'
        ? 'This invitation is invalid, expired, used, or for another account.'
        : 'The invitation could not be accepted. Contact an active owner or try again.' };
    }
    const sessionClient = await createClient();
    const { error: cookieError } = await sessionClient.auth.setSession(data.session);
    if (cookieError) return { status: 'success', message: 'Invitation accepted. Open staff sign-in to access the workspace.' };
  } catch {
    return { status: 'error', message: 'Invitation acceptance is temporarily unavailable. Try again.' };
  }
  redirect('/workspace');
}
