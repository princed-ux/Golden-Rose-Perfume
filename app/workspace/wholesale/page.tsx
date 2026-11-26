import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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
  loadWholesaleCatalogue,
  loadWholesaleOrders,
} from './actions';

import {
  WholesaleWorkspace,
} from './wholesale-workspace';

export const metadata: Metadata = {
  title: 'Wholesale Sales | Golden Rose Perfume',
  description:
    'Manage bulk fragrance sales, business customers, negotiated prices, payments and dispatch.',
};

/* =========================================================
   GOLDEN ROSE PERFUME
   WHOLESALE SALES WORKSPACE
   ========================================================= */

export default function WholesalePage() {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-6 text-sm text-[#796570]"
        >
          Loading wholesale sales…
        </p>
      }
    >
      <AuthorizedWholesale />
    </Suspense>
  );
}

/* =========================================================
   AUTHENTICATED WHOLESALE WORKSPACE
   ========================================================= */

async function AuthorizedWholesale() {
  const staff = await requireStaff();

  const access = await loadMyPermissions();

  if (!access.ok) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Wholesale service unavailable"
      >
        {access.message}
      </WorkspaceNotice>
    );
  }

  if (
    access.data.userId !== staff.userId ||
    access.data.role !== staff.role ||
    !access.data.wholesaleAllowed
  ) {
    notFound();
  }

  const locations =
    await loadWholesaleLocations();

  if (!locations.ok) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Selling locations unavailable"
      >
        {locations.message}
      </WorkspaceNotice>
    );
  }

  if (!locations.data.canSell) {
    notFound();
  }

  const initialLocation =
    locations.data.items.length === 1
      ? locations.data.items[0].id
      : '';

  const [catalogue, history] =
    await Promise.all([
      initialLocation
        ? loadWholesaleCatalogue(
            initialLocation,
          )
        : Promise.resolve(null),

      loadWholesaleOrders(),
    ]);

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Sales / Business customers"
        title="Wholesale & Distribution"
        description="Sell individual fragrances, packs or cartons to supermarkets, boutiques and other business customers. Record payments, outstanding balances and stock dispatch in one place."
        actions={
          <>
            {locations.data.canDispatch && (
              <Link
                href="/workspace/dispatch"
                className={workspaceSecondary}
              >
                Pending dispatches
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

      {locations.data.items.length === 0 ? (
        <WorkspaceNotice
          tone="pending"
          title="Selling location required"
        >
          An active, authorized store is required
          before recording wholesale sales.
        </WorkspaceNotice>
      ) : (
        <WholesaleWorkspace
          key={staff.userId}
          staffId={staff.userId}
          mode="sales"
          locations={locations.data.items}
          initialLocation={initialLocation}
          canDispatch={locations.data.canDispatch}
          initialCatalogue={
            catalogue?.ok
              ? catalogue.data.items
              : []
          }
          initialHasMore={
            catalogue?.ok
              ? catalogue.data.hasMore
              : false
          }
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
            catalogue && !catalogue.ok
              ? catalogue.message
              : !history.ok
                ? history.message
                : ''
          }
        />
      )}
    </div>
  );
}