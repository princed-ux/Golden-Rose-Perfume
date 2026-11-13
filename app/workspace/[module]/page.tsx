import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { WORKSPACE_MODULES } from '@/src/domain/modules';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { liveOnlyModules, previewModules } from '@/app/owner-preview/workspace-model';

export function generateStaticParams() {
  return WORKSPACE_MODULES.filter(module => module.id !== 'products' && module.id !== 'inventory')
    .map(module => ({ module: module.id }));
}

async function ModuleContent({ params }: { params: Promise<{ module: string }> }) {
  const [{ role }, { module: id }] = await Promise.all([requireStaff(), params]);
  const selected = WORKSPACE_MODULES.find(item => item.id === id);
  if (!selected || !canViewModule(role, selected.id)) notFound();
  if (selected.id === 'overview') redirect('/workspace');
  const display = [...previewModules, ...liveOnlyModules].find(item => item.id === selected.id);
  const Icon = display?.icon;
  return (
    <section className="owner-panel owner-module">
      <div className="owner-module-intro">
        {Icon && <span className="owner-metric-icon"><Icon size={23} aria-hidden="true" /></span>}
        <div><h1>{display?.label ?? selected.label}</h1><p>{display?.summary ?? selected.description}</p></div>
      </div>
      <div className="owner-empty">
        <strong>{selected.id === 'assistant' ? 'Guided help' : 'Records unavailable'}</strong>
        <p>{display?.empty ?? 'This module will display records when its data source is connected.'}</p>
        {selected.id === 'assistant' && <a className="owner-text-action" href="#owner-amara">Go to Amara</a>}
      </div>
    </section>
  );
}

export default function WorkspaceModulePage({ params }: { params: Promise<{ module: string }> }) {
  return <Suspense fallback={<p role="status">Loading workspace module…</p>}><ModuleContent params={params} /></Suspense>;
}
