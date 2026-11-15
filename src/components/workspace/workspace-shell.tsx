
'use client';

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutStaff } from '@/app/staff/login/actions';

import type { StaffRole } from '@/src/lib/golden-rose/contracts';
import { canViewModule } from '@/src/domain/permissions';
import type { WorkspaceModuleId } from '@/src/domain/modules';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Crown,
  Menu,
  PackageOpen,
  ReceiptText,
  ScanBarcode,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  Trophy,
  Truck,
  UsersRound,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  coreWorkspaceModules,
  workspaceRoles,
  workspaceModules,
  type WorkspaceRole,
  type SuiteModuleId,
} from './workspace-model';

import { WorkspaceBrand, WorkspaceNavigation } from './workspace-navigation';
import './workspace.css';

const metrics = [
  {
    label: 'Recorded sales',
    detail: 'POS and confirmed sales',
    icon: WalletCards,
  },
  {
    label: 'Orders',
    detail: 'Confirmed orders',
    icon: ShoppingBag,
  },
  {
    label: 'Customers',
    detail: 'Customer records',
    icon: UsersRound,
  },
  {
    label: 'Products',
    detail: 'Catalogue records',
    icon: Box,
  },
  {
    label: 'Low stock',
    detail: 'Location alerts',
    icon: TriangleAlert,
  },
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
  {
    label: 'Show a sales summary',
    id: 'reports',
    icon: ChartNoAxesCombined,
    match: /sales|revenue|profit|report/i,
    answer:
      'Sales summaries require verified transactions. Reports will distinguish completed physical POS sales from confirmed online orders.',
  },
  {
    label: 'Check product stock',
    id: 'inventory',
    icon: Box,
    match: /stock|inventory|product/i,
    answer:
      'Inventory tracks on-hand, reserved and available quantities by location. Open Inventory to inspect the connected records.',
  },
  {
    label: 'Find a customer',
    id: 'customers',
    icon: UsersRound,
    match: /customer|crm/i,
    answer:
      'The CRM module will hold customer profiles, contact information and verified purchase histories. Customer records must be imported or created before searching.',
  },
  {
    label: 'Review invoices',
    id: 'invoices',
    icon: ReceiptText,
    match: /invoice|quote|payment/i,
    answer:
      'The invoice module will provide draft, issued, paid and outstanding invoice records. Live invoicing must be connected before financial totals are available.',
  },
  {
    label: 'Review purchase orders',
    id: 'purchases',
    icon: Truck,
    match: /purchase|supplier|receiving/i,
    answer:
      'Purchasing will manage suppliers, purchase orders and stock receipts. Only verified purchasing records should be included in reporting.',
  },
] as const;

type Overlay =
  | 'search'
  | 'notifications'
  | 'profile';

type ConversationEntry = {
  question: string;
  answer: string;
  module?: WorkspaceModuleId;
};

