import type { Metadata } from 'next';

import Image from 'next/image';
import Link from 'next/link';

import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import {
  ArrowLeft,
  ArrowUpRight,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  getRoleHome,
} from '@/src/domain/permissions';

import {
  StaffLoginForm,
} from './form';

import '../page.css';

import '@/src/components/account-access.css';

export const metadata: Metadata = {
  title: 'Staff Login — Golden Rose Perfume',

  description:
    'Secure sign-in for authorized Golden Rose Perfume employees and business owners.',
};

const notices: Record<string, string> = {
  session:
    'Sign in to access the business workspace.',

  denied:
    'This area is for authorized staff only. Customers should use customer sign-in. Employees without active access should contact the owner.',

  unavailable:
    'Staff verification is temporarily unavailable. Retry without signing out.',

  signout:
    'Sign-out could not be confirmed. Try again from the workspace.',

  'password-changed':
    'Your password was changed. Sign in with your new password to continue.',
};

type SearchParams = Promise<{
  reason?: string;
}>;

/* =========================================================
   STAFF ACCESS NOTICES
   ========================================================= */

async function AccessNotice({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { reason } = await searchParams;

  const message =
    typeof reason === 'string' &&
    Object.hasOwn(notices, reason)
      ? notices[reason]
      : null;

  if (!message) {
    return null;
  }

  return (
    <p
      className="gr-auth-notice"
      role="status"
    >
      {message}
    </p>
  );
}

/* =========================================================
   VERIFIED STAFF SESSION
   ========================================================= */

async function SessionAwareLogin() {
  const access = await getStaffAccess();

  if (!('reason' in access)) {
    redirect(
      getRoleHome(access.role),
    );
  }

  if (access.reason === 'password') {
    redirect('/staff/change-password');
  }

  return <StaffLoginForm />;
}

/* =========================================================
   STAFF LOGIN
   ========================================================= */

export default function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="gr-auth gr-auth--staff">

      {/* BRAND HEADER */}

      <header className="gr-auth-header">
        <Link
          href="/"
          className="gr-auth-brand"
          aria-label="Golden Rose Perfume homepage"
        >
          <Image
            src="/assets/brand/golden-rose-logo.png"
            alt="Golden Rose Perfume"
            width={1188}
            height={1324}
            unoptimized
          />

          <span>
            GOLDEN ROSE

            <small>
              BUSINESS WORKSPACE
            </small>
          </span>
        </Link>

        <Link
          href="/"
          className="gr-auth-back"
        >
          <ArrowLeft
            size={15}
            aria-hidden="true"
          />

          Back to the store
        </Link>
      </header>

      {/* STAFF AUTHENTICATION */}

      <section
        className="gr-auth-panel"
        aria-labelledby="auth-title"
      >
        <div className="gr-access-security">
          <ShieldCheck
            size={19}
            strokeWidth={1.7}
            aria-hidden="true"
          />

          <span>
            Authorized staff only
          </span>
        </div>

        <p className="gr-auth-kicker">
          GOLDEN ROSE · STAFF
        </p>

        <h1 id="auth-title">
          Staff sign in
        </h1>

        <p className="gr-auth-intro">
          Access your business workspace,
          assigned responsibilities and daily
          store operations.
        </p>

        {/* CUSTOMER SIGN-IN SHORTCUT */}

        <div className="gr-access-staff">
          <UserRound
            size={19}
            strokeWidth={1.7}
            aria-hidden="true"
          />

          <div>
            <p>
              Shopping with Golden Rose?
            </p>

            <Link href="/account/login">
              Customer login here

              <ArrowUpRight
                size={15}
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        <Suspense fallback={null}>
          <AccessNotice
            searchParams={searchParams}
          />
        </Suspense>

        <Suspense
          fallback={
            <p role="status">
              Checking your staff session…
            </p>
          }
        >
          <SessionAwareLogin />
        </Suspense>

        {/* EXISTING EMPLOYEE INVITATION WORKFLOW */}

        <nav
          className="gr-auth-links"
          aria-label="Staff access"
        >
          <Link href="/staff/accept-invite">
            Have a staff invitation? Accept it here
          </Link>

          <Link href="/account/login">
            Return to customer login
          </Link>

          <Link href="/account/register">
            Create a customer account
          </Link>
        </nav>

        <p className="gr-auth-footnote">
          Staff accounts are issued by the business
          owner. You cannot register an employee
          account through this page.

          Customer accounts do not grant access
          to the business workspace.
        </p>
      </section>

      <footer className="gr-auth-footer">
        Golden Rose Perfume · Internal business access
      </footer>
    </main>
  );
}