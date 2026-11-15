import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { WORKSPACE_MODULES } from '@/src/domain/modules';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { workspaceModules } from '@/src/components/workspace/workspace-model';
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel, workspaceSecondary } from '@/src/components/workspace/page-layout';
import { OwnerAccessPanel } from '../owner-access/panel';

export function generateStaticParams() {
  return WORKSPACE_MODULES.filter(module => module.id !== 'products' && module.id !== 'inventory')
    .map(module => ({ module: module.id }));
}

async function ModuleContent({ params }: { params: Promise<{ module: string }> }) {
  const [{ role, userId }, { module: id }] = await Promise.all([requireStaff(), params]);
  const selected = WORKSPACE_MODULES.find(item => item.id === id);
  if (!selected || !canViewModule(role, selected.id)) notFound();
  if (selected.id === 'overview') redirect('/workspace');
  if (selected.id === 'staff' && role === 'owner') return <OwnerAccessPanel userId={userId} />;
  const display = workspaceModules.find(item => item.id === selected.id);
  const assistant = selected.id === 'assistant';
  const related = selected.id === 'orders' && canViewModule(role, 'pos')
    ? <Link className={workspaceSecondary} href="/workspace/pos">Open Point of Sale</Link>
    : (selected.id === 'purchases' || selected.id === 'suppliers') && canViewModule(role, 'inventory')
      ? <Link className={workspaceSecondary} href="/workspace/inventory">View inventory</Link>
      : undefined;
  return (
    <div className="grid min-w-0 gap-5">
      <WorkspacePageHeader title={display?.label ?? selected.label} description={display?.summary ?? selected.description} actions={related} />
      <WorkspacePanel>
        <WorkspaceNotice title={assistant ? 'Guided help' : 'Records unavailable'}
          action={assistant ? <a className={workspaceSecondary} href="#owner-amara">Go to Amara</a> : undefined}>
          {display?.empty ?? 'Records will appear when this module is connected.'}
        </WorkspaceNotice>
      </WorkspacePanel>
    </div>
  );
}

export default function WorkspaceModulePage({ params }: { params: Promise<{ module: string }> }) {
  return <Suspense fallback={<WorkspaceNotice title="Loading workspace module…">Checking staff access.</WorkspaceNotice>}><ModuleContent params={params} /></Suspense>;
}
