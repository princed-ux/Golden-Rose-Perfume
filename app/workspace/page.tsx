
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ArrowRight,
  Boxes,
  Building2,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  FileText,
  Package,
  ScanBarcode,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UsersRound,
  ChartNoAxesCombined,
  type LucideIcon,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import type { WorkspaceModuleId } from '@/src/domain/modules';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

import './executive-operations.css';

type InventoryTotals = {
  totalProducts: number;
  activeProducts: number;
  publishedProducts: number;
  draftProducts: number;
  qaProducts: number;
  activeVariants: number;
  activeLocations: number;
  activeStores: number;
  recordedBalanceRows: number;
  physicalOnHand: number;
  reservedUnits: number;
  availableUnits: number;
  activeOnHand: number;
  lowRecordedRows: number;
  emptyRecordedRows: number;
  missingBalanceRows: number;
  missingCostUnits: number;
  stockCostMinor: number | null;
  scope: 'all-active-locations' | 'assigned-active-location';
};

type FinancialSnapshot = {
  sales: {
    transactions: number;
    totalMinor: number;
    discountMinor: number;
    taxMinor: number;
    qaCodedTransactions: number;
  };
  expenses: {
    approvedMinor: number;
    paidRecordedMinor: number;
    pendingMinor: number;
  };
  purchasing: {
    commitmentsMinor: number;
    receipts: number;
    receivedUnits: number;
  };
  invoices: {
    issuedCount: number;
    outstandingMinor: number;
  };
  profitAvailable: boolean;
};

function validCount(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) && value >= 0;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseInventoryTotals(value: unknown): InventoryTotals | null {
  const data = object(value);
  if (!data) return null;

  const fields = [
    'totalProducts', 'activeProducts', 'publishedProducts',
    'draftProducts', 'qaProducts', 'activeVariants',
    'activeLocations', 'activeStores', 'recordedBalanceRows',
    'physicalOnHand', 'reservedUnits', 'availableUnits',
    'activeOnHand', 'lowRecordedRows', 'emptyRecordedRows',
    'missingBalanceRows', 'missingCostUnits',
  ];

  if (!fields.every(field => validCount(data[field])) ||
      !['all-active-locations', 'assigned-active-location'].includes(String(data.scope))) {
    return null;
  }

  // Monetary values that are not safe JavaScript integers must not
  // be presented as exact figures.
  const cost = data.stockCostMinor;
  if (cost !== null && !validCount(cost)) {
    data.stockCostMinor = null;
  }

  return data as unknown as InventoryTotals;
}

function parseFinancialSnapshot(value: unknown): FinancialSnapshot | null {
  const data = object(value);
  const sales = object(data?.sales);
  const expenses = object(data?.expenses);
  const purchasing = object(data?.purchasing);
  const invoices = object(data?.invoices);

  if (!sales || !expenses || !purchasing || !invoices) return null;

  if (
    !['transactions', 'totalMinor', 'discountMinor', 'taxMinor', 'qaCodedTransactions']
      .every(key => validCount(sales[key])) ||
    !['approvedMinor', 'paidRecordedMinor', 'pendingMinor']
      .every(key => validCount(expenses[key])) ||
    !['commitmentsMinor', 'receipts', 'receivedUnits']
      .every(key => validCount(purchasing[key])) ||
    !['issuedCount', 'outstandingMinor']
      .every(key => validCount(invoices[key]))
  ) {
    return null;
  }

  return {
    sales: sales as unknown as FinancialSnapshot['sales'],
    expenses: expenses as unknown as FinancialSnapshot['expenses'],
    purchasing: purchasing as unknown as FinancialSnapshot['purchasing'],
    invoices: invoices as unknown as FinancialSnapshot['invoices'],
    profitAvailable: data?.profitAvailable === true,
  };
}

async function loadInventoryTotals(): Promise<InventoryTotals | null> {
  try {
    const client = await createClient();
    const { data, error } = await client.rpc(
      'gr_workspace_inventory_summary'
    );

    return error ? null : parseInventoryTotals(data);
  } catch {
    return null;
  }
}

async function loadFinancialSnapshot(
  from: string,
  to: string
): Promise<FinancialSnapshot | null> {
  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_financial_overview',
      {
        p_from: from,
        p_to: to,
        p_location_id: null,
      }
    );

    return error ? null : parseFinancialSnapshot(data);
  } catch {
    return null;
  }
}

function lagosToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const piece = (type: string) =>
    parts.find(part => part.type === type)?.value ?? '';

  return [piece('year'), piece('month'), piece('day')].join('-');
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function quantity(value: number): string {
  return value.toLocaleString('en-NG');
}

type Metric = {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  status: 'connected' | 'attention' | 'unavailable';
};

type WorkspaceShortcut = {
  id: WorkspaceModuleId;
  href: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

const shortcuts: WorkspaceShortcut[] = [
  {
    id: 'pos',
    href: '/workspace/pos',
    label: 'Point of Sale',
    detail: 'Open the barcode register',
    icon: ScanBarcode,
  },
  {
    id: 'products',
    href: '/workspace/products',
    label: 'Products',
    detail: 'Review fragrances and prices',
    icon: Package,
  },
  {
    id: 'inventory',
    href: '/workspace/inventory',
    label: 'Inventory & Stock',
    detail: 'Stores, receipts and balances',
    icon: Boxes,
  },
  {
    id: 'staff',
    href: '/workspace/staff',
    label: 'Staff & Permissions',
    detail: 'Manage employee accounts',
    icon: UsersRound,
  },
  {
    id: 'orders',
    href: '/workspace/orders',
    label: 'Sales & Orders',
    detail: 'Review order operations',
    icon: ShoppingBag,
  },
  {
    id: 'customers',
    href: '/workspace/customers',
    label: 'Customers',
    detail: 'Customer relationships',
    icon: UsersRound,
  },
  {
    id: 'invoices',
    href: '/workspace/invoices',
    label: 'Invoices & Quotes',
    detail: 'Billing and outstanding work',
    icon: FileText,
  },
  {
    id: 'purchases',
    href: '/workspace/purchases',
    label: 'Purchasing',
    detail: 'Supplier purchase workflow',
    icon: Truck,
  },
  {
    id: 'reports',
    href: '/workspace/reports',
    label: 'Reports',
    detail: 'Verified business reporting',
    icon: ChartNoAxesCombined,
  },
];

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;

  const styles = {
    connected: 'bg-gr-success-bg text-gr-success',
    attention: 'bg-gr-surface-alt text-gr-gold',
    unavailable: 'bg-gr-surface-alt text-gr-danger',
  }[metric.status];

  return (
    <article className="min-w-0 rounded-2xl border border-gr-border bg-gr-surface p-4 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold">
          <Icon
            size={21}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </span>

        <span
          className={
            'rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
            styles
          }
        >
          {metric.status === 'connected'
            ? 'Connected'
            : metric.status === 'attention'
              ? 'Needs attention'
              : 'Unavailable'}
        </span>
      </div>

      <p className="mt-4 text-xs font-semibold text-gr-muted">
        {metric.title}
      </p>

      <p className="mt-1 font-serif text-[clamp(1.5rem,2.6vw,2rem)] leading-tight text-gr-text">
        {metric.value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gr-muted">
        {metric.detail}
      </p>
    </article>
  );
}

function ReadinessRow({
  title,
  detail,
  ready,
}: {
  title: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-gr-border py-3 last:border-0">
      <span
        className={
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ' +
          (ready
            ? 'bg-gr-success-bg text-gr-success'
            : 'bg-gr-surface-alt text-gr-gold')
        }
      >
        {ready ? (
          <CircleCheck size={17} aria-hidden="true" />
        ) : (
          <CircleAlert size={17} aria-hidden="true" />
        )}
      </span>

      <span className="grid min-w-0 gap-1">
        <strong className="text-sm font-semibold text-gr-text">
          {title}
        </strong>

        <small className="text-xs leading-5 text-gr-muted">
          {detail}
        </small>
      </span>
    </li>
  );
}

async function ownerStaffCounts() {
  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_staff_manage',
      { p_action: 'list' },
    );

    if (
      error ||
      !data ||
      typeof data !== 'object'
    ) {
      return null;
    }

    const result = data as {
      employees?: unknown;
      invitations?: unknown;
    };

    if (
      !Array.isArray(result.employees) ||
      !Array.isArray(result.invitations)
    ) {
      return null;
    }

    const pending = result.invitations.filter(
      (value: unknown) =>
        value !== null &&
        typeof value === 'object' &&
        'status' in value &&
        value.status === 'pending',
    ).length;

    return {
      employees: result.employees.filter((value: unknown) =>
        value !== null &&
        typeof value === 'object' &&
        'status' in value &&
        value.status === 'active',
      ).length,
      pending,
    };
  } catch {
    return null;
  }
}

