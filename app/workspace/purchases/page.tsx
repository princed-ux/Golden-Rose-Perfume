import { ActionForm, ActionButton } from '@/src/components/action-feedback';
import { Suspense } from 'react';

import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import {
  ClipboardList,
  PackageCheck,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';

import {
  formatPrice,
} from '@/src/lib/golden-rose/contracts';

import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadOperations } from '@/src/lib/golden-rose/operations';

import {
  WorkspacePageHeader,
} from '@/src/components/workspace/page-layout';

import {
  approvePurchase,
  createPurchase,
  receivePurchaseLine,
} from '../operations/actions';

import {
  ActionMessage,
  Field,
  WorkspaceNotice,
  WorkspacePanel,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '../operations/ui';

export const metadata = {
  title: 'Purchasing | Golden Rose Perfume',
};

export default function Page({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  return <Suspense fallback={<p role="status" className="p-6">Loading purchases…</p>}><OperationsContent searchParams={searchParams} /></Suspense>;
}

async function OperationsContent({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'purchases')) {
    notFound();
  }

  const data = await loadOperations().catch(() => null);
  const { result } = await searchParams;

  const canApprove =
    role === 'owner' || role === 'manager';

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Procurement / Supply chain"
        title="Purchase orders"
        description="Raise real multi-product orders, approve them and receive inventory atomically against ordered quantities."
      />

      <ActionMessage result={result} />

      {!data ? (
        <WorkspaceNotice
          title="Purchasing unavailable"
          tone="error"
        >
          The operations service is unavailable. Retry the page or check staff permissions.
        </WorkspaceNotice>
      ) : (
        <>
          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <ClipboardList size={20} />
              New purchase order
            </h2>

            {!data.suppliers.some(
              (supplier) => supplier.active,
            ) || !data.locations.length ? (
              <WorkspaceNotice title="Supplier and location required">
                You need an active supplier and a permitted
                active location.{' '}
                <Link
                  className="underline"
                  href="/workspace/suppliers"
                >
                  Open Suppliers
                </Link>
                .
              </WorkspaceNotice>
            ) : (
              <ActionForm
                action={createPurchase}
                className="grid gap-4"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Supplier">
                    <select
                      name="supplierId"
                      required
                      className={workspaceInput}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose supplier
                      </option>

                      {data.suppliers
                        .filter((supplier) => supplier.active)
                        .map((supplier) => (
                          <option
                            key={supplier.id}
                            value={supplier.id}
                          >
                            {supplier.name}
                          </option>
                        ))}
                    </select>
                  </Field>

                  <Field label="Receiving location">
                    <select
                      name="locationId"
                      required
                      className={workspaceInput}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose location
                      </option>

                      {data.locations.map((location) => (
                        <option
                          key={location.id}
                          value={location.id}
                        >
                          {location.name} ({location.type})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Expected delivery date (optional)">
                    <input
                      name="expectedDate"
                      type="date"
                      className={workspaceInput}
                    />
                  </Field>

                  <Field label="Order notes">
                    <input
                      name="note"
                      maxLength={500}
                      className={workspaceInput}
                    />
                  </Field>
                </div>

                <Field label="Product lines — one per line: SKU | quantity | unit cost in ₦">
                  <textarea
                    name="lines"
                    required
                    rows={5}
                    className={workspaceInput}
                    placeholder={
                      'Actual-SKU | 5 | 12500.00\n' +
                      'Another-SKU | 3 | 9200.00'
                    }
                  />
                </Field>

                <p className="text-xs text-[#816e79]">
                  Up to 40 distinct catalogue SKUs. The
                  submitted purchase cost is recorded
                  permanently as the purchase-order line cost.
                  Creating an order does not add inventory.
                </p>

                <div>
                  <ActionButton
                    className={workspacePrimary}
                    type="submit"
                  >
                    Create draft purchase order
                  </ActionButton>
                </div>
              </ActionForm>
            )}
          </WorkspacePanel>

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <PackageCheck size={20} />
              Purchase orders ({data.purchases.length})
            </h2>

            {!data.purchases.length && (
              <WorkspaceNotice title="No purchase orders yet">
                Create the first order using an actual supplier
                and catalogue SKU.
              </WorkspaceNotice>
            )}

            {data.purchases.map((purchase) => (
              <article
                key={purchase.id}
                className="rounded-xl border border-[#eaddd5] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#512238]">
                      {purchase.supplierName}
                      {' · '}
                      {purchase.locationName}
                    </h3>

                    <p className="mt-1 text-sm text-[#806d78]">
                      {formatPrice(purchase.totalMinor)}
                      {' · '}
                      {purchase.status.replaceAll('_', ' ')}
                      {' · '}
                      {new Date(
                        purchase.createdAt,
                      ).toLocaleDateString('en-NG')}
                    </p>

                    {purchase.expectedDate && (
                      <p className="text-xs text-[#806d78]">
                        Expected: {purchase.expectedDate}
                      </p>
                    )}

                    {purchase.note && (
                      <p className="mt-1 text-xs text-[#806d78]">
                        {purchase.note}
                      </p>
                    )}
                  </div>

                  {purchase.status === 'draft' &&
                    canApprove && (
                      <ActionForm action={approvePurchase}>
                        <input
                          type="hidden"
                          name="id"
                          value={purchase.id}
                        />

                        <ActionButton
                          className={workspacePrimary}
                          type="submit"
                        >
                          Approve order
                        </ActionButton>
                      </ActionForm>
                    )}
                </div>

                <div className="mt-4 grid gap-3">
                  {purchase.lines.map((line) => {
                    const remaining =
                      line.quantity - line.receivedQuantity;

                    return (
                      <div
                        key={line.id}
                        className="rounded-lg bg-[#fbf6f1] p-3"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <strong className="text-[#512238]">
                            {line.productName}
                            {' · '}
                            {line.sku}
                          </strong>

                          <span className="text-[#705563]">
                            {line.receivedQuantity}/
                            {line.quantity} received
                            {' · '}
                            {formatPrice(line.unitCostMinor)}
                            {' each'}
                          </span>
                        </div>

                        {(
                          purchase.status === 'approved' ||
                          purchase.status ===
                            'partially_received'
                        ) &&
                          remaining > 0 && (
                            <ActionForm
                              action={receivePurchaseLine}
                              className="mt-3 flex flex-wrap items-end gap-2"
                            >
                              <input
                                type="hidden"
                                name="lineId"
                                value={line.id}
                              />

                              <input
                                type="hidden"
                                name="requestKey"
                                value={randomUUID()}
                              />

                              <label className="grid gap-1 text-xs font-semibold text-[#6d4d5e]">
                                Quantity to receive

                                <input
                                  name="quantity"
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  defaultValue={remaining}
                                  className={
                                    workspaceInput + ' w-36'
                                  }
                                  required
                                />
                              </label>

                              <ActionButton
                                className={workspaceSecondary}
                                type="submit"
                              >
                                Confirm stock received
                              </ActionButton>
                            </ActionForm>
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
