'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutStaff } from '@/app/staff/login/actions';
import type { StaffRole } from '@/src/lib/golden-rose/contracts';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Box, ChartNoAxesCombined,
  ChevronDown, CircleHelp, Crown, Menu, PackageOpen, ReceiptText, ScanBarcode, Search, Send,
  ShoppingBag, Sparkles, TriangleAlert, Trophy, Truck, UsersRound, WalletCards, X, Zap,
  type LucideIcon,
} from 'lucide-react';
import { canViewModule } from '@/src/domain/permissions';
import type { WorkspaceModuleId } from '@/src/domain/modules';
import { liveOnlyModules, previewModules, previewRoles, type PreviewRole, type SuiteModuleId } from './workspace-model';
import './page.css';

const metrics = [
  { label: 'Recorded sales', detail: 'POS and confirmed sales', icon: WalletCards },
  { label: 'Orders', detail: 'Confirmed orders', icon: ShoppingBag },
  { label: 'Customers', detail: 'Customer records', icon: UsersRound },
  { label: 'Products', detail: 'Catalogue records', icon: Box },
  { label: 'Low stock', detail: 'Location alerts', icon: TriangleAlert },
];

const actions = [
  { label: 'New POS sale', id: 'pos', icon: ScanBarcode },
  { label: 'Add product', id: 'products', icon: Box },
  { label: 'Create invoice', id: 'invoices', icon: ReceiptText },
  { label: 'Add customer', id: 'customers', icon: UsersRound },
  { label: 'Receive stock', id: 'inventory', icon: PackageOpen },
  { label: 'Purchase order', id: 'purchases', icon: Truck },
  { label: 'Sales report', id: 'reports', icon: ChartNoAxesCombined },
  { label: 'Ask Amara', id: 'assistant', icon: Sparkles },
] as const;

const amaraTopics = [
  { label: 'Show a sales summary', id: 'reports', icon: ChartNoAxesCombined, match: /sales|revenue|profit|report/i,
    answer: 'Sales summaries will be available when verified sales records are connected. Reports will separate physical POS sales from confirmed online orders.' },
  { label: 'Check product stock', id: 'inventory', icon: Box, match: /stock|inventory|product/i,
    answer: 'Stock checks will show on-hand and available quantities by location. Inventory reporting is awaiting a connection.' },
  { label: 'Find a customer', id: 'customers', icon: UsersRound, match: /customer|crm/i,
    answer: 'Customer CRM is where authorized staff will find customer profiles and verified purchase history.' },
  { label: 'Review invoices', id: 'invoices', icon: ReceiptText, match: /invoice|quote|payment/i,
    answer: 'Invoices & Quotes will hold drafts, issued invoices and verified payment records. Invoice data is awaiting a connection.' },
  { label: 'Review purchase orders', id: 'purchases', icon: Truck, match: /purchase|supplier|receiving/i,
    answer: 'Purchasing & Suppliers will bring together purchase orders and receipts. Purchase order data is awaiting a connection.' },
] as const;

type Overlay = 'navigation' | 'search' | 'notifications' | 'profile';

function Brand() {
  return (
    <div className="owner-brand">
      <span className="owner-brand-logo">
        <Image src="/assets/brand/golden-rose-logo.png" alt="" width={40} height={44} />
      </span>
      <span className="owner-wordmark">Golden Rose</span>
      <span className="owner-brand-tagline">Beauty of Fragrance</span>
    </div>
  );
}

function WorkspaceNavigation({ label, modules, active, onNavigate }: {
  label: string;
  modules: typeof previewModules;
  active: SuiteModuleId;
  onNavigate: (id: SuiteModuleId) => void;
}) {
  return (
    <nav className="owner-nav" aria-label={label}>
      {modules.map(({ id, label: itemLabel, icon: Icon }) => (
        <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
          <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
          <span>{itemLabel}</span>
        </button>
      ))}
    </nav>
  );
}

