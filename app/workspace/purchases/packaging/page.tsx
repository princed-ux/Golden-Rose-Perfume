
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Boxes,
  Package,
  Search,
} from 'lucide-react';

import {
  canViewModule,
} from '@/src/domain/permissions';

import {
  requireStaff,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import {
  PackageEditor,
  PackageDeactivate,
} from './package-controls';

export const metadata: Metadata = {
  title: 'Packaging & Units | Golden Rose Perfume',
};

type ProductPackage = {
  id: string;
  unitName: string;
  unitsPerPackage: number;
  active: boolean;
};

type PackagingProduct = {
  id: string;
  sku: string;
  name: string;
  sizeMl: number | null;
  packages: ProductPackage[];
};

type PackagingResponse = {
  items: PackagingProduct[];
  canManage: boolean;
};

type PageProps = {
  searchParams: Promise<{
    search?: string;
  }>;
};

export default function PackagingPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-6 text-sm text-gr-muted"
        >
          Loading product packaging…
        </p>
      }
    >
      <PackagingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PackagingContent({
  searchParams,
}: PageProps) {
  const staff = await requireStaff();

  if (!canViewModule(staff.role, 'purchases')) {
    notFound();
  }

  const params = await searchParams;
  const search = (params.search ?? '').trim().slice(0, 80);

  const client = await createClient();

  let data: PackagingResponse | null = null;
  let loadError = '';

  try {
    const response = await client.rpc(
      'gr_packaging',
      {
        p_action: 'list',
        p_payload: { search },
      },
    );

    if (response.error) {
      console.error('[Golden Rose packaging list]', {
        code: response.error.code,
      });

      loadError =
        'Packaging records could not be loaded. Check the database migration and your staff session.';
    } else if (
      !response.data ||
      !Array.isArray(response.data.items) ||
      typeof response.data.canManage !== 'boolean'
    ) {
      loadError =
        'The packaging service returned an invalid response.';
    } else {
      data = response.data as PackagingResponse;
    }
  } catch {
    loadError =
      'Unable to connect to the packaging service.';
  }

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Inventory / Product units"
        title="Packaging & Units"
        description="Define how individual products are grouped into packs, cartons, boxes and other purchasing units."
        actions={
          <Link
            href="/workspace/purchases"
            className={workspaceSecondary}
          >
            Back to Purchasing
          </Link>
        }
      />

      <WorkspaceNotice title="How quantities are calculated">
        Each existing SKU is stocked in individual units.
        Package definitions describe how many of those
        units are contained in a pack or carton. For
        example, a carton of 12 bottles represents
        12 individual bottles.
      </WorkspaceNotice>

      <WorkspacePanel className="grid gap-4">
        <form
          action="/workspace/purchases/packaging"
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="grid min-w-[240px] flex-1 gap-2 text-sm font-semibold text-gr-text">
            Find a product by SKU or name

            <input
              type="search"
              name="search"
              defaultValue={search}
              maxLength={80}
              placeholder="Enter product SKU"
              className={workspaceInput}
            />
          </label>

          <button
            type="submit"
            className={workspacePrimary}
          >
            <Search size={17} />
            Search products
          </button>
        </form>

        <p className="text-xs text-gr-muted">
          Showing up to 25 matching active catalogue SKUs.
        </p>
      </WorkspacePanel>

      {loadError && (
        <WorkspaceNotice
          title="Packaging unavailable"
          tone="error"
        >
          {loadError}
        </WorkspaceNotice>
      )}

      {data && data.items.length === 0 && (
        <WorkspaceNotice title="No matching products">
          Search using an active SKU already present
          in the Golden Rose product catalogue.
        </WorkspaceNotice>
      )}

      {data?.items.map((product) => (
        <WorkspacePanel
          key={product.id}
          className="grid gap-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold">
              <Package
                size={21}
                aria-hidden="true"
              />
            </span>

            <div className="min-w-0">
              <h2 className="font-serif text-xl text-gr-text">
                {product.name}
              </h2>

              <p className="mt-1 text-sm text-gr-muted">
                SKU: {product.sku}
              </p>

              {product.sizeMl !== null && (
                <p className="mt-1 text-xs text-gr-muted">
                  Product volume: {product.sizeMl} mL
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gr-text">
              <Boxes size={18} />
              Configured packaging
            </h3>

            {product.packages.length === 0 ? (
              <p className="rounded-xl bg-gr-surface p-4 text-sm text-gr-muted">
                No packs or cartons configured yet.
              </p>
            ) : (
              product.packages.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gr-border bg-gr-surface p-4"
                >
                  <div>
                    <p className="font-semibold capitalize text-gr-text">
                      {item.unitName}
                    </p>

                    <p className="text-sm text-gr-muted">
                      1 {item.unitName} ={' '}
                      {item.unitsPerPackage.toLocaleString(
                        'en-NG',
                      )}{' '}
                      individual units
                    </p>

                    <p className="mt-1 text-xs text-gr-muted">
                      {item.active
                        ? 'Active'
                        : 'Inactive'}
                    </p>
                  </div>

                  {data.canManage && item.active && (
                    <PackageDeactivate id={item.id} />
                  )}
                </div>
              ))
            )}
          </div>

          {data.canManage ? (
            <PackageEditor variantId={product.id} />
          ) : (
            <p className="text-sm text-gr-muted">
              Your role can view packaging but
              cannot modify conversions.
            </p>
          )}
        </WorkspacePanel>
      ))}
    </div>
  );
}
