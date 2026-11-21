
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ArrowRight,
  Barcode,
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

import {
  getAdminProductsPage,
  getInventoryPage,
} from '@/src/lib/golden-rose/edge';

import { createClient } from '@/src/lib/supabase/server';

import './executive-operations.css';

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
    connected: 'bg-[#e8f5ed] text-[#266746]',
    attention: 'bg-[#fff1dc] text-[#915d22]',
    unavailable: 'bg-[#f5edf0] text-[#86546a]',
  }[metric.status];

  return (
    <article className="min-w-0 rounded-2xl border border-[#eadbd8] bg-[#fffdf9] p-4 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f9ecda] text-[#9d702f]">
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

      <p className="mt-4 text-xs font-semibold text-[#826f7a]">
        {metric.title}
      </p>

      <p className="mt-1 font-serif text-[clamp(1.5rem,2.6vw,2rem)] leading-tight text-[#46172f]">
        {metric.value}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#8a7782]">
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
    <li className="flex items-start gap-3 border-b border-[#f0e5e1] py-3 last:border-0">
      <span
        className={
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ' +
          (ready
            ? 'bg-[#eaf5ec] text-[#37764d]'
            : 'bg-[#fff1df] text-[#a26f2c]')
        }
      >
        {ready ? (
          <CircleCheck size={17} aria-hidden="true" />
        ) : (
          <CircleAlert size={17} aria-hidden="true" />
        )}
      </span>

      <span className="grid min-w-0 gap-1">
        <strong className="text-sm font-semibold text-[#4e2b3d]">
          {title}
        </strong>

        <small className="text-xs leading-5 text-[#87747e]">
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
        value !== null && typeof value === 'object' && 'status' in value && value.status === 'active',
      ).length,
      pending,
    };
  } catch {
    return null;
  }
}

async function ownerCustomerCounts() {
  try {
    const client = await createClient();
    const { data, error } = await client.rpc('gr_owner_customer_counts');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;

    const row = data as Record<string, unknown>;
    const getCount = (key: string) => {
      const value = row[key];
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
    };
    const totalCustomers = getCount('totalCustomers');
    const verifiedCustomers = getCount('verifiedCustomers');
    const new30Days = getCount('new30Days');
    const signedIn30Days = getCount('signedIn30Days');
    if (totalCustomers === null || verifiedCustomers === null ||
        new30Days === null || signedIn30Days === null) return null;

    const channelData = row.productChannels;
    let productChannels: {
      totalProducts: number;
      posOnly: number;
      onlineOnly: number;
      bothChannels: number;
      hidden: number;
    } | null = null;
    if (channelData && typeof channelData === 'object' && !Array.isArray(channelData)) {
      const values = channelData as Record<string, unknown>;
      const count = (key: string): number | null => {
        const value = values[key];
        return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
      };
      const totalProducts = count('totalProducts');
      const posOnly = count('posOnly');
      const onlineOnly = count('onlineOnly');
      const bothChannels = count('bothChannels');
      const hidden = count('hidden');
      if (totalProducts !== null && posOnly !== null && onlineOnly !== null &&
          bothChannels !== null && hidden !== null) {
        productChannels = { totalProducts, posOnly, onlineOnly, bothChannels, hidden };
      }
    }

    return { totalCustomers, verifiedCustomers, new30Days, signedIn30Days, productChannels };
  } catch {
    return null;
  }
}