function PanelTitle({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children?: ReactNode }) {
  return (
    <header className="owner-panel-head">
      <h2><Icon size={18} aria-hidden="true" />{title}</h2>
      {children}
    </header>
  );
}

function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="owner-empty">
      <span><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function SalesPerformance({ allowSample }: { allowSample: boolean }) {
  const [period, setPeriod] = useState('This month');
  const [sample, setSample] = useState(false);
  const periods = ['Last 7 days', 'This month', 'Last 90 days'];

  return (
    <section className="owner-panel owner-performance" aria-label="Sales performance">
      <PanelTitle title="Sales performance" icon={ChartNoAxesCombined}>
        <select aria-label="Sales reporting period" value={period} onChange={event => setPeriod(event.target.value)}>
          {periods.map(value => <option key={value}>{value}</option>)}
        </select>
      </PanelTitle>
      <div className="owner-plot" data-sample={sample}>
        {sample ? (
          <>
            <span className="owner-chart-caption">Illustrative curve</span>
            <svg viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label="Illustrative sales curve using sample data">
              <defs>
                <linearGradient id="owner-sample-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d2983c" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#f3dc9f" stopOpacity=".04" />
                </linearGradient>
              </defs>
              <path d="M0 119 C24 112 37 87 63 97 S98 106 119 79 S146 56 165 73 S195 75 220 57 S250 81 275 60 S310 54 334 44 S368 29 393 40 S426 65 451 54 S481 43 505 51 S561 22 600 27 V140 H0Z" fill="url(#owner-sample-fill)" />
              <path d="M0 119 C24 112 37 87 63 97 S98 106 119 79 S146 56 165 73 S195 75 220 57 S250 81 275 60 S310 54 334 44 S368 29 393 40 S426 65 451 54 S481 43 505 51 S561 22 600 27" fill="none" stroke="#b57d29" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </>
        ) : (
          <EmptyState icon={ChartNoAxesCombined} title="Sales data unavailable">
            Verified sales and revenue will appear here for the selected period.
          </EmptyState>
        )}
      </div>
      <div className="owner-chart-footer">
        <span aria-live="polite">{sample ? 'Sample trend · ' : 'Revenue & recorded sales · '}{period}</span>
        {allowSample && <button type="button" className="owner-text-action" aria-pressed={sample} onClick={() => setSample(value => !value)}>
          {sample ? 'Hide sample' : 'View sample chart'}
        </button>}
      </div>
    </section>
  );
}

