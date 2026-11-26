import {
  Suspense,
  type ReactNode,
} from 'react';

import {
  redirect,
} from 'next/navigation';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  delegatedNavigation,
} from '@/src/domain/workspace-delegation';

import {
  WorkspaceShell,
} from '@/src/components/workspace/workspace-shell';

import {
  WorkspaceNavigationAccess,
} from '@/src/components/workspace/workspace-navigation';

import {
  FloatingCalculator,
} from '@/src/components/workspace/floating-calculator';

import {
  OwnerWholesaleFinancePanel,
} from '@/src/components/workspace/wholesale-finance-panel';

import {
  StaffAccessUnavailable,
} from '@/src/components/workspace/access-unavailable';

import {
  SignedInToast,
} from '@/src/components/auth-toast';

import {
  loadMyPermissions,
} from './permissions/actions';

import './page.css';

/* =========================================================
   GOLDEN ROSE PERFUME
   AUTHENTICATED BUSINESS WORKSPACE
   ========================================================= */

interface WorkspaceLayoutProps {
  children: ReactNode;
}

/* =========================================================
   WORKSPACE ENTRY POINT

   Preserve Suspense protection for Next.js
   Cache Components and runtime session checks.
   ========================================================= */

export default function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps) {
  return (
    <Suspense
      fallback={
        <p
          className="container page-spacing"

          role="status"
        >
          Verifying staff access…
        </p>
      }
    >
      <AuthenticatedWorkspace>
        {children}
      </AuthenticatedWorkspace>
    </Suspense>
  );
}

/* =========================================================
   AUTHENTICATED WORKSPACE
   ========================================================= */

async function AuthenticatedWorkspace({
  children,
}: WorkspaceLayoutProps) {
  const staff =
    await getStaffAccess();

  /* =======================================================
     AUTHENTICATION AND SESSION SECURITY

     Preserve verified identity, temporary password
     enrollment, suspended account handling and
     existing employee login redirects.
     ======================================================= */

  if ('reason' in staff) {
    if (
      staff.reason === 'unavailable'
    ) {
      return (
        <StaffAccessUnavailable />
      );
    }

    if (
      staff.reason === 'password'
    ) {
      redirect(
        '/staff/change-password',
      );
    }

    redirect(
      '/staff/login?reason=' +
      staff.reason,
    );
  }

  const {
    role,
    displayName,
    userId,
  } = staff;

  const isOwner =
    role === 'owner';

  /* =======================================================
     EMPLOYEE-SPECIFIC PERMISSIONS

     Existing role-based modules remain available
     according to their original authorization policy.

     New delegated wholesale and dispatch access
     requires a verified permission response.
     ======================================================= */

  const access =
    await loadMyPermissions();

  const additionalModules =
    delegatedNavigation(
      {
        userId,

        role,
      },

      access.ok
        ? access.data
        : null,
    );

  /* =======================================================
     BUSINESS WORKSPACE

     Preserve the existing application shell, including:

       - Executive Overview
       - Staff profiles
       - Original role-based navigation
       - Delegated wholesale and dispatch modules
       - Owner-only permission administration
       - Mobile navigation
       - Search and notifications
       - Amara assistant
       - Existing theme and responsive design
       - Staff sign-out

     Wholesale financial reporting is displayed only
     for an authenticated business owner.

     The reporting service independently rechecks
     authorization before returning financial data.
     ======================================================= */

  return (
    <WorkspaceNavigationAccess
      modules={additionalModules}
    >
      <WorkspaceShell
        staffRole={role}

        displayName={displayName}
      >
        {/* Staff sign-in notification */}

        <Suspense fallback={null}>
          <SignedInToast
            destination="workspace"
          />
        </Suspense>

        {/* Existing workspace page */}

        {children}

        {/* Owner-only wholesale financial reporting */}

        {isOwner && (
          <Suspense fallback={null}>
            <OwnerWholesaleFinancePanel
              key={userId}
            />
          </Suspense>
        )}
      </WorkspaceShell>

      {/* =================================================
          FLOATING BUSINESS CALCULATOR

          Available across authenticated staff routes.

          The saved position is scoped to the employee.
          Calculations remain separate from sales,
          payment records and financial transactions.

          Amara retains its existing launcher.
          ================================================= */}

      <FloatingCalculator
        key={userId}

        staffId={userId}
      />
    </WorkspaceNavigationAccess>
  );
}