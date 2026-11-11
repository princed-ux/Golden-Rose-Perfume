import Link from 'next/link';
import { ArrowUpRight, Store } from 'lucide-react';
import { WorkspaceSidebar } from '@/src/components/workspace-sidebar';
import './page.css';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-shell gr-workspace">
      <WorkspaceSidebar />
      <div className="workspace-main">
        <div className="workspace-notice"><span>DEMO WORKSPACE</span> Fictional examples only. Authentication, business records and payments are not connected.</div>
        <header className="workspace-topbar">
          <div className="workspace-topbar__breadcrumb">Golden Rose Perfume <span>/</span> Operations</div>
          <div className="workspace-topbar__actions"><Link href="/" className="workspace-topbar__store"><Store size={15} aria-hidden="true" /> View storefront <ArrowUpRight size={13} aria-hidden="true" /></Link><div className="workspace-avatar" title="Owner preview — not a signed-in session">GR</div></div>
        </header>
        <main className="workspace-content" id="workspace-main">{children}</main>
      </div>
    </div>
  );
}
