
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Boxes,
  ClipboardList,
  PackageCheck,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

import {
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import {
  PackageOrderForm,
  PackageApprovalForm,
  PackageReceiptForm,
  type ProductOption,
} from './forms';

export const metadata: Metadata = {
  title: 'Pack & Carton Purchasing | Golden Rose Perfume',
};

type Supplier = {
  id: string;
  name: string;
  active: boolean;
};

type Location = {
  id: string;
  name: string;
};

type PurchaseLine = {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  receivedQuantity: number;
  unitCostMinor: number;
  enteredUnit: string;
  enteredQuantity: number;
  unitsPerEntry: number;
  packageAware: boolean;
};

type PurchaseOrder = {
  id: string;
  supplierName: string;
  locationName: string;
  status: string;
  totalMinor: number;
  createdAt: string;
  lines: PurchaseLine[];
};

type PurchaseData = {
  suppliers: Supplier[];
  locations: Location[];
  purchases: PurchaseOrder[];
};

type PackagingData = {
  items: ProductOption[];
  canManage: boolean;
};

type PageProps = {
  searchParams: Promise<{
    search?: string;
  }>;
};

export default function PackagedOrdersPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-5 text-sm text-[#806d78]">
          Loading purchasing records…
        </p>
      }
    >
      <PackagedOrdersContent
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function PackagedOrdersContent({
  searchParams,
}: PageProps) {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'purchases')) {
    notFound();
  }

  const params = await searchParams;
  const search = (params.search ?? '')
    .trim()
    .slice(0, 80);

  const client = await createClient();

  const [ordersResponse, productsResponse] =
    await Promise.all([
      client.rpc('gr_packaged_purchases', {
        p_action: 'list',
        p_payload: {},
      }),
      client.rpc('gr_packaging', {
        p_action: 'list',
        p_payload: { search },
      }),
    ]);

  let orders: PurchaseData | null = null;
  let catalogue: PackagingData | null = null;

  if (
    !ordersResponse.error &&
    ordersResponse.data &&
    Array.isArray(ordersResponse.data.suppliers) &&
    Array.isArray(ordersResponse.data.locations) &&
    Array.isArray(ordersResponse.data.purchases)
  ) {
    orders = ordersResponse.data as PurchaseData;
  } else {
    console.error(
      '[Golden Rose purchasing list]',
      ordersResponse.error?.code ?? 'invalid_response',
    );
  }

  if (
    !productsResponse.error &&
    productsResponse.data &&
    Array.isArray(productsResponse.data.items)
  ) {
    catalogue =
      productsResponse.data as PackagingData;
  } else {
    console.error(
      '[Golden Rose purchasing catalogue]',
      productsResponse.error?.code ?? 'invalid_response',
    );
  }

  const canApprove =
    role === 'owner' || role === 'manager';

  const canCreate =
    role === 'owner' ||
    role === 'manager' ||
    role === 'inventory_staff';

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Procurement / Units and deliveries"
        title="Pack & Carton Purchasing"
        description="Order products by bottle, piece, pack or carton. The database records actual individual stock quantities and the original purchase-unit conversion."
        actions={
          <Link
            href="/workspace/purchases/packaging"
            className={workspaceSecondary}
          >
            Manage packaging
          </Link>
        }
      />

      <WorkspaceNotice title="Understanding purchasing units">
        A carton of 24 bottles is recorded as 24 individual
        stock units. Ordering 2 cartons therefore means
        48 bottles. Stock increases only after an approved
        order is received.
      </WorkspaceNotice>

      <WorkspacePanel className="grid gap-4">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
          <Boxes size={21} />
          Find catalogue products
        </h2>

        <form
          action="/workspace/purchases/package-orders"
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="grid min-w-60 flex-1 gap-2 text-sm font-semibold text-[#54213a]">
            Search by SKU or product name

            <input
              type="search"
              name="search"
              maxLength={80}
              defaultValue={search}
              placeholder="GRQA-00803"
              className={workspaceInput}
            />
          </label>

          <button
            type="submit"
            className={workspacePrimary}
          >
            Find products
          </button>
        </form>

        <p className="text-xs text-[#806d78]">
          Search the catalogue before filling the purchase
          form to see the product's configured packaging.
          Up to 25 matching SKUs are listed at once.
        </p>

        {catalogue && search && (
          <p className="text-sm text-[#665060]">
            Found {catalogue.items.length} displayed matching
            product SKUs.
          </p>
        )}
      </WorkspacePanel>

      {!orders || !catalogue ? (
        <WorkspaceNotice
          title="Purchasing data unavailable"
          tone="error"
        >
          The current request could not load all required
          records. Confirm your staff session and database
          connection, then refresh.
        </WorkspaceNotice>
      ) : (
        <>
          {canCreate && (
            <WorkspacePanel className="grid gap-5">
              <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
                <ClipboardList size={21} />
                Create package-aware purchase order
              </h2>

              {orders.suppliers.filter(
                (supplier) => supplier.active,
              ).length === 0 ||
              orders.locations.length === 0 ? (
                <WorkspaceNotice title="Supplier or location required">
                  Create an active supplier and select
                  an authorized business location before
                  preparing an order.
                </WorkspaceNotice>
              ) : (
                <PackageOrderForm
                  suppliers={orders.suppliers}
                  locations={orders.locations}
                  products={catalogue.items}
                  requestKey={randomUUID()}
                />
              )}
            </WorkspacePanel>
          )}

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <PackageCheck size={21} />
              Purchase register ({orders.purchases.length})
            </h2>

            {orders.purchases.length === 0 && (
              <WorkspaceNotice title="No purchase orders yet">
                Create a draft purchase order to begin.
              </WorkspaceNotice>
            )}

            {orders.purchases.map((purchase) => (
              <article
                key={purchase.id}
                className="grid gap-4 rounded-xl border border-[#e8dcd3] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#512238]">
                      {purchase.supplierName}
                    </h3>

                    <p className="text-sm text-[#806d78]">
                      {purchase.locationName}
                      {' · '}
                      {purchase.status.replaceAll('_', ' ')}
                    </p>

                    <p className="mt-1 text-sm text-[#806d78]">
                      {new Date(
                        purchase.createdAt,
                      ).toLocaleDateString('en-NG')}
                    </p>
                  </div>

                  <p className="font-serif text-xl text-[#54213a]">
                    {formatPrice(purchase.totalMinor)}
                  </p>
                </div>

                {purchase.status === 'draft' &&
                  canApprove && (
                    <PackageApprovalForm
                      purchaseId={purchase.id}
                    />
                  )}

                <div className="grid gap-3">
                  {purchase.lines.map((line) => {
                    const remainingUnits =
                      line.quantity -
                      line.receivedQuantity;

                    const factor = Math.max(
                      1,
                      line.unitsPerEntry || 1,
                    );

                    const remainingPackages =
                      Math.floor(
                        remainingUnits / factor,
                      );

                    const canReceive =
                      (
                        purchase.status === 'approved' ||
                        purchase.status ===
                          'partially_received'
                      ) &&
                      line.packageAware &&
                      remainingPackages > 0;

                    return (
                      <div
                        key={line.id}
                        className="rounded-xl border border-[#efe3db] bg-[#fffaf5] p-4"
                      >
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#54213a]">
                              {line.productName}
                            </p>

                            <p className="text-xs text-[#806d78]">
                              SKU: {line.sku}
                            </p>

                            <p className="mt-2 text-sm text-[#725968]">
                              Ordered: {line.quantity}
                              {' individual units'}
                              {' · '}
                              Received: {line.receivedQuantity}
                            </p>

                            {line.packageAware && (
                              <p className="text-sm text-[#725968]">
                                Originally ordered as{' '}
                                {line.enteredQuantity}{' '}
                                {line.enteredUnit}
                                {' · '}
                                {factor} units per{' '}
                                {line.enteredUnit}
                              </p>
                            )}
                          </div>

                          <div className="text-right text-sm text-[#725968]">
                            Unit cost:{' '}
                            {formatPrice(
                              line.unitCostMinor,
                            )}

                            <p>
                              Line total:{' '}
                              {formatPrice(
                                line.quantity *
                                  line.unitCostMinor,
                              )}
                            </p>
                          </div>
                        </div>

                        {canReceive && (
                          <PackageReceiptForm
                            lineId={line.id}
                            unitName={line.enteredUnit}
                            remaining={remainingPackages}
                            requestKey={randomUUID()}
                          />
                        )}

                        {!line.packageAware && (
                          <p className="mt-3 text-xs text-[#806d78]">
                            This order was created using
                            the original individual-unit
                            purchasing workflow. Receive it
                            through the standard{' '}
                            <Link
                              href="/workspace/purchases"
                              className="font-semibold underline"
                            >
                              Purchasing page
                            </Link>
                            .
                          </p>
                        )}

                        {line.packageAware &&
                          remainingUnits > 0 &&
                          remainingPackages === 0 &&
                          (
                            purchase.status === 'approved' ||
                            purchase.status ===
                              'partially_received'
                          ) && (
                            <p className="mt-3 text-xs text-[#806d78]">
                              The remaining stock quantity is
                              smaller than one complete
                              configured package. Use the
                              original Purchasing page to
                              receive the remaining individual
                              units.
                            </p>
                          )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </WorkspacePanel>
        </>
      )}
    </div>
  );
}
