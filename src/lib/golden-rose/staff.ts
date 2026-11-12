import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { ROLES } from '@/src/domain/types';
import { createClient } from '@/src/lib/supabase/server';
import { callEdge, EdgeError } from './edge';
import type { StaffRole } from './contracts';

export async function verifyStaffToken(token: string): Promise<StaffRole | null> {
  const { isStaff, role } = await callEdge<{ isStaff: boolean; role?: string }>('staff-session', { token });
  const activeRole = ROLES.find((candidate): candidate is StaffRole => candidate !== 'customer' && candidate === role);
  return isStaff === true ? activeRole ?? null : null;
}

export const getStaffAccess = cache(async () => {
  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return { reason: 'session' } as const;

    // The Edge Function verifies the bearer token and reads the active staff role.
    const role = await verifyStaffToken(session.access_token);
    if (!role) return { reason: 'denied' } as const;

    // Verify the subject before using it to scope a browser's pending receipt.
    const { data: verified } = await supabase.auth.getClaims(session.access_token);
    if (!verified?.claims.sub) return { reason: 'session' } as const;
    return { role, token: session.access_token, userId: verified.claims.sub } as const;
  } catch (error) {
    if (error instanceof EdgeError && error.status === 401) return { reason: 'session' } as const;
    if (error instanceof EdgeError && error.status === 403) return { reason: 'denied' } as const;
    return { reason: 'unavailable' } as const;
  }
});

export async function requireStaff() {
  const staff = await getStaffAccess();
  if ('reason' in staff) redirect('/staff/login?reason=' + staff.reason);
  return staff;
}
