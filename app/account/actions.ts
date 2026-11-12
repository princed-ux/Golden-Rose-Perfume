'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import {
  RECOVERY_COOKIE, resolveAuthOrigin, validEmail, validNewPassword,
  type AuthResult, type CustomerAuthMode,
} from '@/src/lib/customer/auth-policy';

const failure = (message: string): AuthResult => ({ message, error: true });

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

async function callbackUrl(mode?: 'confirm' | 'recovery') {
  const origin = resolveAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL, (await headers()).get('host'));
  if (!origin) return null;
  const url = new URL('/auth/callback', origin);
  if (mode) url.searchParams.set('mode', mode);
  return url.toString();
}

export async function signInWithGoogle(): Promise<AuthResult> {
  let destination: string;
  try {
    const redirectTo = await callbackUrl();
    if (!redirectTo) return failure('Google sign-in is unavailable on this website address.');
    const { url, publishableKey } = getSupabaseConfig();
    const settings = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: publishableKey }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
    });
    if (!settings.ok) return failure('Google sign-in is temporarily unavailable.');
    if ((await settings.json()).external?.google !== true) {
      return failure('Google sign-in is not enabled for this store yet. You can continue with email.');
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return failure('Google sign-in could not be started. Try signing in with email.');
    destination = data.url;
  } catch {
    return failure('Google sign-in is temporarily unavailable.');
  }
  redirect(destination);
}

export async function submitCustomerAuth(mode: CustomerAuthMode, _: AuthResult, form: FormData): Promise<AuthResult> {
  if (!['login', 'register', 'forgot-password', 'reset-password'].includes(mode)) {
    return failure('This sign-in request is invalid.');
  }

  const email = field(form, 'email').trim().toLowerCase();
  const password = field(form, 'password');
  if (mode !== 'reset-password' && !validEmail(email)) return failure('Enter a valid email address.');
  if (mode === 'login' && (!password || password.length > 256)) return failure('Enter your password.');
  if ((mode === 'register' || mode === 'reset-password') &&
      !validNewPassword(password, field(form, 'confirmPassword'))) {
    return failure('Use 12 to 128 characters and make sure the two passwords match.');
  }

  let destination = '/account/dashboard';
  try {
    const supabase = await createClient();
    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        if (error?.code === 'email_not_confirmed') return failure('Check your email to confirm your account before signing in.');
        if (error?.status === 429) return failure('Too many sign-in attempts. Wait and try again.');
        if (!error?.status || error.status >= 500) return failure('Sign-in is temporarily unavailable.');
        return failure('Your email or password was not accepted.');
      }
    } else if (mode === 'register') {
      const emailRedirectTo = await callbackUrl('confirm');
      if (!emailRedirectTo) return failure('Account registration is unavailable on this website address.');
      const name = field(form, 'name').trim();
      if (name.length > 120) return failure('Use at most 120 characters for your name.');
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo, data: name ? { full_name: name } : undefined },
      });
      if (error) {
        if (error.code === 'user_already_exists' || error.code === 'email_exists') {
          return { message: 'If a confirmation is needed, check your inbox. You can also sign in or request a password reset.' };
        }
        if (error.code === 'weak_password') return failure('Choose a stronger password.');
        return failure('Registration could not be completed. Try again or sign in with Google.');
      }
      if (!data.session) return { message: 'Check your inbox for the confirmation link, then sign in.' };
    } else if (mode === 'forgot-password') {
      const redirectTo = await callbackUrl('recovery');
      if (!redirectTo) return failure('Password recovery is unavailable on this website address.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error && error.code !== 'user_not_found') {
        return failure(error.status === 429 ? 'Wait before requesting another link.' : 'The reset email could not be requested. Try again later.');
      }
      return { message: 'If an account exists for this address, check your inbox for a password reset link.' };
    } else {
      const store = await cookies();
      const { data } = await supabase.auth.getClaims();
      const sessionId = data?.claims.session_id;
      if (!sessionId || store.get(RECOVERY_COOKIE)?.value !== sessionId) {
        return failure('This reset link expired. Request a new password reset email.');
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return failure(error.code === 'weak_password' ? 'Choose a stronger password.' : 'Your password could not be updated. Request a new reset link if this one expired.');
      store.delete(RECOVERY_COOKIE);
      destination = '/account/dashboard?notice=password-updated';
    }
  } catch {
    return failure('Account services are temporarily unavailable. Try again.');
  }
  redirect(destination);
}

export async function signOutCustomer(): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return failure('Sign-out could not be confirmed. Try again.');
    (await cookies()).delete(RECOVERY_COOKIE);
  } catch {
    return failure('Sign-out could not be confirmed. Try again.');
  }
  redirect('/account/login?notice=signed-out');
}
