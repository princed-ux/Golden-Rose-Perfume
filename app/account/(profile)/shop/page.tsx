import type { Metadata } from 'next';

import { Suspense } from 'react';
import Link from 'next/link';

import {
  ArrowLeft,
  ArrowRight,
  Flower2,
  Search,
  ShoppingBag,
} from 'lucide-react';

import {
  CustomerAccountShell,
} from '@/src/components/customer-account-shell';

import {
  ProductCard,
} from '@/src/components/product-card';

import {
  ProductGallery,
} from '@/src/components/product-photo';

import {
  WishlistButton,
} from '@/src/components/wishlist-button';

import {
  ShoppingBagScreen,
} from '@/src/components/shopping-bag';

import {
  AddToBag,
} from '@/app/shop/[slug]/add-to-bag';

import {
  requireCustomer,
} from '@/src/lib/customer/session';

import {
  catalogPages,
  findCatalogProduct,
  getCatalogPage,
} from '@/src/lib/golden-rose/edge';

import {
  formatPrice,
  type CatalogProduct,
} from '@/src/lib/golden-rose/contracts';

import {
  getCheckoutWhatsAppContact,
} from '@/src/lib/customer/whatsapp-contacts';

import {
  createClient,
} from '@/src/lib/supabase/server';

import '@/app/cart/bag.css';

export const metadata: Metadata = {
  title: 'Your Fragrance Boutique',
  description:
    'Explore, save and select Golden Rose fragrances within your personal account.',
};

const PAGE_SIZE = 24;
const SHOP = '/account/shop';
const BAG = '/account/shop?view=bag';

const field =
  'min-h-12 w-full min-w-0 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-input)] px-3 py-2 text-base text-[var(--gr-theme-text)]';

type SearchParams = Record<
  string,
  string | string[] | undefined
>;

interface Props {
  searchParams: Promise<SearchParams>;
}

interface Filters {
  query: string;
  category: string;
  sort: '' | 'price-low' | 'price-high';
  page: number;
}

type Customer =
  Awaited<ReturnType<typeof requireCustomer>>;

function single(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseFilters(
  params: SearchParams,
): Filters {
  const sort = single(params.sort);
  const page = single(params.page);

  return {
    query:
      single(params.q).trim().slice(0, 120),

    category:
      single(params.category).trim().slice(0, 120),

    sort:
      sort === 'price-low' || sort === 'price-high'
        ? sort
        : '',

    page:
      /^\d{1,5}$/.test(page)
        ? Math.max(1, Math.min(41666, Number(page)))
        : 1,
  };
}

function catalogueHref(filters: Filters) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set('q', filters.query);
  }

  if (filters.category) {
    params.set('category', filters.category);
  }

  if (filters.sort) {
    params.set('sort', filters.sort);
  }

  if (filters.page > 1) {
    params.set('page', String(filters.page));
  }

  return params.size
    ? `${SHOP}?${params}`
    : SHOP;
}

function lowestPrice(product: CatalogProduct) {
  const prices = product.variants
    .filter(variant =>
      variant.currency === 'NGN' &&
      Number.isSafeInteger(variant.priceMinor) &&
      variant.priceMinor >= 0,
    )
    .map(variant => variant.priceMinor);

  return prices.length
    ? Math.min(...prices)
    : Number.POSITIVE_INFINITY;
}

/* =========================================================
   LIVE CATALOGUE LOADING
   ========================================================= */

async function loadCatalogue(filters: Filters) {
  const offset =
    (filters.page - 1) * PAGE_SIZE;

  if (!filters.category && !filters.sort) {
    const result = await getCatalogPage(
      offset,
      PAGE_SIZE + 1,
      filters.query,
    );

    return {
      items: result.items.slice(0, PAGE_SIZE),
      categories: result.categories,
      hasNext: result.items.length > PAGE_SIZE,
    };
  }

  /*
   * Preserve complete-catalogue filtering and sorting.
   * Do not filter only the current page.
   */

  const matching: CatalogProduct[] = [];
  const categories = new Set<string>();

  for await (const batch of catalogPages(filters.query)) {
    for (const product of batch) {
      if (product.category) {
        categories.add(product.category);
      }

      if (
        !filters.category ||
        product.category === filters.category
      ) {
        matching.push(product);
      }
    }
  }

  if (filters.sort) {
    matching.sort((a, b) => {
      const left = lowestPrice(a);
      const right = lowestPrice(b);

      if (!Number.isFinite(left) && !Number.isFinite(right)) {
        return a.name.localeCompare(b.name);
      }

      if (!Number.isFinite(left)) return 1;
      if (!Number.isFinite(right)) return -1;

      const difference =
        filters.sort === 'price-low'
          ? left - right
          : right - left;

      return difference ||
        a.name.localeCompare(b.name);
    });
  }

  return {
    items: matching.slice(offset, offset + PAGE_SIZE),
    categories: [...categories],
    hasNext: matching.length > offset + PAGE_SIZE,
  };
}

/* =========================================================
   SHARED PAGE HEADING
   ========================================================= */

