import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CircleAlert, Database, ExternalLink, Info, Sparkles } from 'lucide-react';
import { getWorkspaceModule, WORKSPACE_MODULES } from '@/src/domain';
import { modulePreviews } from '@/src/lib/module-content';
import { requireStaff } from '@/src/lib/golden-rose/staff';

export function generateStaticParams() {
  return WORKSPACE_MODULES.filter(module => module.id !== 'products' && module.id !== 'inventory')
    .map(module => ({ module: module.id }));
}

export default async function WorkspaceModulePage({ params }: { params: Promise<{ module: string }> }) {
  await requireStaff();
  const { module: moduleId } = await params;
  const selectedModule = getWorkspaceModule(moduleId);
  if (!selectedModule) notFound();
  const preview = modulePreviews[selectedModule.id];
  return <div className="workspace-page"><div className="workspace-page__heading"><div><span className="overline">GOLDEN ROSE BUSINESS SUITE</span><h1>{selectedModule.label}</h1><p>{selectedModule.description}</p></div><Link className="subtle-pill link-pill" href="/workspace">Overview <ArrowRight size={14}/></Link></div>
    {selectedModule.id === 'assistant' && <div className="foundation-callout foundation-callout--ai"><Sparkles size={23}/><div><strong>Business intelligence, grounded in real records</strong><p>AI questions, voice transcription and action confirmations are in the roadmap. No model is connected, and the current screen does not generate business answers.</p></div></div>}
    <div className="module-summary"><div className="module-summary__icon"><Database size={24}/></div><div><strong>Module foundation prepared</strong><p>{preview.note}</p></div><span className="status-label">Integration pending</span></div>
    <div className="panel module-panel"><div className="panel__heading"><div><span className="overline">ILLUSTRATIVE WORKSPACE DATA</span><h2>{selectedModule.label} preview</h2></div><span className="subtle-pill"><Info size={13}/> Sample entries only</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr>{preview.headers.map(col=><th key={col}>{col}</th>)}</tr></thead><tbody>{preview.rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div></div>
    <div className="module-bottom"><div className="module-bottom__heading"><CircleAlert size={18}/><strong>Next implementation requirements</strong></div><div className="module-tags">{preview.tags.map(tag=><span key={tag}>{tag}</span>)}</div><p>These are planned capabilities. Implementation depends on authenticated users, live data models and approved operational rules.</p><Link className="text-link" href="/workspace">Back to workspace <ExternalLink size={15}/></Link></div>
  </div>;
}

