import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import {
  Truck,
} from 'lucide-react';

import {
  WorkspacePageHeader,
  WorkspaceNotice,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import {
  requireStaff,
} from '@/src/lib/golden-rose/staff';

import {
  loadMyPermissions,
} from '../permissions/actions';

import {
  loadWholesaleLocations,
  loadWholesaleOrders,
} from '../wholesale/actions';

import {
  WholesaleWorkspace,
} from '../wholesale/wholesale-workspace';

export const metadata: Metadata = {
  title: 'Dispatch Management | Golden Rose Perfume',
  description:
    'Review wholesale goods awaiting dispatch and record confirmed stock handovers.',
};

/* =========================================================
   GOLDEN ROSE PERFUME
   DISPATCH MANAGEMENT
   ========================================================= */

export default function DispatchPage() {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-6 text-sm text-gr-muted"
        >
          Loading dispatch records…
        </p>
      }
    >
      <AuthorizedDispatch />
    </Suspense>
  );
}

/* =========================================================
   AUTHORIZED DISPATCH ACCESS
   ========================================================= */

async function AuthorizedDispatch() {
  const staff =
    await requireStaff();

  const access =
    await loadMyPermissions();

  if (!access.ok) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Dispatch access unavailable"
      >
        {access.message}
      </WorkspaceNotice>
    );
  }

  if (
    access.data.userId !== staff.userId ||
    access.data.role !== staff.role ||
    !access.data.dispatchAllowed
  ) {
    notFound();
  }

  const [
    locations,
    history,
  ] = await Promise.all([
    loadWholesaleLocations(),

    loadWholesaleOrders(),
  ]);

  if (!locations.ok) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Dispatch service unavailable"
      >
        {locations.message}
      </WorkspaceNotice>
    );
  }

  if (!locations.data.canDispatch) {
    notFound();
  }

  const stores =
    locations.data.items;

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Distribution / Goods handover"
        title="Dispatch Management"
        description="Find wholesale orders, review their products and delivery details, and confirm when goods have physically left the store."
        actions={
          <>
            {locations.data.canSell && (
              <Link
                href="/workspace/wholesale"
                className={workspaceSecondary}
              >
                New wholesale sale
              </Link>
            )}

            <Link
              href="/workspace"
              className={workspaceSecondary}
            >
              Workspace
            </Link>
          </>
        }
      />

      <WorkspaceNotice title="Stock and dispatch">
        <div className="flex items-start gap-3">
          <Truck
            size={22}
            className="mt-0.5 shrink-0"
          />

          <div className="grid gap-2">
            <p>
              Only confirm dispatch when the goods
              have physically been handed over,
              collected or sent out for delivery.
            </p>

            <p>
              The database verifies available stock
              and prevents the same order from being
              dispatched twice.
            </p>

            <p>
              Dispatch does not change the payment
              status or record additional money.
            </p>
          </div>
        </div>
      </WorkspaceNotice>

      <section
        aria-label="Authorized dispatch locations"
        className="rounded-2xl border border-gr-border bg-gr-surface p-4"
      >
        <h2 className="font-semibold text-gr-text">
          Authorized locations
        </h2>

        {stores.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stores.map(store => (
              <span
                key={store.id}
                className="rounded-lg border border-gr-border bg-gr-surface px-3 py-2 text-sm text-gr-muted"
              >
                {store.name}
                {' · '}
                {store.code}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gr-muted">
            No active dispatch locations
            are assigned to this account.
          </p>
        )}
      </section>

      <WholesaleWorkspace
        key={`${staff.userId}:dispatch`}
        staffId={staff.userId}
        mode="dispatch"
        locations={stores}
        initialLocation=""
        canDispatch={true}
        initialCatalogue={[]}
        initialHasMore={false}
        initialOrders={
          history.ok
            ? history.data.items
            : []
        }
        initialOrdersHasMore={
          history.ok
            ? history.data.hasMore
            : false
        }
        initialError={
          history.ok
            ? ''
            : history.message
        }
      />
    </div>
  );
}