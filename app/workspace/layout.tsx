
import { Suspense } from 'react';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { OwnerPrototype } from '@/app/owner-preview/owner-prototype';
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
        <p className="container page-spacing" role="status">
          Verifying staff access…
        </p>
      }
    >
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}

async function WorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, userId } = await requireStaff();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  let displayName = '';

  // Profile names are for display only.
  // Actual authorization continues to use verified staff roles.
  if (!error && data.user?.id === userId) {
    const metadata = data.user.user_metadata as
      | Record<string, unknown>
      | undefined;

    const possibleNames = [
      metadata?.full_name,
      metadata?.name,
      metadata?.display_name,
      metadata?.first_name,
    ];

    const storedName = possibleNames.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    displayName = storedName?.trim().slice(0, 100) ?? '';
  }

  return (
    <OwnerPrototype staffRole={role} displayName={displayName}>
      <Suspense fallback={null}>
        <SignedInToast destination="workspace" />
      </Suspense>
      {children}
    </OwnerPrototype>
  );
}