function PanelTitle({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <header className="owner-panel-head">
      <h2>
        <Icon size={18} aria-hidden="true" />
        {title}
      </h2>

      {children}
    </header>
  );
}

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="owner-empty">
      <span>
        <Icon
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>

      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function SalesPerformance({
  allowSample,
}: {
  allowSample: boolean;
}) {
  const [period, setPeriod] = useState('This month');
  const [sample, setSample] = useState(false);

  const periods = [
    'Last 7 days',
    'This month',
    'Last 90 days',
  ];

  return (
    <section
      className="owner-panel owner-performance"
      aria-label="Sales performance"
    >
      <PanelTitle
        title="Sales performance"
        icon={ChartNoAxesCombined}
      >
        <select
          aria-label="Sales reporting period"
          value={period}
          onChange={event => setPeriod(event.target.value)}
        >
          {periods.map(value => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </PanelTitle>

      <div className="owner-plot" data-sample={sample}>
        {sample ? (
          <>
            <span className="owner-chart-caption">
              Illustrative curve
            </span>

            <svg
              viewBox="0 0 600 140"
              preserveAspectRatio="none"
              role="img"
              aria-label="Illustrative sales curve using sample data"
            >
              <defs>
                <linearGradient
                  id="owner-sample-fill"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#d2983c"
                    stopOpacity=".32"
                  />
                  <stop
                    offset="100%"
                    stopColor="#f3dc9f"
                    stopOpacity=".04"
                  />
                </linearGradient>
              </defs>

              <path
                d="M0 119 C24 112 37 87 63 97 S98 106 119 79 S146 56 165 73 S195 75 220 57 S250 81 275 60 S310 54 334 44 S368 29 393 40 S426 65 451 54 S481 43 505 51 S561 22 600 27 V140 H0Z"
                fill="url(#owner-sample-fill)"
              />

              <path
                d="M0 119 C24 112 37 87 63 97 S98 106 119 79 S146 56 165 73 S195 75 220 57 S250 81 275 60 S310 54 334 44 S368 29 393 40 S426 65 451 54 S481 43 505 51 S561 22 600 27"
                fill="none"
                stroke="#b57d29"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </>
        ) : (
          <EmptyState
            icon={ChartNoAxesCombined}
            title="Sales data unavailable"
          >
            Verified sales and revenue will appear here for
            the selected period.
          </EmptyState>
        )}
      </div>

      <div className="owner-chart-footer">
        <span aria-live="polite">
          {sample ? 'Sample trend · ' : 'Revenue & recorded sales · '}
          {period}
        </span>

        {allowSample && (
          <button
            type="button"
            className="owner-text-action"
            aria-pressed={sample}
            onClick={() => setSample(value => !value)}
          >
            {sample ? 'Hide sample' : 'View sample chart'}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Amara retains the existing guided-help behavior.
 * She does not invent financial data or execute business actions.
 *
 * The parent now presents Amara in a toggleable dialog
 * instead of permanently taking up workspace width.
 */
function AmaraPanel({
  role,
  openModule,
  live,
}: {
  role: StaffRole;
  openModule: (id: WorkspaceModuleId) => void;
  live: boolean;
}) {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const log = useRef<HTMLDivElement>(null);

  const topics = amaraTopics.filter(topic =>
    canViewModule(role, topic.id),
  );

  useEffect(() => {
    if (log.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [history]);

  function ask(
    question: string,
    topic?: (typeof amaraTopics)[number],
  ) {
    const text = question.trim();
    if (!text) return;

    const matchedTopic =
      topic ??
      topics.find(item => item.match.test(text));

    setHistory(items => [
      ...items.slice(-19),
      {
        question: text,
        answer:
          matchedTopic?.answer ??
          'Choose one of the suggested questions for guidance. Amara is not yet connected to a live AI model.',
        module: matchedTopic?.id,
      },
    ]);

    setMessage('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(message);
  }

  return (
    <aside
      className="owner-amara"
      id="owner-amara"
      aria-labelledby="owner-amara-title"
      tabIndex={-1}
    >
      <header className="owner-amara-head">
        <div className="owner-amara-brand">
          <Sparkles size={21} aria-hidden="true" />

          <div>
            <h2 id="owner-amara-title">Amara</h2>
            <p>Golden Rose Business Assistant</p>
          </div>
        </div>

        <span className="owner-amara-mode">
          {live ? 'Guided help' : 'Guided preview'}
        </span>
      </header>

      <div className="owner-amara-body">
        <div className="owner-amara-intro">
          <strong>Hello. How can I help?</strong>

          <p>
            Get guidance on your business workspace.
            Live AI reporting and voice features are not connected yet.
          </p>
        </div>

        <div
          className="owner-amara-topics"
          aria-label="Suggested questions"
        >
          {topics.map(topic => (
            <button
              key={topic.id}
              type="button"
              onClick={() => ask(topic.label, topic)}
            >
              <topic.icon
                size={16}
                aria-hidden="true"
              />

              <span>{topic.label}</span>

              <ArrowRight
                size={14}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <div
          className="owner-amara-log"
          ref={log}
          role="log"
          aria-label="Amara conversation"
          aria-live="polite"
          tabIndex={history.length ? 0 : undefined}
        >
          {history.map((entry, index) => (
            <div
              className="owner-amara-exchange"
              key={index}
            >
              <p className="owner-amara-question">
                {entry.question}
              </p>

              <p className="owner-amara-answer">
                {entry.answer}
              </p>

              {entry.module && (
                <button
                  type="button"
                  className="owner-text-action"
                  onClick={() => openModule(entry.module!)}
                >
                  {live ? 'Open module' : 'Preview module'}

                  <ArrowUpRight
                    size={13}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          ))}
        </div>

        <form
          className="owner-amara-form"
          onSubmit={submit}
        >
          <label
            className="owner-sr-only"
            htmlFor="owner-amara-question"
          >
            Ask Amara a question
          </label>

          <input
            id="owner-amara-question"
            value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder="Ask a guided question…"
            maxLength={240}
          />

          <button
            type="submit"
            aria-label="Send question"
            disabled={!message.trim()}
          >
            <Send
              size={16}
              aria-hidden="true"
            />
          </button>
        </form>
      </div>
    </aside>
  );
}

const mobileNavigationQuery = '(max-width: 900px)';

function isMobileViewport() {
  return window.matchMedia(mobileNavigationQuery).matches;
}

function subscribeToMobileNavigation(change: () => void) {
  const media = window.matchMedia(mobileNavigationQuery);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

interface WorkspaceShellProps {
  staffRole: StaffRole;
  displayName?: string;
  children?: ReactNode;
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <WorkspaceFrame {...props} />;
}

export function WorkspacePreview() {
  return <WorkspaceFrame />;
}

function WorkspaceFrame({
  staffRole,
  displayName = '',
  children,
}: Partial<WorkspaceShellProps>) {
  const [previewRole, setRole] =
    useState<WorkspaceRole>('owner');

  const live = staffRole !== undefined;
  const role = staffRole ?? previewRole;

  const pathname = usePathname();
  const router = useRouter();

  const [active, setActive] =
    useState<WorkspaceModuleId>('overview');

  const [overlay, setOverlay] =
    useState<Overlay | null>(null);

  const [query, setQuery] = useState('');


  const isMobileNavigation = useSyncExternalStore(subscribeToMobileNavigation, isMobileViewport, () => false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [navigationContext, setNavigationContext] = useState({ pathname, mobile: isMobileNavigation });
  const sidebar = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);

  if (navigationContext.pathname !== pathname || navigationContext.mobile !== isMobileNavigation) {
    setNavigationContext({ pathname, mobile: isMobileNavigation });
    setMobileNavigation(false);
  }

  const closeSidebar = useCallback(() => {
    setMobileNavigation(false);
    requestAnimationFrame(() => sidebarToggle.current?.focus());
  }, []);

  useEffect(() => {
    if (!mobileNavigation || !isMobileNavigation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector('button')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSidebar();
      } else if (event.key === 'Tab') {
        const buttons = sidebar.current?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeSidebar, isMobileNavigation, mobileNavigation]);

  function toggleSidebar() {
    if (isMobileNavigation) {
      if (mobileNavigation) closeSidebar();
      else setMobileNavigation(true);
    } else {
      setSidebarCollapsed(current => !current);
    }
  }

  const [amaraOpen, setAmaraOpen] =
    useState(false);

  const dialog = useRef<HTMLDialogElement>(null);
  const amaraDialog = useRef<HTMLDialogElement>(null);

  const search = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLElement>(null);

  const currentRole =
    workspaceRoles.find(item => item.id === role) ?? {
      id: 'sales_staff',
      label: 'Sales Staff',
      scope: 'Permitted sales and customer operations',
    };

  const visible = (
    live
      ? workspaceModules
      : coreWorkspaceModules
  ).filter(item =>
    item.id === 'migration'
      ? role === 'owner'
      : canViewModule(role, item.id),
  );

  const routeModule =
    pathname.split('/')[2] ?? 'overview';

  const selected =
    visible.find(item =>
      item.id === (live ? routeModule : active),
    ) ?? visible[0];

  const showOverview = live
    ? routeModule === 'overview'
    : selected.id === 'overview';

  const showAmara = canViewModule(role, 'assistant');

  const matches = visible.filter(item =>
    (item.label + ' ' + item.summary)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const normalizedName = displayName.trim();
  const firstName =
    normalizedName.split(/\s+/)[0] || '';

  const greeting = live
    ? firstName
      ? `Hello, ${firstName}`
      : 'Welcome back'
    : `Hello, ${currentRole.label}`;

  const profileName = live
    ? normalizedName || 'Your account'
    : 'Golden Rose';

  const initials = normalizedName
    ? normalizedName
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('')
    : 'GR';

  function closeAmara() {
    if (amaraDialog.current?.open) {
      amaraDialog.current.close();
    }

    setAmaraOpen(false);
  }

  function openAmara() {
    if (!showAmara) return;

    if (dialog.current?.open) {
      dialog.current.close();
    }

    setOverlay(null);

    if (!amaraDialog.current?.open) {
      amaraDialog.current?.showModal();
    }

    setAmaraOpen(true);
  }

  function openOverlay(view: Overlay) {
    setMobileNavigation(false);
    closeAmara();

    setQuery('');
    setOverlay(view);

    if (!dialog.current?.open) {
      dialog.current?.showModal();
    }
  }

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();

        setMobileNavigation(false);
        setQuery('');
        setOverlay('search');

        if (amaraDialog.current?.open) {
          amaraDialog.current.close();
        }

        setAmaraOpen(false);

        if (!dialog.current?.open) {
          dialog.current?.showModal();
        }
      }
    }

    document.addEventListener('keydown', onShortcut);

    return () => {
      document.removeEventListener('keydown', onShortcut);
    };
  }, []);

  useEffect(() => {
    if (overlay === 'search') {
      search.current?.focus();
    }
  }, [overlay]);

  // Close Amara when the user navigates to another business module.
  useEffect(() => {
    if (amaraDialog.current?.open) {
      amaraDialog.current.close();
    }
  }, [pathname]);

  function openModule(id: SuiteModuleId) {
    if (
      id === 'migration'
        ? role !== 'owner'
        : !canViewModule(role, id)
    ) {
      return;
    }

    // Close the actual mobile sidebar when a module is selected,
    // including when selecting the current route.
    setMobileNavigation(false);

    // The Amara navigation item opens the assistant,
    // rather than navigating to another placeholder page.
    if (id === 'assistant') {
      openAmara();
      return;
    }

    closeAmara();

    if (live) {
      router.push(
        id === 'overview'
          ? '/workspace'
          : '/workspace/' + id,
      );
    } else if (id !== 'migration') {
      setActive(id);
    }

    dialog.current?.close();

    requestAnimationFrame(() => content.current?.focus({ preventScroll: true }));

    window.scrollTo({
      top: 0,
      behavior: 'instant',
    });
  }

  function changeRole(next: WorkspaceRole) {
    setRole(next);

    if (!canViewModule(next, active)) {
      setActive('overview');
    }

    closeAmara();
  }

  return (
    <div
  className="owner-suite owner-suite--full-workspace"
  data-sidebar-collapsed={sidebarCollapsed}
  data-mobile-navigation={mobileNavigation}
>
      <a
        className="owner-skip"
        href="#owner-main"
      >
        Skip to dashboard
      </a>

      <aside
        ref={sidebar}
        id="owner-primary-sidebar"
        className="owner-sidebar"
        aria-label="Business workspace navigation"
        role={mobileNavigation ? 'dialog' : undefined}
        aria-modal={mobileNavigation || undefined}
        inert={isMobileNavigation && !mobileNavigation}
      >
        <button
          type="button"
          className="self-end rounded-md p-2 text-[#f2d5a4] hover:bg-white/10 min-[901px]:hidden"
          aria-label="Close workspace navigation"
          onClick={closeSidebar}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <WorkspaceBrand />
        <p className="owner-sidebar-title">Business Workspace</p>
        <WorkspaceNavigation label="Business workspace" modules={visible} active={selected.id} onNavigate={openModule} />
        <div className="owner-sidebar-rose" aria-hidden="true" />
        <p className="owner-sidebar-footer">{live ? 'Golden Rose Perfume' : 'Development preview'}</p>
      </aside>

      {mobileNavigation && (
        <div className="owner-sidebar-backdrop" aria-hidden="true" onClick={closeSidebar} />
      )}

      <div className="owner-workspace min-w-0" inert={mobileNavigation}>
        {/* Personalized top navigation */}
        <header className="owner-topbar">
          <div className="owner-topbar-welcome">
            
<button
              ref={sidebarToggle}
              type="button"
              className="owner-icon-button"
              aria-label={isMobileNavigation ? 'Open workspace navigation' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-controls="owner-primary-sidebar"
              aria-expanded={isMobileNavigation ? mobileNavigation : !sidebarCollapsed}
              onClick={toggleSidebar}
            >
              <Menu size={20} aria-hidden="true" />
            </button>

            <span className="owner-crown">
              <Crown
                size={17}
                aria-hidden="true"
              />
            </span>

            <strong title={normalizedName || currentRole.label}>
              {greeting}
            </strong>
          </div>

          <button
            type="button"
            className="owner-search"
            aria-label="Search workspace"
            aria-haspopup="dialog"
            onClick={() => openOverlay('search')}
          >
            <Search
              size={18}
              aria-hidden="true"
            />

            <span>
              Search workspace modules…
            </span>

            <kbd>Ctrl K</kbd>
          </button>

          <div className="owner-topbar-actions">
            {showAmara && (
              <button
                type="button"
                className="owner-icon-button owner-amara-top-toggle"
                aria-label="Open Amara business assistant"
                aria-haspopup="dialog"
                onClick={openAmara}
                title="Ask Amara"
              >
                <Sparkles
                  size={19}
                  aria-hidden="true"
                />
              </button>
            )}

            <button
              type="button"
              className="owner-icon-button"
              aria-label="Notifications"
              aria-haspopup="dialog"
              onClick={() => openOverlay('notifications')}
            >
              <Bell
                size={19}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              className="owner-profile"
              aria-label={live ? 'Staff profile' : 'Profile and role preview'}
              aria-haspopup="dialog"
              onClick={() => openOverlay('profile')}
            >
              <span
                className="owner-avatar"
                aria-hidden="true"
              >
                {initials}
              </span>

              <span className="owner-profile-name">
                <strong>{profileName}</strong>
                <small>{currentRole.label}</small>
              </span>

              <ChevronDown
                size={15}
                aria-hidden="true"
              />
            </button>
          </div>
        </header>

        {/* Full-width business content: no permanent Amara column */}
        <div
          className="owner-columns"
        >
          <main
            className="owner-main"
            id="owner-main"
            tabIndex={-1}
            ref={content}
          >
            {showOverview ? (
              <>
                <section
                  className="owner-hero"
                  aria-labelledby="owner-overview-title"
                >
                  <Image
                    src="/assets/hero/hero-01.png"
                    alt=""
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1279px) 80vw, 100vw"
                    loading="eager"
                  />

                  <div className="owner-hero-copy">
                    <p className="owner-kicker">
                      Business overview
                    </p>

                    <h1 id="owner-overview-title">
                      Your fragrance business,
                      <br />
                      <em>all in one place.</em>
                    </h1>

                    <p>
                      Sales, inventory, customers,
                      and daily operations.
                    </p>
                  </div>
                </section>

                <section
                  className="owner-metrics"
                  aria-label="Business KPIs"
                >
                  {metrics.map(
                    ({ label, detail, icon: Icon }) => (
                      <article
                        className="owner-metric"
                        key={label}
                      >
                        <span className="owner-metric-icon">
                          <Icon
                            size={20}
                            strokeWidth={1.65}
                            aria-hidden="true"
                          />
                        </span>

                        <div>
                          <h2>{label}</h2>

                          <p className="owner-metric-value">
                            <span aria-hidden="true">—</span>
                            <span className="owner-sr-only">
                              Unavailable
                            </span>
                          </p>

                          <p className="owner-metric-detail">
                            {detail}
                          </p>
                        </div>
                      </article>
                    ),
                  )}
                </section>

                <div className="owner-analysis">
                  <SalesPerformance allowSample={!live} />

                  <section
                    className="owner-panel owner-quick"
                    aria-label="Quick actions"
                  >
                    <PanelTitle
                      title="Quick actions"
                      icon={Zap}
                    />

                    <div className="owner-quick-grid">
                      {actions
                        .filter(action =>
                          canViewModule(role, action.id),
                        )
                        .map(({ label, id, icon: Icon }) => (
                          <button
                            type="button"
                            key={label}
                            onClick={() => openModule(id)}
                          >
                            <Icon
                              size={20}
                              strokeWidth={1.65}
                              aria-hidden="true"
                            />

                            <span>{label}</span>
                          </button>
                        ))}

                      {!actions.some(action =>
                        canViewModule(role, action.id),
                      ) && (
                        <p>
                          No actions available for this role.
                        </p>
                      )}
                    </div>
                  </section>
                </div>

                <div className="owner-activity">
                  <section className="owner-panel">
                    <PanelTitle
                      title="Top fragrances"
                      icon={Trophy}
                    >
                      {canViewModule(role, 'reports') && (
                        <button
                          type="button"
                          className="owner-text-action"
                          onClick={() => openModule('reports')}
                          aria-label="View reports"
                        >
                          <ArrowUpRight
                            size={16}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </PanelTitle>

                    <EmptyState
                      icon={Trophy}
                      title="Rankings unavailable"
                    >
                      Verified sales will determine
                      best-selling fragrances.
                    </EmptyState>
                  </section>

                  <section className="owner-panel">
                    <PanelTitle
                      title="Inventory alerts"
                      icon={TriangleAlert}
                    >
                      {canViewModule(role, 'inventory') && (
                        <button
                          type="button"
                          className="owner-text-action"
                          onClick={() => openModule('inventory')}
                          aria-label="View inventory"
                        >
                          <ArrowUpRight
                            size={16}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </PanelTitle>

                    <EmptyState
                      icon={PackageOpen}
                      title="Alerts unavailable"
                    >
                      Low-stock alerts will appear
                      by location when inventory
                      records are available.
                    </EmptyState>
                  </section>

                  <section className="owner-panel">
                    <PanelTitle
                      title="Recent transactions"
                      icon={ReceiptText}
                    >
                      {canViewModule(role, 'orders') && (
                        <button
                          type="button"
                          className="owner-text-action"
                          onClick={() => openModule('orders')}
                          aria-label="View sales and orders"
                        >
                          <ArrowUpRight
                            size={16}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </PanelTitle>

                    <EmptyState
                      icon={ReceiptText}
                      title="Transactions unavailable"
                    >
                      Recorded POS sales and
                      confirmed online orders
                      will appear here.
                    </EmptyState>
                  </section>
                </div>

                {live && children}
              </>
            ) : live ? (
              <div className="gr-workspace owner-live-content">
                {children}
              </div>
            ) : (
              <section className="owner-panel owner-module">
                <button
                  type="button"
                  className="owner-text-action"
                  onClick={() => openModule('overview')}
                >
                  <ArrowLeft
                    size={16}
                    aria-hidden="true"
                  />

                  Executive overview
                </button>

                <div className="owner-module-intro">
                  <span className="owner-metric-icon">
                    <selected.icon
                      size={25}
                      aria-hidden="true"
                    />
                  </span>

                  <div>
                    <p className="owner-kicker">
                      Module preview
                    </p>

                    <h1>{selected.label}</h1>

                    <p>{selected.summary}</p>
                  </div>
                </div>

                <EmptyState
                  icon={selected.icon}
                  title="Planned workspace"
                >
                  {selected.empty}
                </EmptyState>
              </section>
            )}

            <footer className="owner-footer">
              <span>Golden Rose Perfume</span>

              <span>
                {live
                  ? 'Business workspace'
                  : 'Development preview · Business data unavailable'}
              </span>
            </footer>
          </main>
        </div>
      </div>

      {/* Floating Amara launcher on every authorized business page */}
      {showAmara && !amaraOpen && !mobileNavigation && (
        <button
          type="button"
          className="owner-amara-launch"
          aria-label="Open Amara business assistant"
          aria-haspopup="dialog"
          aria-controls="owner-amara-dialog"
          onClick={openAmara}
        >
          <Sparkles
            size={19}
            aria-hidden="true"
          />

          <span>Ask Amara</span>
        </button>
      )}

      {/* Amara is a modal drawer, not a permanent dashboard column */}
      {showAmara && (
        <dialog
          ref={amaraDialog}
          id="owner-amara-dialog"
          className="owner-amara-dialog"
          aria-label="Amara business assistant"
          onClose={() => setAmaraOpen(false)}
          onClick={event => {
            if (event.target === event.currentTarget) {
              closeAmara();
            }
          }}
        >
          <div className="owner-amara-dialog-content">
            <button
              type="button"
              className="owner-amara-dialog-close"
              aria-label="Close Amara"
              onClick={closeAmara}
            >
              <X size={19} />
            </button>

            <AmaraPanel
              key={role}
              role={role}
              openModule={openModule}
              live={live}
            />
          </div>
        </dialog>
      )}

      {/* Existing workspace navigation, search, notifications, profile */}
      <dialog
        ref={dialog}
        className="owner-dialog"
        data-view={overlay ?? undefined}
        aria-labelledby="owner-dialog-title"
        onClose={event => {
          if (!event.currentTarget.open) {
            setOverlay(null);
          }
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
            {overlay === 'search'
              ? 'Search workspace'
              : overlay === 'notifications'
                ? 'Notifications'
                : live
                  ? 'Staff profile'
                  : 'Profile & role preview'}
          </h2>

          <button
            className="owner-icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={() => dialog.current?.close()}
          >
            <X
              size={20}
              aria-hidden="true"
            />
          </button>
        </header>

        {overlay === 'search' && (
          <div className="owner-dialog-search">
            <label className="owner-dialog-input">
              <Search
                size={18}
                aria-hidden="true"
              />

              <input
                ref={search}
                value={query}
                type="search"
                aria-label="Find a workspace module"
                placeholder="Find a module…"
                onChange={event => setQuery(event.target.value)}
              />
            </label>

            <ul className="owner-search-results">
              {matches.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => openModule(id)}
                  >
                    <Icon
                      size={17}
                      aria-hidden="true"
                    />

                    {label}

                    <ArrowUpRight
                      size={14}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>

            {!matches.length && (
              <p role="status">
                No modules match your search.
              </p>
            )}
          </div>
        )}

        {overlay === 'notifications' && (
          <EmptyState
            icon={Bell}
            title="Notifications unavailable"
          >
            Verified business alerts will appear
            here when connected.
          </EmptyState>
        )}

        {overlay === 'profile' && (
          <div className="owner-role-panel">
            <div>
              <span
                className="owner-avatar"
                aria-hidden="true"
              >
                {initials}
              </span>

              <strong>{profileName}</strong>
            </div>

            {live ? (
              <>
                <p>
                  {currentRole.label} · {currentRole.scope}
                </p>

                <Link
                  className="owner-text-action"
                  href="/"
                >
                  View storefront

                  <ArrowUpRight
                    size={14}
                    aria-hidden="true"
                  />
                </Link>

                <form action={signOutStaff}>
                  <button
                    type="submit"
                    className="owner-text-action"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <label>
                  Preview a role

                  <select
                    value={role}
                    onChange={event =>
                      changeRole(
                        event.target.value as WorkspaceRole,
                      )
                    }
                  >
                    {workspaceRoles.map(item => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <p>{currentRole.scope}</p>

                <p>
                  <CircleHelp
                    size={16}
                    aria-hidden="true"
                  />

                  This selection changes only
                  the preview navigation.
                </p>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
