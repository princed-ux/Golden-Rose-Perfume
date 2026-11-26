import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { WorkspaceNotice, WorkspacePageHeader } from '@/src/components/workspace/page-layout';
import { notFound } from 'next/navigation';
import {
  Barcode,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleDashed,
  Filter,
  Layers3,
  Package2,
  Plus,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { adminProductPages } from '@/src/lib/golden-rose/edge';
import { canManageStockSetup, formatPrice, UUID, type AdminProduct } from '@/src/lib/golden-rose/contracts';
import { catalogueFilters, matchesCatalogue, type CataloguePublication, type ManagedProduct } from '@/src/lib/golden-rose/catalogue-management';
import { readCataloguePage, readProductDetails } from './data';
import { ExportCatalogue } from './export-catalogue';
import { AddProductForm, ProductEditor, PublicationForm } from './product-editor';
import './products.css';
import './catalogue-layout.css';

export const metadata: Metadata = {
  title: 'Products & Catalogue | Golden Rose',
};

const PAGE_SIZE = 24;

type PublicationFilter = CataloguePublication;

type ProductVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  size_ml: number | null;
  price_minor: number;
  currency: string;
  active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  is_published: boolean;
  active: boolean;
  revision?: string;
  created_at: string | null;
  brand: { name: string | null } | null;
  category: { name: string | null } | null;
  variants: ProductVariant[] | null;
};

type CatalogueOverview = {
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  barcodedVariants: number;
};

type CataloguePayload = {
  items: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: {
    q: string;
    publication: PublicationFilter;
  };
  overview: CatalogueOverview;
};

function parsePage(value?: string): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 999_999 ? page : 1;
}

