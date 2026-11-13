import { Suspense } from 'react';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { OwnerPrototype } from '@/app/owner-preview/owner-prototype';
import './page.css';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="container page-spacing" role="status">Verifying staff access…</p>}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}

async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff();
  return <OwnerPrototype staffRole={role}>{children}</OwnerPrototype>;
}
