import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/src/lib/supabase/config';

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };

export function employeeAdminClient() {
  const key = process.env.SUPABASE_STAFF_ADMIN_SECRET_KEY?.trim();
  if (!key?.startsWith('sb_secret_')) return null;
  return createClient(getSupabaseConfig().url, key, options);
}

export function employeePublicAuthClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, options);
}

export async function employeeEmailConfirmation() {
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const response = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: publishableKey },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return 'unavailable';
    const settings = await response.json() as { external?: { email?: boolean }; mailer_autoconfirm?: boolean };
    if (typeof settings.mailer_autoconfirm !== 'boolean' || typeof settings.external?.email !== 'boolean') return 'unavailable';
    return settings.external.email && !settings.mailer_autoconfirm ? 'required' : 'disabled';
  } catch {
    return 'unavailable';
  }
}
