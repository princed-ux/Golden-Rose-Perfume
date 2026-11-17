
import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowRight,
  Barcode,
  Boxes,
  Building2,
  ClipboardList,
  Package,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Warehouse,
} from 'lucide-react';

import {
  WorkspaceNotice,
  WorkspacePanel,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';

import {
  EdgeError,
  getInventoryPage,
  listAdminProducts,
} from '@/src/lib/golden-rose/edge';

import {
  canManageStockSetup,
  canReceiveStock,
  LOCATION_TYPES,
} from '@/src/lib/golden-rose/contracts';

import { createLocation } from '../actions';
import { OperationForm } from '../operation-form';
import { ReceivingForm } from './receiving-form';
import { InventoryTable } from './inventory-table';
import { stockState } from '@/src/lib/golden-rose/stock-evidence';

const card =
  'min-w-0 rounded-2xl border border-[#e9dcd5] bg-[#fffdfb] shadow-[0_4px_24px_rgba(61,18,37,0.035)]';

const heading =
  'font-serif text-xl font-normal tracking-tight text-[#471a31] sm:text-2xl';

function Metric({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className={card + ' p-4 sm:p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-semibold text-[#876e7a]">
            {label}
          </p>

          <strong className="font-serif text-3xl font-normal tabular-nums text-[#46172f]">
            {value}
          </strong>
        </div>

        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fbefdc] text-[#a77d42]">
          {icon}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#8c7781]">
        {description}
      </p>
    </div>
  );
}

export default function InventoryPage({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-[#6f5162]" role="status">Loading inventory…</p>}>
      <InventoryWorkspace searchParams={searchParams} />
    </Suspense>
  );
}

async function InventoryWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { token, role, userId } = await requireStaff();

  if (!canViewModule(role, 'inventory')) {
    notFound();
  }

  const { offset: rawOffset } = await searchParams;

  const offset =
    typeof rawOffset === 'string' &&
    /^\d{1,7}$/.test(rawOffset) &&
    Number(rawOffset) <= 1_000_000
      ? Number(rawOffset)
      : 0;

  const mayCreateLocations = canManageStockSetup(role);
  const mayReceiveStock = canReceiveStock(role);

  const [inventoryResult, productsResult] =
    await Promise.allSettled([
      getInventoryPage(token, offset),
      mayReceiveStock
        ? listAdminProducts(token)
        : Promise.resolve([]),
    ]);

  const inventory =
    inventoryResult.status === 'fulfilled'
      ? inventoryResult.value
      : null;

  const errorMessage =
    inventoryResult.status === 'rejected'
      ? inventoryResult.reason instanceof EdgeError
        ? inventoryResult.reason.message
        : 'Could not connect to inventory.'
      : '';

  const locations = inventory?.locations ?? [];
  const balances = inventory?.items ?? [];

  const activeLocations = locations.filter(
    location => location.active,
  );

  const activeStores = locations.filter(
    location =>
      location.active && location.type === 'store',
  );

  const variants =
    productsResult.status === 'fulfilled'
      ? productsResult.value
          .filter(product => product.active)
          .flatMap(product =>
            product.variants
              .filter(variant => variant.active)
              .map(variant => ({
                id: variant.variantId,
                label: [
                  product.name,
                  variant.sizeMl
                    ? `${variant.sizeMl} ml`
                    : null,
                  variant.sku,
                  variant.barcode,
                ]
                  .filter(Boolean)
                  .join(' · '),
                sku: variant.sku,
                barcode: variant.barcode,
              })),
          )
      : [];

  const displayedAvailable = balances.reduce(
    (sum, balance) => sum + balance.available,
    0,
  );

  const countsToVerify = balances.filter(balance => {
    const state = stockState(balance);
    return state === 'not-counted' || state === 'unverified-zero';
  }).length;

  return (
    <div className="grid min-w-0 gap-6 pb-10">
      {/* MAIN HEADING */}
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 border-b border-[#e7dad7] pb-5">
        <div className="grid min-w-0 gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#a57839]">
            Operations / Inventory
          </p>

          <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-tight tracking-tight text-[#46172f]">
            Inventory &amp; Stock
          </h1>

          <p className="max-w-2xl text-sm leading-6 text-[#806d77]">
            Manage physical stores, receive fragrance
            deliveries and monitor available stock
            across Golden Rose locations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/workspace/inventory"
            className={workspaceSecondary}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </Link>

          <Link
            href="/workspace/products"
            className={workspacePrimary}
          >
            <Package size={16} aria-hidden="true" />
            Product catalogue
            <ArrowRight
              size={15}
              aria-hidden="true"
            />
          </Link>
        </div>
      </header>

      {/* DASHBOARD STATISTICS */}
      <section
        aria-label="Inventory overview"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric
          icon={<Building2 size={20} />}
          label="Active stores"
          value={
            inventory
              ? String(activeStores.length)
              : '—'
          }
          description="Retail locations currently configured"
        />

        <Metric
          icon={<Warehouse size={20} />}
          label="All active locations"
          value={
            inventory
              ? String(activeLocations.length)
              : '—'
          }
          description="Stores, warehouses and stockrooms"
        />

        <Metric
          icon={<Boxes size={20} />}
          label="Available units"
          value={
            inventory
              ? displayedAvailable.toLocaleString('en-NG')
              : '—'
          }
          description="Sum of balances on this page only"
        />

        <Metric
          icon={<PackageCheck size={20} />}
          label="Counts to verify"
          value={
            inventory
              ? String(countsToVerify)
              : '—'
          }
          description="Entries without a confirmed quantity on this page"
        />
      </section>

      {/* QUICK SECTION NAVIGATION */}
      <nav
        aria-label="Inventory sections"
        className="flex flex-wrap gap-2 border-b border-[#e9dcd7] pb-4"
      >
        <a
          href="#inventory-locations"
          className={workspaceSecondary}
        >
          <Building2
            size={16}
            aria-hidden="true"
          />
          Locations
        </a>

        {mayReceiveStock && (
          <a
            href="#inventory-receive"
            className={workspaceSecondary}
          >
            <ArrowDownToLine
              size={16}
              aria-hidden="true"
            />
            Receive stock
          </a>
        )}

        <a
          href="#inventory-balances"
          className={workspaceSecondary}
        >
          <ClipboardList
            size={16}
            aria-hidden="true"
          />
          Stock register
        </a>
      </nav>

      {/* CONNECTION FAILURE */}
      {!inventory && (
        <WorkspaceNotice
          title="Inventory connection unavailable"
          tone="error"
          action={
            <Link
              href="/workspace/inventory"
              className={workspaceSecondary}
            >
              Retry connection
            </Link>
          }
        >
          {errorMessage}
          {' '}
          Existing stock records have not been changed.
        </WorkspaceNotice>
      )}

      {/* LOCATIONS */}
      <section
        id="inventory-locations"
        className="grid min-w-0 scroll-mt-24 gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a57839]">
              Location management
            </p>

            <h2 className={heading}>
              Stores &amp; warehouses
            </h2>

            <p className="mt-2 text-sm text-[#816d78]">
              Every cashier and stock movement must
              be linked to the correct physical location.
            </p>
          </div>

          <span className="rounded-full border border-[#ead8bb] bg-[#fff8ec] px-3 py-1.5 text-xs font-semibold text-[#956b36]">
            {inventory
              ? `${locations.length} configured`
              : 'Connection required'}
          </span>
        </div>

        {locations.length === 0 && inventory && (
          <WorkspaceNotice
            title="No store has been created yet"
            tone="pending"
          >
            Create the actual Golden Rose retail store
            below. This enables employee store assignments,
            barcode-based inventory lookup and physical
            stock receiving.

            Do not create stock quantities here; stock is
            added through a recorded receiving transaction.
          </WorkspaceNotice>
        )}

        {mayCreateLocations && (
          <WorkspacePanel
            label="inventory-create-location-title"
            className="grid gap-4"
          >
            <details open={locations.length === 0}>
              <summary className="cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a57839]">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#fbefdc] text-[#a57839]">
                      <Building2
                        size={19}
                        aria-hidden="true"
                      />
                    </span>

                    <span className="grid gap-1">
                      <strong
                        id="inventory-create-location-title"
                        className="font-serif text-xl font-normal text-[#471a31]"
                      >
                        Add a location
                      </strong>

                      <small className="text-xs font-normal text-[#806d77]">
                        Register a real shop, warehouse
                        or stockroom
                      </small>
                    </span>
                  </span>

                  <span className="rounded-lg border border-[#e6d6c6] px-3 py-2 text-xs font-semibold text-[#6e4156]">
                    Open form
                  </span>
                </span>
              </summary>

              <div className="mt-5 border-t border-[#ecdfd8] pt-5">
                <OperationForm
                  runAction={createLocation}
                  label="Save location"
                >
                  <label className={workspaceLabel}>
                    Location name
                    <input
                      className={workspaceInput}
                      name="name"
                      required
                      minLength={2}
                      maxLength={150}
                      placeholder="Actual business location"
                    />
                  </label>

                  <label className={workspaceLabel}>
                    Unique location code
                    <input
                      className={workspaceInput}
                      name="code"
                      required
                      minLength={2}
                      maxLength={32}
                      pattern="[A-Za-z0-9_-]{2,32}"
                      placeholder="GR-STORE-01"
                    />
                  </label>

                  <label className={workspaceLabel}>
                    Location type
                    <select
                      className={workspaceInput}
                      name="type"
                      defaultValue="store"
                    >
                      {LOCATION_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type === 'stockroom'
                            ? 'Stockroom'
                            : type === 'warehouse'
                              ? 'Warehouse'
                              : 'Store'}
                        </option>
                      ))}
                    </select>
                  </label>
                </OperationForm>

                <p className="mt-4 text-xs leading-5 text-[#82727a]">
                  Use Store for any location that
                  operates a cashier register.
                  You can create additional locations
                  as the business grows.
                </p>
              </div>
            </details>
          </WorkspacePanel>
        )}

        {locations.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {locations.map(location => (
              <li
                key={location.id}
                className={card + ' flex min-w-0 gap-3 p-4'}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f8eee2] text-[#a87d42]">
                  {location.type === 'store' ? (
                    <Building2
                      size={20}
                      aria-hidden="true"
                    />
                  ) : (
                    <Warehouse
                      size={20}
                      aria-hidden="true"
                    />
                  )}
                </span>

                <div className="grid min-w-0 flex-1 content-start gap-1">
                  <strong className="break-words text-sm text-[#43243a]">
                    {location.name}
                  </strong>

                  <span className="text-xs text-[#8b7781]">
                    {location.code}
                    {' · '}
                    {location.type}
                  </span>
                </div>

                <span
                  className={
                    'h-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
                    (location.active
                      ? 'bg-[#e8f3e9] text-[#356b43]'
                      : 'bg-[#f5e8eb] text-[#8e4656]')
                  }
                >
                  {location.active
                    ? 'Active'
                    : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* RECEIVING */}
      {mayReceiveStock && (
        <section
          id="inventory-receive"
          className="grid min-w-0 scroll-mt-24 gap-4"
        >
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a57839]">
              Stock operations
            </p>

            <h2 className={heading}>
              Receive stock
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#816d78]">
              Record incoming quantities against a
              product variant and its destination.
              Every confirmed receipt updates the
              cloud stock ledger.
            </p>
          </div>

          <WorkspacePanel
            label="inventory-receive-form-title"
            className="grid gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                id="inventory-receive-form-title"
                className="font-serif text-xl text-[#471a31]"
              >
                New stock receipt
              </h3>

              <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#34704b]">
                <ShieldCheck
                  size={16}
                  aria-hidden="true"
                />
                Transaction-safe receiving
              </span>
            </div>

            {productsResult.status === 'rejected' && (
              <WorkspaceNotice
                title="Product variants unavailable"
                tone="error"
              >
                The product list could not be loaded.
                Refresh the page before receiving stock.
              </WorkspaceNotice>
            )}

            <ReceivingForm
              key={userId}
              userId={userId}
              locations={locations}
              variants={variants}
            />
          </WorkspacePanel>
        </section>
      )}

      {/* STOCK REGISTER */}
      <section
        id="inventory-balances"
        className="grid min-w-0 scroll-mt-24 gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a57839]">
              Stock monitoring
            </p>

            <h2 className={heading}>
              Stock register
            </h2>

            <p className="mt-2 text-sm text-[#816d78]">
              Check quantities by fragrance and
              physical location.
            </p>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-[#e8dcd7] bg-white px-3 py-1.5 text-xs text-[#806d77]">
            <Barcode
              size={15}
              aria-hidden="true"
            />
            Variant-level stock
          </span>
        </div>

        {inventory && balances.some(balance => balance.balanceRecorded === undefined && stockState(balance) === 'unverified-zero') && (
          <WorkspaceNotice title="Opening quantities need verification" tone="pending">
            This inventory service reports a missing balance as zero. Confirm the physical quantity before treating an unverified row as a confirmed zero.
          </WorkspaceNotice>
        )}
        {!inventory ? (
          <WorkspaceNotice
            title="Stock register unavailable"
            tone="error"
          >
            Retry the inventory connection to
            view physical balances.
          </WorkspaceNotice>
        ) : locations.length === 0 ? (
          <WorkspaceNotice
            title="Create a location to begin"
            tone="pending"
          >
            Stock balances cannot be displayed
            until a physical location has been
            registered.

            {mayCreateLocations && (
              <p className="mt-2">
                <a
                  className="font-semibold underline"
                  href="#inventory-locations"
                >
                  Go to location setup
                </a>
              </p>
            )}
          </WorkspaceNotice>
        ) : (
          <div className={card + ' overflow-hidden'}>
            <InventoryTable
              items={balances}
              offset={offset}
              pageSize={inventory.pageSize}
              hasNext={inventory.hasNext}
            />
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8dcd7] pt-5 text-xs text-[#84737c]">
        <span>
          Golden Rose · Inventory operations
        </span>

        <span className="inline-flex items-center gap-2">
          <ShieldCheck size={15} />
          Staff role and location access enforced
          by the backend
        </span>
      </footer>
    </div>
  );
}