export default async function WorkspaceOverview() {
  const { role, token } = await requireStaff();

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

  const [catalogue, inventory, staff, customerCounts] =
    await Promise.all([
      mayViewProducts
        ? getAdminProductsPage(token, 0, 1)
            .then(items => ({
              reachable: true,
              hasProducts: items.length > 0,
            }))
            .catch(() => ({
              reachable: false,
              hasProducts: false,
            }))
        : Promise.resolve(null),

      mayViewInventory
        ? getInventoryPage(token, 0)
            .catch(() => null)
        : Promise.resolve(null),

      role === 'owner'
        ? ownerStaffCounts()
        : Promise.resolve(null),

      role === 'owner'
        ? ownerCustomerCounts()
        : Promise.resolve(null),
    ]);

  const stores =
    inventory?.locations.filter(
      location =>
        location.active &&
        location.type === 'store',
    ).length ?? null;

  const stockRows =
    inventory?.items.length ?? null;

  const lowStockOnPage =
    inventory?.items.filter(
      item => item.available <= 5,
    ).length ?? null;

  const catalogueReady =
    catalogue?.reachable === true &&
    catalogue.hasProducts;

  const storeReady =
    stores !== null && stores > 0;

  const staffReady =
    staff !== null && staff.employees > 0;

  const visibleShortcuts = shortcuts.filter(
    link => canViewModule(role, link.id),
  );

  const metrics: Metric[] = [
    {
      title: 'Product catalogue',
      value: catalogue?.reachable
        ? catalogue.hasProducts
          ? 'Accessible'
          : 'Empty'
        : '—',
      detail: catalogue?.reachable
        ? 'Live catalogue connection checked'
        : 'Unable to confirm catalogue access',
      icon: Package,
      status: catalogue?.reachable
        ? catalogue.hasProducts
          ? 'connected'
          : 'attention'
        : 'unavailable',
    },
    {
      title: 'Active retail stores',
      value: stores === null
        ? '—'
        : stores.toLocaleString('en-NG'),
      detail: 'Real store locations in Inventory',
      icon: Building2,
      status: stores === null
        ? 'unavailable'
        : stores > 0
          ? 'connected'
          : 'attention',
    },
    {
      title: 'Active employees',
      value: staff
        ? staff.employees.toLocaleString('en-NG')
        : '—',
      detail: staff
        ? `${staff.pending} pending in recent invitations`
        : role === 'owner'
          ? 'Employee directory not available'
          : 'Owner-only information',
      icon: UsersRound,
      status: staff
        ? staff.employees
          ? 'connected'
          : 'attention'
        : 'unavailable',
    },
    {
      title: 'Inventory variant rows',
      value: stockRows === null
        ? '—'
        : stockRows.toLocaleString('en-NG'),
      detail: stockRows === null
        ? 'Stock service unavailable'
        : 'First page, including variants with zero stock',
      icon: Barcode,
      status: stockRows === null
        ? 'unavailable'
        : stockRows > 0
          ? 'connected'
          : 'attention',
    },
  ];

  return (
    <section
      className="gr-executive grid min-w-0 gap-5"
      aria-labelledby="gr-operations-title"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a47636]">
            Golden Rose / Operations
          </p>

          <h2
            id="gr-operations-title"
            className="font-serif text-[clamp(1.75rem,3vw,2.35rem)] leading-tight tracking-tight text-[#46172f]"
          >
            Executive overview
          </h2>

          <p className="max-w-2xl text-sm leading-6 text-[#85717d]">
            Live operational readiness, your next
            priorities and access to every permitted
            workspace.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-[#e9d8bb] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8c612b]">
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


      {role === 'owner' && (
        <section aria-label="Customer account analytics">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a47636]">
                Customers / Online store
              </p>
              <h3 className="mt-1 font-serif text-2xl text-[#46172f]">
                Registered customer accounts
              </h3>
            </div>
            <p className="text-xs text-[#85717d]">
              Staff accounts, POS contacts and WhatsApp enquiries are not counted as registered customers.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ['Registered customers', customerCounts?.totalCustomers, 'All non-staff customer accounts', UsersRound],
              ['Verified customers', customerCounts?.verifiedCustomers, 'Accounts with confirmed email', CircleCheck],
              ['New in 30 days', customerCounts?.new30Days, 'Customer registrations in the past 30 days', ShoppingBag],
              ['Signed in recently', customerCounts?.signedIn30Days, 'Customer accounts signed in within 30 days', ChartNoAxesCombined],
            ] as const).map(([title, count, detail, icon]) => (
              <MetricCard key={title} metric={{
                title,
                value: count === undefined ? '—' : count.toLocaleString('en-NG'),
                detail: count === undefined ? 'Customer analytics unavailable or awaiting migration' : detail,
                icon,
                status: count === undefined ? 'unavailable' : 'connected',
              }} />
            ))}
          </div>
        </section>
      )}


      {role === 'owner' && (
        <section aria-label="Product sales channel analytics">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a47636]">
                Catalogue / Sales channels
              </p>
              <h3 className="mt-1 font-serif text-2xl text-[#46172f]">
                Where your products are available
              </h3>
            </div>
            <Link href="/workspace/products" className="text-sm font-semibold text-[#7a435f] underline underline-offset-4">
              Manage product visibility
            </Link>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {([
              ['Total products', customerCounts?.productChannels?.totalProducts, 'All catalogue products', Package],
              ['In-store only', customerCounts?.productChannels?.posOnly, 'Sellable through POS only', ScanBarcode],
              ['Online only', customerCounts?.productChannels?.onlineOnly, 'Public shop without POS', ShoppingBag],
              ['Both channels', customerCounts?.productChannels?.bothChannels, 'POS and public online shop', Boxes],
              ['Hidden or inactive', customerCounts?.productChannels?.hidden, 'Not available for purchase', CircleAlert],
            ] as const).map(([title, count, detail, icon]) => (
              <MetricCard key={title} metric={{
                title,
                value: count === undefined ? '—' : count.toLocaleString('en-NG'),
                detail: count === undefined ? 'Sales-channel metrics awaiting database upgrade' : detail,
                icon,
                status: count === undefined ? 'unavailable' : 'connected',
              }} />
            ))}
          </div>
        </section>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
        <section
          className="min-w-0 rounded-2xl border border-[#eadbd8] bg-[#fffdf9] p-5 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-6"
          aria-labelledby="gr-ops-priorities"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#f0e6e2] pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a47636]">
                Recommended next actions
              </p>

              <h3
                id="gr-ops-priorities"
                className="mt-1 font-serif text-2xl text-[#46172f]"
              >
                What needs attention
              </h3>
            </div>

            <ClipboardList
              className="text-[#ad8247]"
              size={22}
              aria-hidden="true"
            />
          </div>

          <div className="mt-4 grid gap-3">
            {!catalogueReady && mayViewProducts && (
              <Link
                href="/workspace/products"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#f0e1d2] bg-[#fff9f0] p-4 transition-colors hover:bg-[#fff1db]"
              >
                <Package
                  className="shrink-0 text-[#a67532]"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-[#4f2b3d]">
                    Check catalogue access
                  </strong>

                  <small className="text-xs leading-5 text-[#8a7580]">
                    Verify imported products and
                    their publication status.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-[#a67532]"
                  aria-hidden="true"
                />
              </Link>
            )}

            {!storeReady && mayViewInventory && (
              <Link
                href="/workspace/inventory"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#f0e1d2] bg-[#fff9f0] p-4 transition-colors hover:bg-[#fff1db]"
              >
                <Building2
                  className="shrink-0 text-[#a67532]"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-[#4f2b3d]">
                    Verify store setup
                  </strong>

                  <small className="text-xs leading-5 text-[#8a7580]">
                    Employees and cash registers
                    need a real active retail location.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-[#a67532]"
                  aria-hidden="true"
                />
              </Link>
            )}

            {role === 'owner' && !staffReady && (
              <Link
                href="/workspace/staff"
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#f0e1d2] bg-[#fff9f0] p-4 transition-colors hover:bg-[#fff1db]"
              >
                <UsersRound
                  className="shrink-0 text-[#a67532]"
                  size={19}
                  aria-hidden="true"
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-[#4f2b3d]">
                    Set up employee access
                  </strong>

                  <small className="text-xs leading-5 text-[#8a7580]">
                    Create or invite staff and
                    test role-based sign-in.
                  </small>
                </span>

                <ArrowRight
                  size={17}
                  className="shrink-0 text-[#a67532]"
                  aria-hidden="true"
                />
              </Link>
            )}

            {mayViewInventory &&
              inventory &&
              lowStockOnPage !== null &&
              lowStockOnPage > 0 && (
                <Link
                  href="/workspace/inventory#inventory-balances"
                  className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#f0e1d2] bg-[#fff9f0] p-4 transition-colors hover:bg-[#fff1db]"
                >
                  <CircleAlert
                    className="shrink-0 text-[#a67532]"
                    size={19}
                    aria-hidden="true"
                  />

                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="text-sm text-[#4f2b3d]">
                      Review {lowStockOnPage} low / empty
                      stock rows
                    </strong>

                    <small className="text-xs leading-5 text-[#8a7580]">
                      First inventory page only;
                      confirm physical quantities.
                    </small>
                  </span>

                  <ArrowRight
                    size={17}
                    className="shrink-0 text-[#a67532]"
                    aria-hidden="true"
                  />
                </Link>
              )}

            {catalogueReady &&
              storeReady &&
              (role !== 'owner' || staffReady) &&
              (lowStockOnPage === null ||
                lowStockOnPage === 0) && (
                <p className="rounded-xl border border-[#dceadf] bg-[#f3faf5] p-4 text-sm leading-6 text-[#3e6e4a]">
                  Catalogue, store and available team
                  checks look good. Continue verifying
                  actual receiving and POS transactions
                  before going live.
                </p>
              )}

            <p className="rounded-xl bg-[#f8f3ee] p-4 text-xs leading-5 text-[#866f7b]">
              Financial totals are intentionally not
              shown until verified sales and reporting
              endpoints are connected. A working page
              does not by itself confirm a complete
              business workflow.
            </p>
          </div>
        </section>

        <section
          className="min-w-0 rounded-2xl border border-[#eadbd8] bg-[#fffdf9] p-5 shadow-[0_7px_28px_rgba(77,24,49,0.045)] sm:p-6"
          aria-labelledby="gr-ops-readiness"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a47636]">
            Live checks
          </p>

          <h3
            id="gr-ops-readiness"
            className="mt-1 font-serif text-2xl text-[#46172f]"
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
              detail="Awaiting verified sales, orders and revenue integration."
              ready={false}
            />
          </ul>
        </section>
      </div>

      <section
        className="min-w-0"
        aria-labelledby="gr-ops-workspaces"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a47636]">
              Your tools
            </p>

            <h3
              id="gr-ops-workspaces"
              className="mt-1 font-serif text-2xl text-[#46172f]"
            >
              Business workspaces
            </h3>
          </div>

          {role === 'owner' && (
            <Link
              href="/workspace/migration"
              className="inline-flex items-center gap-2 rounded-lg border border-[#dfc9b6] bg-[#fff8ee] px-3 py-2 text-xs font-semibold text-[#754c27] hover:bg-[#fff1dc]"
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
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#eadbd8] bg-[#fffdf9] p-4 shadow-[0_4px_20px_rgba(70,23,47,0.03)] transition-colors hover:border-[#d8b68e] hover:bg-[#fff8ef]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#f9ecd9] text-[#a47636]">
                  <Icon
                    size={19}
                    aria-hidden="true"
                  />
                </span>

                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="text-sm text-[#4c293a]">
                    {link.label}
                  </strong>

                  <small className="text-xs text-[#8a7880]">
                    {link.detail}
                  </small>
                </span>

                <ArrowRight
                  size={16}
                  className="shrink-0 text-[#ad8248] transition-transform group-hover:translate-x-0.5"
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
