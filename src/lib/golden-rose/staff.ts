
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

export class StaffAccessUnavailableError extends Error {
  constructor() {
    super('Staff verification is temporarily unavailable. Retry without signing out.');
    this.name = 'StaffAccessUnavailableError';
  }
}

function authFailure(error: { status?: number; name?: string; code?: string }) {
  if (error.status === 401 || error.name === 'AuthSessionMissingError' ||
      ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'bad_jwt'].includes(error.code ?? '')) return 'session';
  if (error.status === 403) return 'denied';
  return 'unavailable';
}

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

    if (error) return { reason: authFailure(error) } as const;
    if (!session) {
      return { reason: 'session' } as const;
    }

    // Verify identity and fresh role/enrollment state in parallel, once per render.
    // getSession supplies a token only; it is never the authorization decision.
    const [identity, role, passwordState] = await Promise.all([
      supabase.auth.getUser(session.access_token),
      verifyStaffToken(session.access_token),
      getStaffPasswordState(supabase),
    ]);

    if (identity.error) return { reason: authFailure(identity.error) } as const;
    const user = identity.data.user;
    if (!user) return { reason: 'session' } as const;
    if (!user.email_confirmed_at || user.is_anonymous) return { reason: 'denied' } as const;

    if (passwordState === 'change_required') return { reason: 'password' } as const;
    if (passwordState === 'unavailable') return { reason: 'unavailable' } as const;

    if (!role) {
      return { reason: 'denied' } as const;
    }

    // Do not permit the workspace when the enrollment
    // function is missing, unavailable or returns an
    // unexpected state.
    if (passwordState !== 'none') {
      return { reason: 'denied' } as const;
    }

    const names = ['full_name', 'name', 'display_name', 'first_name'].map(key => user.user_metadata?.[key]);
    const displayName = names.find((name): name is string => typeof name === 'string' && Boolean(name.trim()))?.trim().slice(0, 100) ?? '';

    return {
      role,
      token: session.access_token,
      userId: user.id,
      displayName,
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
    if (staff.reason === 'unavailable') throw new StaffAccessUnavailableError();
    if (staff.reason === 'password') redirect('/staff/change-password');
    redirect('/staff/login?reason=' + staff.reason);
  }

  return staff;
}
