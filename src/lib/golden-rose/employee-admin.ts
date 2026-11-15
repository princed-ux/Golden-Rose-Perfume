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
