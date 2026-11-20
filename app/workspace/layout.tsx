
import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { getStaffAccess } from '@/src/lib/golden-rose/staff';

import { WorkspaceShell } from '@/src/components/workspace/workspace-shell';

import { StaffAccessUnavailable } from '@/src/components/workspace/access-unavailable';

import { SignedInToast } from '@/src/components/auth-toast';

import './page.css';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

async function AuthenticatedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaffAccess();

  if ('reason' in staff) {
    if (staff.reason === 'unavailable') {
      return <StaffAccessUnavailable />;
    }

    if (staff.reason === 'password') redirect('/staff/change-password');
    redirect('/staff/login?reason=' + staff.reason);
  }

  const { role, displayName } = staff;

  return (
    <WorkspaceShell
      staffRole={role}
      displayName={displayName}
    >
      <Suspense fallback={null}>
        <SignedInToast destination="workspace" />
      </Suspense>

      {children}
    </WorkspaceShell>
  );
}
