'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getCustomer } from '@/src/lib/customer/session';

export async function saveCustomerAppearance(value: unknown) {
  if (value !== 'light' && value !== 'dark' && value !== 'system') return false;
  try {
    if (!await getCustomer()) return false;
    const client = await createClient();
    const { error } = await client.auth.updateUser({ data: { golden_rose_theme: value } });
    return !error;
  } catch {
    return false;
  }
}
