import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowUpRight, Store } from 'lucide-react';
import { WorkspaceSidebar } from '@/src/components/workspace-sidebar';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { signOutStaff } from '@/app/staff/login/actions';
import './page.css';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="container page-spacing" role="status">Verifying staff access…</p>}>
    <WorkspaceShell>{children}</WorkspaceShell>
  </Suspense>;
}

async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff();
  return (
    <div className="workspace-shell gr-workspace">
      <WorkspaceSidebar />
      <div className="workspace-main">
        <div className="workspace-notice"><span>STAFF WORKSPACE</span> Signed in as {role.replace('_', ' ')}. Products and inventory use live records.</div>
        <header className="workspace-topbar">
          <div className="workspace-topbar__breadcrumb">Golden Rose Perfume <span>/</span> Operations</div>
          <div className="workspace-topbar__actions">
            <Link href="/" className="workspace-topbar__store"><Store size={15} aria-hidden="true" /> View storefront <ArrowUpRight size={13} aria-hidden="true" /></Link>
            <form action={signOutStaff}><button className="gr-live-secondary" type="submit">Sign out</button></form>
          </div>
        </header>
        <main className="workspace-content" id="workspace-main">{children}</main>
      </div>
    </div>
  );
}