function productRow(product: AdminProduct | ManagedProduct): ProductRow {
  return {
    id: product.productId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    is_published: product.published,
    active: product.active,
    revision: 'revision' in product ? product.revision : undefined,
    created_at: product.createdAt ?? null,
    brand: product.brand ? { name: product.brand } : null,
    category: product.category ? { name: product.category } : null,
    variants: product.variants.map(variant => ({
      id: variant.variantId, sku: variant.sku, barcode: variant.barcode, size_ml: variant.sizeMl,
      price_minor: variant.priceMinor, currency: variant.currency, active: variant.active,
    })),
  };
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function buildHref(q: string, publication: PublicationFilter, page: number) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (publication !== 'all') params.set('publication', publication);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/workspace/products?${query}` : '/workspace/products';
}


async function loadCatalogue(token: string, search: string, publication: PublicationFilter, page: number): Promise<CataloguePayload> {
  const filters = catalogueFilters(search, publication);
  const from = (page - 1) * PAGE_SIZE;
  const items: ProductRow[] = [];
  const overview = { totalProducts: 0, publishedProducts: 0, draftProducts: 0, barcodedVariants: 0 };
  let total = 0;

  for await (const products of adminProductPages(token)) {
    for (const product of products) {
      overview.totalProducts++;
      if (product.published) overview.publishedProducts++;
      else overview.draftProducts++;
      overview.barcodedVariants += product.variants.filter(variant => variant.barcode).length;

      if (!matchesCatalogue(product, filters)) continue;

      const position = total++;
      if (position < from || items.length >= PAGE_SIZE) continue;
      items.push(productRow(product));
    }
  }

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters, overview };
}

function productLead(product: ProductRow) {
  const variants = product.variants ?? [];
  if (!variants.length) {
    return {
      variantCount: 0,
      lowestPrice: null as number | null,
      barcodeCount: 0,
    };
  }

  const priced = variants.filter(variant => variant.active && variant.currency === 'NGN');
  const lowestPrice = priced.length ? Math.min(...priced.map(variant => variant.price_minor)) : null;
  let barcodeCount = 0;

  for (const variant of variants) {
    if (variant.barcode) barcodeCount += 1;
  }

  return {
    variantCount: variants.length,
    lowestPrice,
    barcodeCount,
  };
}

function ProductToolbar({
  currentQ,
  currentPublication,
}: {
  currentQ: string;
  currentPublication: PublicationFilter;
}) {
  return (
    <section className="catalogue-toolbar">
      <form className="catalogue-search" method="get">
        <label className="catalogue-search__field" htmlFor="catalogue-search-input">
          <Search size={18} aria-hidden="true" />
          <input
            id="catalogue-search-input"
            name="q"
            type="search"
            defaultValue={currentQ}
            placeholder="Search fragrance, SKU or barcode"
          />
        </label>

        <label className="catalogue-select">
          <Filter size={16} aria-hidden="true" />
          <select name="publication" defaultValue={currentPublication}>
            <option value="all">All publication states</option>
            <option value="published">Published only</option>
            <option value="draft">Draft only</option>
          </select>
        </label>

        <button className="catalogue-btn catalogue-btn--primary" type="submit">
          Apply filters
        </button>

        {(currentQ || currentPublication !== 'all') && (
          <Link className="catalogue-btn catalogue-btn--ghost" href="/workspace/products">
            Clear
          </Link>
        )}
      </form>

      <div className="catalogue-toolbar__chips">
        <Link
          href={buildHref(currentQ, 'all', 1)}
          className={`catalogue-chip ${currentPublication === 'all' ? 'is-active' : ''}`}
        >
          All
        </Link>
        <Link
          href={buildHref(currentQ, 'draft', 1)}
          className={`catalogue-chip ${currentPublication === 'draft' ? 'is-active' : ''}`}
        >
          Draft
        </Link>
        <Link
          href={buildHref(currentQ, 'published', 1)}
          className={`catalogue-chip ${currentPublication === 'published' ? 'is-active' : ''}`}
        >
          Published
        </Link>
      </div>
    </section>
  );
}

function Pagination({
  page,
  pageCount,
  q,
  publication,
}: {
  page: number;
  pageCount: number;
  q: string;
  publication: PublicationFilter;
}) {
  if (pageCount <= 1) return null;

  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(pageCount, page + 1);

  return (
    <nav className="catalogue-pagination" aria-label="Catalogue pagination">
      <Link
        className={`catalogue-btn catalogue-btn--ghost ${page <= 1 ? 'is-disabled' : ''}`}
        href={page <= 1 ? '#' : buildHref(q, publication, previousPage)}
        aria-disabled={page <= 1}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </Link>

      <p className="catalogue-pagination__meta">
        Page <strong>{page}</strong> of <strong>{pageCount}</strong>
      </p>

      <Link
        className={`catalogue-btn catalogue-btn--ghost ${page >= pageCount ? 'is-disabled' : ''}`}
        href={page >= pageCount ? '#' : buildHref(q, publication, nextPage)}
        aria-disabled={page >= pageCount}
      >
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </nav>
  );
}

type CatalogueParams = Promise<{ q?: string; publication?: string; page?: string; add?: string; manage?: string }>;

export default function ProductsCataloguePage({ searchParams }: { searchParams: CatalogueParams }) {
  return <Suspense fallback={<p className="p-5 text-sm text-gr-muted" role="status">Loading catalogue…</p>}>
    <CatalogueWorkspace searchParams={searchParams} />
  </Suspense>;
}

async function CatalogueWorkspace({ searchParams }: { searchParams: CatalogueParams }) {
  const { role, token } = await requireStaff();
  if (!canViewModule(role, 'products')) notFound();

  const resolved = await searchParams;
  const { q, publication } = catalogueFilters(typeof resolved.q === 'string' ? resolved.q : '',
    typeof resolved.publication === 'string' ? resolved.publication : undefined);
  const page = parsePage(typeof resolved.page === 'string' ? resolved.page : undefined);
  const editable = canManageStockSetup(role);
  const adding = editable && resolved.add === '1';
  const productId = editable && typeof resolved.manage === 'string' && UUID.test(resolved.manage) ? resolved.manage : null;
  let enhanced = false;
  let payload: CataloguePayload | undefined;
  let loadError: string | undefined;
  let detail: Awaited<ReturnType<typeof readProductDetails>> | null = null;
  try {
    const [result, selected] = await Promise.all([
      readCataloguePage(q, publication, page),
      productId ? readProductDetails(productId) : null,
    ]);
    detail = selected;
    enhanced = !!result.data;
    if (result.data) {
      payload = { ...result.data, items: result.data.items.map(productRow), filters: { q, publication } };
    } else if (result.unavailable) {
      payload = await loadCatalogue(token,q,publication,page);
    } else {
      loadError = result.error;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to open the product catalogue.';
  }

  const header = (
    <WorkspacePageHeader title="Products & Catalogue" description="Manage fragrance listings, variants, and storefront publication."
      actions={<>
        {editable && !adding && <Link href="/workspace/products?add=1" className="catalogue-btn catalogue-btn--primary">
          <Plus size={16} aria-hidden="true" /> Add product
        </Link>}
        <ExportCatalogue q={q} publication={publication} />
      </>} />
  );
  const editor = adding ? <AddProductForm extended={enhanced} /> :
    detail?.data ? <ProductEditor key={detail.data.productId} initial={detail.data} /> :
    detail?.error ? <WorkspaceNotice title="Product details unavailable" tone={detail.unavailable ? 'pending' : 'error'}>
      {detail.error}
    </WorkspaceNotice> : null;

  if (!payload) {
    return (
      <section className="catalogue-shell">
        {header}
        {editor}
        <WorkspaceNotice title="Catalogue unavailable" tone="error">
          {loadError ?? 'Something went wrong while loading products.'}
        </WorkspaceNotice>
      </section>
    );
  }

  const loadedVariantCount = payload.items.reduce((sum, product) => sum + (product.variants?.length ?? 0), 0);

  return (
    <section className="catalogue-shell">
      {header}
      {editor}
      <div className="catalogue-hero__cards" aria-label="Catalogue summary">
          <article className="catalogue-stat">
            <span className="catalogue-stat__icon">
              <Package2 size={18} aria-hidden="true" />
            </span>
            <div>
              <p>Total products</p>
              <strong>{compactNumber(payload.overview.totalProducts)}</strong>
            </div>
          </article>

          <article className="catalogue-stat">
            <span className="catalogue-stat__icon">
              <CircleCheckBig size={18} aria-hidden="true" />
            </span>
            <div>
              <p>Published</p>
              <strong>{compactNumber(payload.overview.publishedProducts)}</strong>
            </div>
          </article>

          <article className="catalogue-stat">
            <span className="catalogue-stat__icon">
              <CircleDashed size={18} aria-hidden="true" />
            </span>
            <div>
              <p>Draft</p>
              <strong>{compactNumber(payload.overview.draftProducts)}</strong>
            </div>
          </article>

          <article className="catalogue-stat">
            <span className="catalogue-stat__icon">
              <Barcode size={18} aria-hidden="true" />
            </span>
            <div>
              <p>Barcoded variants</p>
              <strong>{compactNumber(payload.overview.barcodedVariants)}</strong>
            </div>
          </article>
      </div>

      <section className="catalogue-banner">
        <div className="catalogue-banner__left">
          <span className="catalogue-banner__badge">
            <Sparkles size={16} aria-hidden="true" />
            Live catalogue
          </span>
          <h2>Your imported products are ready for review.</h2>
          <p>
            {payload.total} product{payload.total === 1 ? '' : 's'} matched the current filter. This page shows{' '}
            {loadedVariantCount} loaded variant{loadedVariantCount === 1 ? '' : 's'} across the current result set.
          </p>
        </div>

        <div className="catalogue-banner__right">
          <div>
            <span>Current page</span>
            <strong>{payload.page}</strong>
          </div>
          <div>
            <span>Result pages</span>
            <strong>{payload.pageCount}</strong>
          </div>
        </div>
      </section>

      <ProductToolbar currentQ={payload.filters.q} currentPublication={payload.filters.publication} />

      {!payload.items.length ? (
        <section className="catalogue-empty">
          <div className="catalogue-empty__icon">
            <Box size={24} aria-hidden="true" />
          </div>
          <h3>No products matched this view</h3>
          <p>Try adjusting the search or filter. Your imported products remain safe in the database.</p>
          <Link className="catalogue-btn catalogue-btn--primary" href="/workspace/products">
            Reset catalogue view
          </Link>
        </section>
      ) : (
        <div className="catalogue-grid">
          {payload.items.map((product) => {
            const lead = productLead(product);
            const variants = product.variants ?? [];

            return (
              <article key={product.id} className="catalogue-card">
                <div className="catalogue-card__top">
                  <div className="catalogue-card__identity">
                    <div className="catalogue-card__label">
                      <span className="catalogue-card__label-icon">
                        <Tag size={15} aria-hidden="true" />
                      </span>
                      <span>Fragrance</span>
                    </div>

                    <h3>{product.name}</h3>

                    <div className="catalogue-card__meta">
                      <span>{product.brand?.name ?? 'Unbranded'}</span>
                      <span className="catalogue-dot" aria-hidden="true" />
                      <span>{product.category?.name ?? 'Uncategorized'}</span>
                    </div>

                    {product.description ? <p className="catalogue-card__description">{product.description}</p> : null}
                  </div>

                  <div className="catalogue-card__status">
                    <span className={`catalogue-pill ${product.is_published ? 'is-published' : 'is-draft'}`}>
                      {product.is_published ? 'Published' : 'Draft'}
                    </span>

                    <div className="catalogue-card__quickstats">
                      <div>
                        <span>Variants</span>
                        <strong>{lead.variantCount}</strong>
                      </div>
                      <div>
                        <span>Barcode</span>
                        <strong>{lead.barcodeCount}</strong>
                      </div>
                      <div>
                        <span>From</span>
                        <strong>{lead.lowestPrice !== null ? formatPrice(lead.lowestPrice) : '—'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="catalogue-card__body">
                  <div className="catalogue-card__section-head">
                    <h4>Variants</h4>
                    <span>{lead.variantCount} option{lead.variantCount === 1 ? '' : 's'}</span>
                  </div>

                  <div className="catalogue-variants">
                    {variants.length ? (
                      variants.slice(0, 4).map((variant) => (
                        <div key={variant.id} className="catalogue-variant">
                          <div className="catalogue-variant__line">
                            <strong>{variant.sku ?? 'No SKU'}</strong>
                            <span>{formatPrice(variant.price_minor, variant.currency || 'NGN')}</span>
                          </div>

                          <div className="catalogue-variant__meta">
                            <span>{variant.size_ml ? `${variant.size_ml} ml` : 'Size not set'}</span>
                            <span className="catalogue-dot" aria-hidden="true" />
                            <span>{variant.barcode ?? 'No barcode'}</span>
                            {!variant.active && <span>Inactive</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="catalogue-variant catalogue-variant--empty">
                        No variants yet for this product.
                      </div>
                    )}

                    {variants.length > 4 && (
                      <div className="catalogue-variant catalogue-variant--more">
                        +{variants.length - 4} more variant{variants.length - 4 === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="catalogue-card__footer">
                  <div className="catalogue-card__footer-left">
                    <span className="catalogue-footnote">
                      <Layers3 size={15} aria-hidden="true" />
                      ID: {product.id.slice(0, 8)}…
                    </span>
                  </div>

                  {editable && <div className="catalogue-card__actions">
                    <Link href={'/workspace/products?manage=' + product.id} className="catalogue-btn catalogue-btn--ghost">
                      Manage details
                    </Link>
                    {product.active && <PublicationForm productId={product.id} revision={product.revision} published={product.is_published} />}
                  </div>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        page={payload.page}
        pageCount={payload.pageCount}
        q={payload.filters.q}
        publication={payload.filters.publication}
      />
    </section>
  );
}