function AmaraPreview({ role, openModule, live }: { role: StaffRole; openModule: (id: WorkspaceModuleId) => void; live: boolean }) {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ question: string; answer: string; module?: WorkspaceModuleId }[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const topics = amaraTopics.filter(topic => canViewModule(role, topic.id));

  useEffect(() => {
    const container = log.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [history]);

  function ask(question: string, topic?: (typeof amaraTopics)[number]) {
    if (!question.trim()) return;
    const match = topic ?? topics.find(item => item.match.test(question));
    setHistory(items => [...items.slice(-9), {
      question: question.trim(),
      answer: match?.answer ?? 'Try one of the suggested questions for guided help with this role.',
      module: match?.id,
    }]);
    setMessage('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(message);
  }

  return (
    <aside className="owner-amara" aria-labelledby="owner-amara-title" id="owner-amara" tabIndex={-1}>
      <header className="owner-amara-head">
        <div className="owner-amara-brand">
          <Sparkles size={21} aria-hidden="true" />
          <div><h2 id="owner-amara-title">Amara</h2><p>Golden Rose Business Assistant</p></div>
        </div>
        <span className="owner-amara-mode">{live ? 'Guided help' : 'Guided preview'}</span>
      </header>
      <div className="owner-amara-body">
        <div className="owner-amara-intro">
          <strong>Hello. How can I help?</strong>
          <p>Choose a question to explore how Amara could guide your team through daily operations.</p>
        </div>
        <div className="owner-amara-topics" aria-label="Suggested questions">
          {topics.map(topic => (
            <button key={topic.id} type="button" onClick={() => ask(topic.label, topic)}>
              <topic.icon size={16} aria-hidden="true" />
              <span>{topic.label}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="owner-amara-log" ref={log} role="log" aria-label="Amara conversation" aria-live="polite" tabIndex={history.length ? 0 : undefined}>
          {history.map(({ question, answer, module }, index) => (
            <div className="owner-amara-exchange" key={index}>
              <p className="owner-amara-question">{question}</p>
              <p className="owner-amara-answer">{answer}</p>
              {module && <button type="button" className="owner-text-action" onClick={() => openModule(module)}>{live ? 'Open module' : 'Preview module'} <ArrowUpRight size={13} aria-hidden="true" /></button>}
            </div>
          ))}
        </div>
        <form className="owner-amara-form" onSubmit={submit}>
          <label className="owner-sr-only" htmlFor="owner-amara-question">Ask Amara a question</label>
          <input id="owner-amara-question" value={message} onChange={event => setMessage(event.target.value)}
            placeholder="Ask a guided question…" maxLength={240} />
          <button type="submit" aria-label="Send question" disabled={!message.trim()}><Send size={16} aria-hidden="true" /></button>
        </form>
      </div>
    </aside>
  );
}

export function OwnerPrototype({ staffRole, children }: { staffRole?: StaffRole; children?: ReactNode }) {
  const [previewRole, setRole] = useState<PreviewRole>('owner');
  const live = staffRole !== undefined;
  const role = staffRole ?? previewRole;
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<WorkspaceModuleId>('overview');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLElement>(null);
  const currentRole = previewRoles.find(item => item.id === role) ??
    { id: 'sales_staff', label: 'Sales Staff', scope: 'Permitted sales and customer operations' };
  const visible = (live ? [...previewModules, ...liveOnlyModules] : previewModules)
    .filter(item => item.id === 'migration' ? role === 'owner' : canViewModule(role, item.id));
  const routeModule = pathname.split('/')[2] ?? 'overview';
  const selected = visible.find(item => item.id === (live ? routeModule : active)) ?? visible[0];
  const showOverview = live ? routeModule === 'overview' : selected.id === 'overview';
  const showAmara = canViewModule(role, 'assistant');
  const matches = visible.filter(item => (item.label + ' ' + item.summary).toLowerCase().includes(query.trim().toLowerCase()));

  function openOverlay(view: Overlay) {
    setQuery('');
    setOverlay(view);
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuery('');
        setOverlay('search');
        if (!dialog.current?.open) dialog.current?.showModal();
      }
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (overlay === 'search') search.current?.focus();
  }, [overlay]);

  function openModule(id: SuiteModuleId) {
    if (id === 'migration' ? role !== 'owner' : !canViewModule(role, id)) return;
    if (live) router.push(id === 'overview' ? '/workspace' : '/workspace/' + id);
    else if (id !== 'migration') setActive(id);
    dialog.current?.close();
    content.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function changeRole(next: PreviewRole) {
    setRole(next);
    if (!canViewModule(next, active)) setActive('overview');
  }

  return (
    <div className="owner-suite">
      <a className="owner-skip" href="#owner-main">Skip to dashboard</a>
      <aside className="owner-sidebar">
        <Brand />
        <p className="owner-sidebar-title">Business Workspace</p>
        <WorkspaceNavigation label="Business workspace" modules={visible} active={selected.id} onNavigate={openModule} />
        <div className="owner-sidebar-rose" aria-hidden="true" />
        <p className="owner-sidebar-footer">{live ? 'Golden Rose Perfume' : 'Development preview'}</p>
      </aside>

      <div className="owner-workspace">
        <header className="owner-topbar">
          <div className="owner-topbar-welcome">
            <button type="button" className="owner-icon-button" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={() => openOverlay('navigation')}><Menu size={20} aria-hidden="true" /></button>
            <span className="owner-crown"><Crown size={17} aria-hidden="true" /></span>
            <strong>Hello, {currentRole.label}</strong>
          </div>
          <button type="button" className="owner-search" aria-label="Search workspace" aria-haspopup="dialog" onClick={() => openOverlay('search')}>
            <Search size={18} aria-hidden="true" /><span>Search workspace modules…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="owner-topbar-actions">
            <button type="button" className="owner-icon-button" aria-label="Notifications" aria-haspopup="dialog" onClick={() => openOverlay('notifications')}><Bell size={19} aria-hidden="true" /></button>
            <button type="button" className="owner-profile" aria-label={live ? 'Staff profile' : 'Profile and role preview'} aria-haspopup="dialog" onClick={() => openOverlay('profile')}>
              <span className="owner-avatar" aria-hidden="true">GR</span>
              <span className="owner-profile-name"><strong>Golden Rose</strong><small>{currentRole.label}</small></span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="owner-columns" data-assistant={showAmara}>
          <main className="owner-main" id="owner-main" tabIndex={-1} ref={content}>
            {showOverview ? (
              <>
                <section className="owner-hero" aria-labelledby="owner-overview-title">
                  <Image src="/assets/hero/hero-01.png" alt="" fill sizes="(max-width: 767px) 100vw, (max-width: 1279px) 80vw, 65vw" loading="eager" />
                  <div className="owner-hero-copy">
                    <p className="owner-kicker">Business overview</p>
                    <h1 id="owner-overview-title">Your fragrance business,<br /><em>all in one place.</em></h1>
                    <p>Sales, inventory, customers, and daily operations.</p>
                  </div>
                </section>

                <section className="owner-metrics" aria-label="Business KPIs">
                  {metrics.map(({ label, detail, icon: Icon }) => (
                    <article className="owner-metric" key={label}>
                      <span className="owner-metric-icon"><Icon size={20} strokeWidth={1.65} aria-hidden="true" /></span>
                      <div><h2>{label}</h2><p className="owner-metric-value"><span aria-hidden="true">—</span><span className="owner-sr-only">Unavailable</span></p><p className="owner-metric-detail">{detail}</p></div>
                    </article>
                  ))}
                </section>

                <div className="owner-analysis">
                  <SalesPerformance allowSample={!live} />
                  <section className="owner-panel owner-quick" aria-label="Quick actions">
                    <PanelTitle title="Quick actions" icon={Zap} />
                    <div className="owner-quick-grid">
                      {actions.filter(action => canViewModule(role, action.id)).map(({ label, id, icon: Icon }) => (
                        <button type="button" key={label} onClick={() => openModule(id)}>
                          <Icon size={20} strokeWidth={1.65} aria-hidden="true" /><span>{label}</span>
                        </button>
                      ))}
                      {!actions.some(action => canViewModule(role, action.id)) && <p>No actions available in this role preview.</p>}
                    </div>
                  </section>
                </div>

                <div className="owner-activity">
                  <section className="owner-panel">
                    <PanelTitle title="Top fragrances" icon={Trophy}>
                      {canViewModule(role, 'reports') && <button className="owner-text-action" type="button" onClick={() => openModule('reports')} aria-label="View reports"><ArrowUpRight size={16} aria-hidden="true" /></button>}
                    </PanelTitle>
                    <EmptyState icon={Trophy} title="Rankings unavailable">Verified sales will determine best sellers.</EmptyState>
                  </section>
                  <section className="owner-panel">
                    <PanelTitle title="Inventory alerts" icon={TriangleAlert}>
                      {canViewModule(role, 'inventory') && <button className="owner-text-action" type="button" onClick={() => openModule('inventory')} aria-label="View inventory preview"><ArrowUpRight size={16} aria-hidden="true" /></button>}
                    </PanelTitle>
                    <EmptyState icon={PackageOpen} title="Alerts unavailable">Low-stock alerts will appear by location.</EmptyState>
                  </section>
                  <section className="owner-panel">
                    <PanelTitle title="Recent transactions" icon={ReceiptText}>
                      {canViewModule(role, 'orders') && <button className="owner-text-action" type="button" onClick={() => openModule('orders')} aria-label="View sales and orders preview"><ArrowUpRight size={16} aria-hidden="true" /></button>}
                    </PanelTitle>
                    <EmptyState icon={ReceiptText} title="Transactions unavailable">Recorded POS sales and confirmed sales will appear here.</EmptyState>
                  </section>
                </div>
                {live && children}
              </>
            ) : live ? <div className="gr-workspace owner-live-content">{children}</div> : (
              <section className="owner-panel owner-module">
                <button type="button" className="owner-text-action" onClick={() => openModule('overview')}><ArrowLeft size={16} aria-hidden="true" /> Executive overview</button>
                <div className="owner-module-intro">
                  <span className="owner-metric-icon"><selected.icon size={25} aria-hidden="true" /></span>
                  <div><p className="owner-kicker">Module preview</p><h1>{selected.label}</h1><p>{selected.summary}</p></div>
                </div>
                <EmptyState icon={selected.icon} title="Planned workspace">{selected.empty}</EmptyState>
                {selected.id === 'assistant' && showAmara && <a className="owner-text-action" href="#owner-amara">Go to Amara <ArrowDownRight size={16} aria-hidden="true" /></a>}
              </section>
            )}
            <footer className="owner-footer"><span>Golden Rose Perfume</span><span>{live ? 'Business workspace' : 'Development preview · Business data unavailable'}</span></footer>
          </main>
          {showAmara && <AmaraPreview key={role} role={role} openModule={openModule} live={live} />}
        </div>
      </div>

      <dialog
        ref={dialog}
        className="owner-dialog"
        data-view={overlay ?? undefined}
        aria-labelledby="owner-dialog-title"
        onClose={event => {
          if (!event.currentTarget.open) setOverlay(null);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.close();
          }
        }}
      >
        <header className="owner-dialog-head">
          <h2 id="owner-dialog-title">
            {overlay === 'navigation' ? 'Business workspace' : overlay === 'search' ? 'Search workspace' : overlay === 'notifications' ? 'Notifications' : live ? 'Staff profile' : 'Profile & role preview'}
          </h2>
          <button className="owner-icon-button" type="button" aria-label="Close dialog" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
        </header>
        {overlay === 'navigation' && (
          <WorkspaceNavigation label="Workspace navigation menu" modules={visible} active={selected.id} onNavigate={openModule} />
        )}
        {overlay === 'search' && (
          <div className="owner-dialog-search">
            <label className="owner-dialog-input"><Search size={18} aria-hidden="true" /><input ref={search} value={query} type="search" aria-label="Find a workspace module" placeholder="Find a module…" onChange={event => setQuery(event.target.value)} /></label>
            <ul className="owner-search-results">
              {matches.map(({ id, label, icon: Icon }) => <li key={id}><button type="button" onClick={() => openModule(id)}><Icon size={17} aria-hidden="true" />{label}<ArrowUpRight size={14} aria-hidden="true" /></button></li>)}
            </ul>
            {!matches.length && <p role="status">No modules match your search.</p>}
          </div>
        )}
        {overlay === 'notifications' && <EmptyState icon={Bell} title="Notifications unavailable">Business alerts will appear here when connected.</EmptyState>}
        {overlay === 'profile' && (
          <div className="owner-role-panel">
            <div><span className="owner-avatar" aria-hidden="true">GR</span><strong>Golden Rose Perfume</strong></div>
            {live ? <>
              <p>{currentRole.label} · {currentRole.scope}</p>
              <Link className="owner-text-action" href="/">View storefront <ArrowUpRight size={14} /></Link>
              <form action={signOutStaff}><button type="submit" className="owner-text-action">Sign out</button></form>
            </> : <>
              <label>Preview a role
                <select value={role} onChange={event => changeRole(event.target.value as PreviewRole)}>
                  {previewRoles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <p>{currentRole.scope}</p>
              <p><CircleHelp size={16} aria-hidden="true" /> This selection only changes the preview navigation.</p>
            </>}
          </div>
        )}
      </dialog>
    </div>
  );
}