function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="grc-page__heading">
      <p className="grc-eyebrow">
        YOUR PERSONAL BOUTIQUE
      </p>

      <h1>{title}</h1>

      <p>{description}</p>
    </header>
  );
}

/* =========================================================
   COLLECTION BROWSING
   ========================================================= */

async function Collection({
  filters,
}: {
  filters: Filters;
}) {
  const catalogue =
    await loadCatalogue(filters).catch(() => null);

  const categories = Array.from(
    new Set([
      ...(catalogue?.categories ?? []),

      ...(catalogue?.items.flatMap(
        product =>
          product.category ? [product.category] : [],
      ) ?? []),

      ...(filters.category ? [filters.category] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="grc-page grid min-w-0 gap-6">
      <Heading
        title="Explore perfumes."
        description="Discover your next signature fragrance, save your favourites and shop without leaving your account."
      />

      <form
        action={SHOP}
        method="get"
        role="search"
        className="grid min-w-0 gap-4 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className="grid min-w-0 gap-2 text-xs font-semibold">
          Search fragrances

          <span className="relative">
            <Search
              size={17}
              className="absolute left-3 top-4 text-[var(--gr-theme-gold)]"
              aria-hidden="true"
            />

            <input
              name="q"
              type="search"
              defaultValue={filters.query}
              maxLength={120}
              placeholder="Name or fragrance"
              className={`${field} pl-9!`}
            />
          </span>
        </label>

        <label className="grid min-w-0 gap-2 text-xs font-semibold">
          Category

          <select
            name="category"
            defaultValue={filters.category}
            className={field}
          >
            <option value="">All fragrances</option>

            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2 text-xs font-semibold">
          Sort by

          <select
            name="sort"
            defaultValue={filters.sort}
            className={field}
          >
            <option value="">Catalogue order</option>
            <option value="price-low">
              Price: low to high
            </option>
            <option value="price-high">
              Price: high to low
            </option>
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            className="grc-button grc-button--gold"
          >
            Apply filters
          </button>

          <Link
            href={SHOP}
            className="grc-text-link min-h-11"
          >
            Clear
          </Link>
        </div>
      </form>

      {!catalogue ? (
        <div className="grc-empty" role="alert">
          <Flower2 size={30} />

          <div>
            <h2>Collection unavailable</h2>

            <p>
              Your account and shopping bag remain available.
              Try loading the collection again.
            </p>
          </div>

          <Link
            href={catalogueHref(filters)}
            className="grc-button grc-button--soft"
          >
            Try again
          </Link>
        </div>
      ) : catalogue.items.length === 0 ? (
        <div className="grc-empty" role="status">
          <Flower2 size={30} />

          <div>
            <h2>
              {filters.query || filters.category
                ? 'No matching fragrances'
                : 'No fragrances available on this page'}
            </h2>

            <p>
              Try another search or explore the published collection.
            </p>
          </div>

          <Link href={SHOP} className="grc-button grc-button--soft">
            View collection
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--gr-theme-muted)]">
            {catalogue.items.length} fragrances on this page
          </p>

          <div className="grid min-w-0 grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3 2xl:grid-cols-4">
            {catalogue.items.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                compact
                account
              />
            ))}
          </div>
        </>
      )}

      {catalogue &&
        (filters.page > 1 || catalogue.hasNext) && (
          <nav
            aria-label="Fragrance catalogue pages"
            className="flex flex-wrap items-center justify-center gap-4"
          >
            {filters.page > 1 && (
              <Link
                href={catalogueHref({
                  ...filters,
                  page: filters.page - 1,
                })}
                className="grc-button grc-button--soft"
              >
                <ArrowLeft size={16} />
                Previous
              </Link>
            )}

            <span className="text-sm">
              Page {filters.page}
            </span>

            {catalogue.hasNext && (
              <Link
                href={catalogueHref({
                  ...filters,
                  page: filters.page + 1,
                })}
                className="grc-button grc-button--gold"
              >
                Next
                <ArrowRight size={16} />
              </Link>
            )}
          </nav>
        )}
    </div>
  );
}

/* =========================================================
   AUTHENTICATED PRODUCT DETAILS
   ========================================================= */

