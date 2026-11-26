'use server';

import {
  redirect,
} from 'next/navigation';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  getStaffPasswordState,
  verifyStaffToken,
} from '@/src/lib/golden-rose/staff';

import {
  getRoleHome,
} from '@/src/domain/permissions';

import type {
  OperationResult,
} from '@/src/lib/golden-rose/contracts';

/* =========================================================
   GOLDEN ROSE — STAFF AUTHENTICATION
   ========================================================= */

const STAFF_ONLY_MESSAGE =
  'This area is for authorized staff only. ' +
  'Customers should use customer login. ' +
  'If you are an employee, contact the owner to activate your staff access.';

export async function signInStaff(
  _: OperationResult,
  form: FormData,
): Promise<OperationResult> {
  const email = form.get('email');
  const password = form.get('password');

  /* VALIDATE CREDENTIAL INPUT */

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !email.trim().includes('@') ||
    typeof password !== 'string' ||
    !password ||
    password.length > 256
  ) {
    return {
      status: 'error',

      message:
        'Enter your work email and password.',
    };
  }

  let destination =
    '/workspace?notice=signed-in';

  try {
    const supabase = await createClient();

    /* AUTHENTICATE WITH SUPABASE */

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error || !data.session) {
      console.error(
        '[Golden Rose staff auth]',
        {
          status: error?.status ?? null,

          code:
            error?.code ??
            'missing_session',
        },
      );

      const message =
        error?.status === 429
          ? 'Too many attempts. Wait before trying again.'

          : error?.code === 'email_not_confirmed'
            ? 'Confirm your email before signing in.'

            : !error?.status
              ? 'Could not connect to Golden Rose sign-in.'

              : error.status >= 500
                ? 'Golden Rose authentication is temporarily unavailable.'

                : 'Your email or password was not accepted.';

      return {
        status: 'error',
        message,
      };
    }

    /* VERIFY STAFF ENROLLMENT AND MEMBERSHIP */

    try {
      const passwordState =
        await getStaffPasswordState(supabase);

      if (passwordState === 'change_required') {
        destination =
          '/staff/change-password';

      } else if (passwordState === 'expired') {
        await supabase.auth.signOut({
          scope: 'local',
        });

        return {
          status: 'error',

          message:
            'Your temporary password expired. Ask the owner for a replacement.',
        };

      } else if (passwordState === 'unavailable') {
        return {
          status: 'error',

          message:
            'Signed in, but staff verification is temporarily unavailable. Retry without signing out.',
        };

      } else if (passwordState === 'denied') {
        await supabase.auth.signOut({
          scope: 'local',
        });

        return {
          status: 'error',

          message: STAFF_ONLY_MESSAGE,
        };

      } else if (passwordState === 'store_unavailable') {
        await supabase.auth.signOut({
          scope: 'local',
        });

        return {
          status: 'error',

          message:
            'Your assigned selling location is unavailable. Contact the business owner.',
        };

      } else if (passwordState !== 'none') {
        await supabase.auth.signOut({
          scope: 'local',
        });

        return {
          status: 'error',

          message:
            'This staff session could not be verified. If you just confirmed your email, sign in again.',
        };

      } else {
        /*
         * Successful authentication does not grant
         * employee access by itself.
         *
         * Verify the role against the protected
         * staff-session service.
         */

        const role =
          await verifyStaffToken(
            data.session.access_token,
          );

        if (!role) {
          await supabase.auth.signOut({
            scope: 'local',
          });

          return {
            status: 'error',

            message: STAFF_ONLY_MESSAGE,
          };
        }

        /*
         * The authenticated role determines the
         * initial workspace destination.
         * Individual module permissions are checked
         * separately within the workspace.
         */

        destination =
          getRoleHome(role) +
          '?notice=signed-in';
      }

    } catch {
      return {
        status: 'error',

        message:
          'Signed in, but staff access could not be verified. Retry without signing out.',
      };
    }

  } catch (error) {
    console.error(
      '[Golden Rose staff auth exception]',
      {
        type:
          error instanceof Error
            ? error.name
            : 'unknown',
      },
    );

    return {
      status: 'error',

      message:
        'Sign-in could not complete. Check your connection.',
    };
  }

  redirect(destination);
}

/* =========================================================
   STAFF SIGN OUT
   ========================================================= */

export async function signOutStaff() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut({
    scope: 'local',
  });

  redirect(
    error
      ? '/staff/login?reason=signout'
      : '/staff/login',
  );
}