
import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ROLES } from '@/src/domain/types';
import { createClient } from '@/src/lib/supabase/server';
import { callEdge, EdgeError } from './edge';
import type { StaffRole } from './contracts';

const passwordStates = new Set([
  'none',
  'change_required',
  'expired',
  'denied',
  'store_unavailable',
]);

/**
 * A missing, unavailable or unexpected security response
 * must never grant employee access.
 */
export async function getStaffPasswordState(
  client: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    const { data, error } = await client.rpc(
      'gr_employee_password_state',
    );

    if (
      error ||
      typeof data !== 'string' ||
      !passwordStates.has(data)
    ) {
      return 'unavailable';
    }

    return data;
  } catch {
    return 'unavailable';
  }
}

export async function verifyStaffToken(
  token: string,
): Promise<StaffRole | null> {
  const { isStaff, role } = await callEdge<{
    isStaff: boolean;
    role?: string;
  }>('staff-session', { token });

  const activeRole = ROLES.find(
    (candidate): candidate is StaffRole =>
      candidate !== 'customer' && candidate === role,
  );

  return isStaff === true ? activeRole ?? null : null;
}

export const getStaffAccess = cache(async () => {
  await connection();

  try {
    const supabase = await createClient();

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      return { reason: 'session' } as const;
    }

    // The backend independently verifies the active staff role.
    const role = await verifyStaffToken(
      session.access_token,
    );

    if (!role) {
      return { reason: 'denied' } as const;
    }

    // Do not permit the workspace when the enrollment
    // function is missing, unavailable or returns an
    // unexpected state.
    const passwordState = await getStaffPasswordState(
      supabase,
    );

    if (passwordState !== 'none') {
      return {
        reason:
          passwordState === 'unavailable'
            ? 'unavailable'
            : 'denied',
      } as const;
    }

    const {
      data: verified,
      error: claimsError,
    } = await supabase.auth.getClaims(
      session.access_token,
    );

    if (claimsError || !verified?.claims.sub) {
      return { reason: 'session' } as const;
    }

    return {
      role,
      token: session.access_token,
      userId: verified.claims.sub,
    } as const;
  } catch (error) {
    if (error instanceof EdgeError && error.status === 401) {
      return { reason: 'session' } as const;
    }

    if (error instanceof EdgeError && error.status === 403) {
      return { reason: 'denied' } as const;
    }

    return { reason: 'unavailable' } as const;
  }
});

export async function requireStaff() {
  const staff = await getStaffAccess();

  if ('reason' in staff) {
    redirect('/staff/login?reason=' + staff.reason);
  }

  return staff;
}