async function ProductDetails({
  slug,
  customer,
}: {
  slug: string;
  customer: Customer;
}) {
  if (
    slug.length > 240 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)
  ) {
    return (
      <div className="grc-empty">
        <p>Invalid fragrance selection.</p>

        <Link href={SHOP} className="grc-text-link">
          Return to collection
        </Link>
      </div>
    );
  }

  const result = await findCatalogProduct(slug)
    .then(product => ({ product, unavailable: false }))
    .catch(() => ({ product: null, unavailable: true }));

  const product = result.product;

  if (!product) {
    return (
      <div className="grc-empty" role="status">
        <Flower2 size={30} />

        <div>
          <h2>
            {result.unavailable
              ? 'Fragrance temporarily unavailable'
              : 'Fragrance not found'}
          </h2>

          <p>
            Explore the current Golden Rose collection.
          </p>
        </div>

        <Link
          href={
            result.unavailable
              ? `${SHOP}?product=${encodeURIComponent(slug)}`
              : SHOP
          }
          className="grc-button grc-button--soft"
        >
          {result.unavailable ? 'Try again' : 'Return to perfumes'}
        </Link>
      </div>
    );
  }

  const saved = await (async () => {
    const client = await createClient();

    const { data, error } = await client
      .from('gr_customer_wishlist')
      .select('product_id')
      .eq('user_id', customer.id)
      .eq('product_id', product.id)
      .maybeSingle();

    if (error) throw error;

    return Boolean(data);
  })().catch(() => null);

  const price = lowestPrice(product);

  return (
    <div className="grid min-w-0 gap-6">
      <Link
        href={SHOP}
        className="grc-text-link"
      >
        <ArrowLeft size={16} />
        Back to perfumes
      </Link>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <ProductGallery
          key={product.id}
          product={product}
        />

        <div className="grid min-w-0 gap-5">
          <header>
            <p className="grc-eyebrow">
              {[product.brand, product.category]
                .filter(Boolean)
                .join(' · ') || 'GOLDEN ROSE COLLECTION'}
            </p>

            <h1 className="mt-3 break-words font-serif text-4xl leading-tight text-[var(--gr-theme-text)] sm:text-5xl">
              {product.name}
            </h1>

            <p className="mt-4 font-serif text-2xl text-[var(--gr-theme-gold)]">
              {Number.isFinite(price)
                ? `From ${formatPrice(price)}`
                : 'Price unavailable'}
            </p>
          </header>

          {/* THE EXISTING SHOPPING BAG INTEGRATION */}

          <AddToBag
            key={product.id}
            variants={product.variants}
            account
          />

          <div className="rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4">
            {saved === null ? (
              <p role="status" className="text-sm">
                Saved-fragrance status is temporarily unavailable.
              </p>
            ) : (
              <WishlistButton
                key={product.id}
                productId={product.id}
                saved={saved}
              />
            )}
          </div>

          <section className="grid gap-3 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-5">
            <h2 className="font-serif text-xl">
              About this fragrance
            </h2>

            <p className="whitespace-pre-line break-words text-sm leading-7 text-[var(--gr-theme-muted)]">
              {product.description ||
                'Contact Golden Rose for more information about this fragrance.'}
            </p>
          </section>

          <Link
            href={BAG}
            className="grc-button grc-button--soft"
          >
            <ShoppingBag size={17} />
            View my bag
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CUSTOMER BAG AND CHECKOUT
   ========================================================= */

async function AccountBag({
  customer,
  checkout,
}: {
  customer: Customer;
  checkout: boolean;
}) {
  const contact = checkout
    ? await getCheckoutWhatsAppContact()
        .then(value => ({
          configured: Boolean(value),
          unavailable: false,
        }))
        .catch(() => ({
          configured: false,
          unavailable: true,
        }))
    : {
        configured: false,
        unavailable: false,
      };

  return (
    <div className="grid min-w-0 gap-6">
      <Heading
        title={checkout ? 'Complete your enquiry.' : 'My shopping bag.'}
        description={
          checkout
            ? 'Confirm your selection and prepare your order enquiry for WhatsApp.'
            : 'Review your fragrances, quantities and current estimated prices.'
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={checkout ? BAG : SHOP}
          className="grc-text-link"
        >
          <ArrowLeft size={16} />

          {checkout
            ? 'Back to my bag'
            : 'Continue exploring perfumes'}
        </Link>
      </div>

      <ShoppingBagScreen
        key={checkout ? 'checkout' : 'bag'}
        account
        checkout={checkout}
        configured={contact.configured}
        contactUnavailable={contact.unavailable}
        profile={{
          name: customer.name,
          email: customer.email,
        }}
      />

      {checkout && (
        <p className="text-xs leading-6 text-[var(--gr-theme-muted)]">
          Golden Rose confirms availability, delivery and payment
          arrangements through WhatsApp. Preparing an enquiry does
          not charge you or reserve stock.
        </p>
      )}
    </div>
  );
}

/* =========================================================
   AUTHENTICATED ACCOUNT SHOP
   ========================================================= */

async function AuthorizedShop({
  searchParams,
}: Props) {
  const [customer, params] = await Promise.all([
    requireCustomer(),
    searchParams,
  ]);

  const view = single(params.view);
  const slug = single(params.product);

  const bagView =
    view === 'bag' || view === 'checkout';

  return (
    <CustomerAccountShell
      active={bagView ? 'bag' : 'shop'}
      name={customer.name}
    >
      <Suspense
        fallback={
          <p role="status" className="grc-loading">
            Loading your personal boutique…
          </p>
        }
      >
        {bagView ? (
          <AccountBag
            customer={customer}
            checkout={view === 'checkout'}
          />
        ) : slug ? (
          <ProductDetails
            slug={slug}
            customer={customer}
          />
        ) : (
          <Collection
            filters={parseFilters(params)}
          />
        )}
      </Suspense>
    </CustomerAccountShell>
  );
}

export default function AccountShopPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="grc-loading" role="status">
          Opening your fragrance boutique…
        </div>
      }
    >
      <AuthorizedShop {...props} />
    </Suspense>
  );
}