import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export const getCustomer = cache(async () => {
  await connection();
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError' && ![401, 403].includes(error.status ?? 0)) throw error;
  if (!user || error) return null;

  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof metadataName === 'string' ? metadataName.trim().slice(0, 120) : '',
  };
});

export async function requireCustomer() {
  const customer = await getCustomer().catch(() => undefined);
  if (customer === undefined) redirect('/account/login?notice=unavailable');
  if (!customer) redirect('/account/login?notice=sign-in');
  return customer;
}
