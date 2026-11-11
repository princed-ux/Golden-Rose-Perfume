import Link from 'next/link';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, Banknote, BookOpenText, Boxes, ChartColumn, ClipboardList, CreditCard,
  FileText, Fingerprint, LayoutDashboard, Package, Settings2, ShoppingCart,
  Sparkles, Truck, UsersRound,
} from 'lucide-react';
import { WORKSPACE_MODULES, type WorkspaceModuleId } from '@/src/domain';

const icons: Record<WorkspaceModuleId, LucideIcon> = {
  overview: LayoutDashboard,
  pos: CreditCard,
  orders: ShoppingCart,
  invoices: FileText,
  expenses: Banknote,
  products: Package,
  inventory: Boxes,
  purchases: ClipboardList,
  suppliers: Truck,
  customers: UsersRound,
  reports: ChartColumn,
  assistant: Sparkles,
  staff: Fingerprint,
  settings: Settings2,
  audit: Activity,
};

const groupNames: Record<string, string> = {
  general: 'Main',
  operations: 'Sales & Service',
  catalog: 'Stock & Supply',
  customers: 'Relationships',
  insights: 'Insights',
  administration: 'Administration',
};

export function WorkspaceSidebar() {
  const sections = [...new Set(WORKSPACE_MODULES.map((module) => module.section))];
  return (
    <aside className="workspace-sidebar">
      <Link href="/" className="workspace-brand" aria-label="Golden Rose public store">
        <Image className="workspace-brand__logo" src="/assets/brand/golden-rose-logo.png" alt="" width={1188} height={1324} unoptimized />
        <span>GOLDEN ROSE <small>BUSINESS SUITE</small></span>
      </Link>
      <div className="sidebar-switcher"><div className="sidebar-switcher__avatar">GR</div><div><strong>Golden Rose Perfume</strong><span>Single-business workspace</span></div></div>
      <nav className="sidebar-nav" aria-label="Business modules">
        {sections.map(section => (
          <div className="sidebar-nav__group" key={section}>
            <span className="sidebar-nav__heading">{groupNames[section]}</span>
            {WORKSPACE_MODULES.filter(module => module.section === section).map(module => {
              const Icon = icons[module.id];
              return <Link href={module.id === 'overview' ? '/workspace' : `/workspace/${module.id}`} key={module.id} className="sidebar-nav__link"><Icon size={17} strokeWidth={1.8}/><span>{module.label}</span></Link>;
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom"><BookOpenText size={18}/><div><strong>Demo environment</strong><span>No live records connected</span></div></div>
    </aside>
  );
}