export default async function WorkspaceOverview() {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'overview')) {
    redirect(
      canViewModule(role, 'pos')
        ? '/workspace/pos'
        : '/staff/login',
    );
  }

  const mayViewProducts = canViewModule(
    role,
    'products',
  );

  const mayViewInventory = canViewModule(
    role,
    'inventory',
  );

  const today = lagosToday();
  const periodStart = shiftDate(today, -29);
  const mayViewFinance = canViewModule(role, 'reports');

  const [inventory, staff, todayFinance, monthFinance] = await Promise.all([
    mayViewInventory ? loadInventoryTotals() : Promise.resolve(null),
    role === 'owner' ? ownerStaffCounts() : Promise.resolve(null),
    mayViewFinance ? loadFinancialSnapshot(today, today) : Promise.resolve(null),
    mayViewFinance ? loadFinancialSnapshot(periodStart, today) : Promise.resolve(null),
  ]);

  const stores = inventory?.activeStores ?? null;
  const lowStockRows = inventory?.lowRecordedRows ?? null;
  const missingBalanceRows = inventory?.missingBalanceRows ?? null;

  const stockAlerts = inventory
    ? inventory.lowRecordedRows + inventory.missingBalanceRows
    : null;

  const catalogueReady =
    inventory !== null && inventory.activeProducts > 0;

  const storeReady =
    stores !== null && stores > 0;

  const staffReady =
    staff !== null && staff.employees > 0;

  const visibleShortcuts = shortcuts.filter(
    link => canViewModule(role, link.id),
  );

  const metrics: Metric[] = [
    {
      title: 'Active catalogue products',
      value: inventory ? quantity(inventory.activeProducts) : '—',
      detail: inventory
        ? `${quantity(inventory.totalProducts)} total records · ${quantity(inventory.draftProducts)} active drafts`
        : 'Whole-catalogue summary unavailable',
      icon: Package,
      status: !inventory ? 'unavailable' : catalogueReady ? 'connected' : 'attention',
    },
    {
      title: 'Published online',
      value: inventory ? quantity(inventory.publishedProducts) : '—',
      detail: 'Whole-catalogue published product count, not a page count',
      icon: ShoppingBag,
      status: !inventory ? 'unavailable' : inventory.publishedProducts > 0 ? 'connected' : 'attention',
    },
    {
      title: 'Physical stock · on hand',
      value: inventory ? quantity(inventory.physicalOnHand) : '—',
      detail: inventory
        ? `${quantity(inventory.availableUnits)} available · ${quantity(inventory.reservedUnits)} reserved; active locations`
        : 'Whole-inventory summary unavailable',
      icon: Boxes,
      status: !inventory ? 'unavailable' : 'connected',
    },
    {
      title: 'Stock rows needing attention',
      value: stockAlerts === null ? '—' : quantity(stockAlerts),
      detail: inventory
        ? `${quantity(inventory.lowRecordedRows)} recorded low/empty · ${quantity(inventory.missingBalanceRows)} missing balance records`
        : 'Cannot verify stock coverage',
      icon: CircleAlert,
      status: stockAlerts === null ? 'unavailable' : stockAlerts > 0 ? 'attention' : 'connected',
    },
    {
      title: 'Active retail stores',
      value: stores === null ? '—' : quantity(stores),
      detail: inventory
        ? `${quantity(inventory.activeLocations)} active store, warehouse or stockroom location(s)`
        : 'Location service unavailable',
      icon: Building2,
      status: stores === null ? 'unavailable' : stores > 0 ? 'connected' : 'attention',
    },
    {
      title: 'Active employees',
      value: staff ? quantity(staff.employees) : '—',
      detail: staff
        ? `${quantity(staff.pending)} pending invitation(s)`
        : role === 'owner' ? 'Employee directory unavailable' : 'Owner-only information',
      icon: UsersRound,
      status: staff ? staff.employees > 0 ? 'connected' : 'attention' : 'unavailable',
    },
    ...(mayViewFinance ? [
      {
        title: 'Completed POS revenue · today',
        value: todayFinance ? formatPrice(todayFinance.sales.totalMinor) : '—',
        detail: todayFinance
          ? `${quantity(todayFinance.sales.transactions)} completed sale(s); Africa/Lagos date`
          : 'Sales reporting unavailable',
        icon: ChartNoAxesCombined,
        status: todayFinance ? 'connected' as const : 'unavailable' as const,
      },
      {
        title: 'Completed POS revenue · 30 days',
        value: monthFinance ? formatPrice(monthFinance.sales.totalMinor) : '—',
        detail: monthFinance
          ? `${quantity(monthFinance.sales.transactions)} completed sale(s); excludes unverified WhatsApp enquiries`
          : 'Sales reporting unavailable',
        icon: FileText,
        status: monthFinance ? 'connected' as const : 'unavailable' as const,
      },
    ] : []),
  ];

  return (
    <section
      className="gr-executive grid min-w-0 gap-5"
      aria-labelledby="gr-operations-title"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gr-gold">
            Golden Rose / Operations
          </p>

          <h2
            id="gr-operations-title"
            className="font-serif text-[clamp(1.75rem,3vw,2.35rem)] leading-tight tracking-tight text-gr-text"
          >
            Executive overview
          </h2>

          <p className="max-w-2xl text-sm leading-6 text-gr-muted">
            Verified catalogue and inventory totals,
            completed POS performance and access to
            every permitted business workspace.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-gr-border bg-gr-surface px-3 py-2 text-xs font-semibold text-gr-gold">
          <ShieldCheck size={16} aria-hidden="true" />
          Authenticated business workspace
        </span>
      </header>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <MetricCard
            key={metric.title}
            metric={metric}
          />
        ))}
      </div>

      {mayViewFinance && (
        <section
          className="grid min-w-0 gap-4 rounded-2xl border border-gr-border bg-gr-surface p-5 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-6"
          aria-labelledby="gr-executive-finance"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gr-gold">
                Executive finance / real transactions
              </p>

              <h3
                id="gr-executive-finance"
                className="mt-1 font-serif text-2xl text-gr-text"
              >
                Financial overview
              </h3>

              <p className="mt-2 max-w-3xl text-xs leading-5 text-gr-muted">
                {periodStart} to {today} (Africa/Lagos).
                POS revenue counts completed transactions only.
                Enquiries, invoice issuance and purchase commitments
                are not additional sales revenue.
              </p>
            </div>

            <Link
              href="/workspace/reports"
              className="inline-flex items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-3 py-2 text-xs font-semibold text-gr-gold hover:bg-gr-accent-soft"
            >
              Full reports
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          {!monthFinance || !todayFinance ? (
            <p
              role="status"
              className="rounded-xl border border-gr-border bg-gr-surface p-4 text-sm text-gr-gold"
            >
              One or more financial reporting periods could not be verified.
              Check Reports &amp; Analytics; no revenue has been estimated.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  title: 'Approved expenses · 30 days',
                  value: formatPrice(monthFinance.expenses.approvedMinor),
                  detail: `${formatPrice(monthFinance.expenses.paidRecordedMinor)} recorded paid`,
                },
                {
                  title: 'Purchase commitments · 30 days',
                  value: formatPrice(monthFinance.purchasing.commitmentsMinor),
                  detail: `${quantity(monthFinance.purchasing.receipts)} goods receipt(s) · not an expense total`,
                },
                {
                  title: 'Issued invoice balance · 30 days',
                  value: formatPrice(monthFinance.invoices.outstandingMinor),
                  detail: `Balance on ${quantity(monthFinance.invoices.issuedCount)} invoice(s) issued in this period`,
                },
                {
                  title: 'Estimated stock at catalogue cost',
                  value: inventory?.stockCostMinor === null || !inventory
                    ? '—'
                    : formatPrice(inventory.stockCostMinor),
                  detail: inventory
                    ? inventory.missingCostUnits > 0
                      ? `${quantity(inventory.missingCostUnits)} physical unit(s) have no usable NGN cost; total withheld`
                      : 'Active locations, all recorded stock, including inactive variants; not COGS'
                    : 'Inventory cost coverage unavailable',
                },
              ].map(item => (
                <article
                  key={item.title}
                  className="rounded-xl border border-gr-border bg-gr-surface p-4"
                >
                  <p className="text-xs font-semibold text-gr-muted">
                    {item.title}
                  </p>
                  <p className="mt-2 break-words font-serif text-xl text-gr-text">
                    {item.value}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-gr-muted">
                    {item.detail}
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <p className="rounded-xl border border-gr-border bg-gr-surface p-4 text-xs leading-5 text-gr-gold">
              <strong>Gross and net profit: not yet verified.</strong>
              {' '}Historical COGS, stock-cost snapshots, returns and
              refunds must be reconciled before trustworthy profit
              can be shown. Current catalogue costs are not historical
              cost of goods sold.
            </p>

            {(inventory?.qaProducts ||
              (monthFinance?.sales.qaCodedTransactions ?? 0)) ? (
              <p
                role="status"
                className="rounded-xl border border-gr-border bg-gr-surface p-4 text-xs leading-5 text-gr-gold"
              >
                <strong>QA records detected:</strong>
                {' '}{quantity(inventory?.qaProducts ?? 0)} QA-labelled
                product(s) and
                {' '}{quantity(monthFinance?.sales.qaCodedTransactions ?? 0)}
                {' '}QA-coded POS sale(s) within this reporting period.
                Do not report these figures as the boutique&apos;s
                real trading performance.
              </p>
            ) : (
              <p className="rounded-xl border border-gr-border bg-gr-surface p-4 text-xs leading-5 text-gr-muted">
                For live trading decisions, reconcile transaction records
                against receipts, verified payments and operating expenses.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
        <section
          className="min-w-0 rounded-2xl border border-gr-border bg-gr-surface p-5 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-6"
          aria-labelledby="gr-ops-priorities"
        >
          <div className="flex items-start justify-between gap-3 border-b border-gr-border pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gr-gold">
                Recommended next actions
              </p>

              <h3
                id="gr-ops-priorities"
                className="mt-1 font-serif text-2xl text-gr-text"
              >
                What needs attention
              </h3>
            </div>

            <ClipboardList
              className="text-gr-gold"
              size={22}
              aria-hidden="true"
            />
          </div>

          <div className="mt-4 grid gap-3">
            {!catalogueReady && mayViewProducts && (
              <Link
                href="/workspace/products"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 transition-colors hover:bg-gr-accent-soft"
              >
                <Package
                  className="shrink-0 text-gr-gold"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-gr-text">
                    Check catalogue access
                  </strong>

                  <small className="text-xs leading-5 text-gr-muted">
                    Verify imported products and
                    their publication status.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-gr-gold"
                  aria-hidden="true"
                />
              </Link>
            )}

            {!storeReady && mayViewInventory && (
              <Link
                href="/workspace/inventory"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 transition-colors hover:bg-gr-accent-soft"
              >
                <Building2
                  className="shrink-0 text-gr-gold"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-gr-text">
                    Verify store setup
                  </strong>

                  <small className="text-xs leading-5 text-gr-muted">
                    Employees and cash registers
                    need a real active retail location.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-gr-gold"
                  aria-hidden="true"
                />
              </Link>
            )}

            {role === 'owner' && !staffReady && (
              <Link
                href="/workspace/staff"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 transition-colors hover:bg-gr-accent-soft"
              >
                <UsersRound
                  className="shrink-0 text-gr-gold"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-gr-text">
                    Set up employee access
                  </strong>

                  <small className="text-xs leading-5 text-gr-muted">
                    Create or invite staff and
                    test role-based sign-in.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-gr-gold"
                  aria-hidden="true"
                />
              </Link>
            )}

            {mayViewInventory &&
              inventory &&
              stockAlerts !== null &&
              stockAlerts > 0 && (
                <Link
                  href="/workspace/inventory#inventory-balances"
                  className="group flex min-w-0 items-center gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 transition-colors hover:bg-gr-accent-soft"
                >
                  <CircleAlert
                    className="shrink-0 text-gr-gold"
                    size={19}
                    aria-hidden="true"
                  />

                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="text-sm text-gr-text">
                      Review {stockAlerts} stock row(s)
                      needing attention
                    </strong>

                    <small className="text-xs leading-5 text-gr-muted">
                      {quantity(lowStockRows ?? 0)} recorded low/empty;
                      {` ${quantity(missingBalanceRows ?? 0)} missing stock balances`}.
                    </small>
                  </span>

                  <ArrowRight
                    size={17}
                    className="shrink-0 text-gr-gold"
                    aria-hidden="true"
                  />
                </Link>
              )}

            {catalogueReady &&
              storeReady &&
              (role !== 'owner' || staffReady) &&
              inventory !== null &&
              stockAlerts === 0 &&
              inventory.qaProducts === 0 && (
                <p className="rounded-xl border border-gr-border bg-gr-success-bg p-4 text-sm leading-6 text-gr-success">
                  Catalogue, store and staff checks are available,
                  with no low or missing stock rows flagged.
                  Continue receipt, POS and payment acceptance testing.
                </p>
              )}

            <p className="rounded-xl bg-gr-surface-alt p-4 text-xs leading-5 text-gr-muted">
              Dashboard metrics use database-wide inventory summaries
              rather than the first page of inventory. Physical stock is
              counted across active locations; missing stock records are
              separate from an explicit zero. Financial figures are sourced
              from the same authorized reporting function as Reports.
              They are not a substitute for financial reconciliation.
            </p>
          </div>
        </section>

        <section
          className="min-w-0 rounded-2xl border border-gr-border bg-gr-surface p-5 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-6"
          aria-labelledby="gr-ops-readiness"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gr-gold">
            Live checks
          </p>

          <h3
            id="gr-ops-readiness"
            className="mt-1 font-serif text-2xl text-gr-text"
          >
            Store readiness
          </h3>

          <ul className="mt-4">
            <ReadinessRow
              title="Catalogue"
              detail={
                catalogueReady
                  ? 'Product records can be retrieved.'
                  : 'Check the product service.'
              }
              ready={catalogueReady}
            />

            <ReadinessRow
              title="Retail location"
              detail={
                storeReady
                  ? `${stores} active store${stores === 1 ? '' : 's'} configured.`
                  : 'No active store could be verified.'
              }
              ready={storeReady}
            />

            {role === 'owner' && (
              <ReadinessRow
                title="Staff directory"
                detail={
                  staffReady
                    ? `${staff!.employees} employee account${staff!.employees === 1 ? '' : 's'} found.`
                    : 'Review employee invitations and account setup.'
                }
                ready={staffReady}
              />
            )}

            <ReadinessRow
              title="Financial reporting"
              detail={monthFinance && todayFinance
                ? 'Completed POS and invoice reporting is connected.'
                : 'One or more reporting periods could not be verified.'}
              ready={Boolean(monthFinance && todayFinance)}
            />

            <ReadinessRow
              title="Stock count coverage"
              detail={inventory
                ? `${quantity(inventory.missingBalanceRows)} active variant/location pairs without balance records.`
                : 'Whole-stock coverage is unavailable.'}
              ready={Boolean(inventory && inventory.missingBalanceRows === 0)}
            />

            {mayViewFinance && (
              <ReadinessRow
                title="Gross profit, net profit and refunds"
                detail="Awaiting historical COGS and refund reconciliation."
                ready={false}
              />
            )}
          </ul>
        </section>
      </div>

      <section
        className="min-w-0"
        aria-labelledby="gr-ops-workspaces"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gr-gold">
              Your tools
            </p>

            <h3
              id="gr-ops-workspaces"
              className="mt-1 font-serif text-2xl text-gr-text"
            >
              Business workspaces
            </h3>
          </div>

          {role === 'owner' && (
            <Link
              href="/workspace/migration"
              className="inline-flex items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-3 py-2 text-xs font-semibold text-gr-gold hover:bg-gr-accent-soft"
            >
              Data Management

              <ArrowRight
                size={15}
                aria-hidden="true"
              />
            </Link>
          )}
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleShortcuts.map(link => {
            const Icon = link.icon;

            return (
              <Link
                key={link.id}
                href={link.href}
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 shadow-[0_4px_20px_rgba(70,23,47,0.03)] transition-colors hover:border-gr-border hover:bg-gr-surface-alt"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gr-surface-alt text-gr-gold">
                  <Icon
                    size={19}
                    aria-hidden="true"
                  />
                </span>

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-gr-text">
                    {link.label}
                  </strong>

                  <small className="text-xs text-gr-muted">
                    {link.detail}
                  </small>
                </span>

                <ArrowRight
                  size={16}
                  className="shrink-0 text-gr-gold transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </section>
  );
}
