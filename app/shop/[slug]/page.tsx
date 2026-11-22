
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Info,
  ShoppingBag,
} from 'lucide-react';

import {
  SiteHeader,
} from '@/src/components/site-header';

import {
  ProductGallery,
} from '@/src/components/product-photo';

import {
  WishlistButton,
} from '@/src/components/wishlist-button';

import {
  getCustomer,
} from '@/src/lib/customer/session';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  findCatalogProduct,
} from '@/src/lib/golden-rose/edge';

import {
  formatPrice,
  type CatalogProduct,
} from '@/src/lib/golden-rose/contracts';

import { AddToBag } from './add-to-bag';

import '@/app/cart/bag.css';

type ProductParams = {
  params: Promise<{
    slug: string;
  }>;
};

function descriptionParagraphs(
  description: string | null,
): string[] {
  if (!description?.trim()) {
    return [];
  }

  // Preserve complete owner/Odoo descriptions.
  // Blank lines separate paragraphs; ordinary line breaks
  // are retained using whitespace-pre-line.
  return description
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

function ProductInformation({
  product,
}: {
  product: CatalogProduct;
}) {
  const paragraphs = descriptionParagraphs(
    product.description,
  );

  return (
    <section
      id="product-description"
      aria-labelledby="product-description-title"
      className="mt-7 rounded-2xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-5 sm:p-6"
    >
      <div className="flex items-center gap-3 border-b border-[var(--gr-theme-border)] pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6e9e9] text-[#8e415d]">
          <Info
            size={19}
            aria-hidden="true"
          />
        </span>

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--gr-theme-gold)]">
            PRODUCT INFORMATION
          </p>

          <h2
            id="product-description-title"
            className="font-serif text-2xl font-normal text-[var(--gr-theme-text)]"
          >
            About this fragrance
          </h2>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {paragraphs.length ? (
          paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="mb-0 whitespace-pre-line break-words text-sm leading-8 text-[var(--gr-theme-muted)] sm:text-[15px]"
            >
              {paragraph}
            </p>
          ))
        ) : (
          <p className="mb-0 text-sm leading-7 text-[var(--gr-theme-muted)]">
            A detailed description has not yet been
            added for this perfume. Golden Rose can
            provide more information about the fragrance
            before you complete your purchase.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-3 border-t border-[var(--gr-theme-border)] pt-5 sm:grid-cols-2">
        {product.brand && (
          <div className="rounded-xl bg-[var(--gr-theme-bg)] p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--gr-theme-muted)]">
              Brand
            </p>

            <p className="mb-0 text-sm font-semibold text-[var(--gr-theme-text)]">
              {product.brand}
            </p>
          </div>
        )}

        {product.category && (
          <div className="rounded-xl bg-[var(--gr-theme-bg)] p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--gr-theme-muted)]">
              Category
            </p>

            <p className="mb-0 text-sm font-semibold text-[var(--gr-theme-text)]">
              {product.category}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

async function ProductDetail({
  params,
}: ProductParams) {
  const { slug } = await params;

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ||
    slug.length > 240
  ) {
    notFound();
  }

  await connection();

  let product: CatalogProduct | null;

  try {
    product = await findCatalogProduct(slug);
  } catch {
    return (
      <section
        className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-8 text-center"
        role="alert"
      >
        <h1 className="font-serif text-3xl text-[var(--gr-theme-text)]">
          Fragrance details are temporarily unavailable.
        </h1>

        <p className="mt-3 text-sm leading-7 text-[var(--gr-theme-muted)]">
          We could not retrieve the current product information.
          No order has been placed.
        </p>

        <Link
          href={
            '/shop/' + encodeURIComponent(slug)
          }
          className="text-link mt-4"
        >
          Try again
          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </section>
    );
  }

  if (!product) {
    notFound();
  }

  const customer = await getCustomer().catch(
    () => null,
  );

  // Keep the existing customer wishlist association.
  // An email match alone must not expose or modify
  // another customer's wishlist.
  const saved = customer
    ? await (async () => {
        const client = await createClient();

        const { data, error } = await client
          .from('gr_customer_wishlist')
          .select('product_id')
          .eq('user_id', customer.id)
          .eq('product_id', product.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        return Boolean(data);
      })().catch(() => null)
    : false;

  const listedVariants = product.variants.filter(
    variant =>
      Number.isSafeInteger(variant.priceMinor) &&
      variant.priceMinor >= 0,
  );

  const ngnVariants = listedVariants.filter(
    variant => variant.currency === 'NGN',
  );

  const startingPrice = ngnVariants.length
    ? Math.min(
        ...ngnVariants.map(
          variant => variant.priceMinor,
        ),
      )
    : null;

  const categoryLine = [
    product.brand,
    product.category,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-2 text-xs text-[var(--gr-theme-muted)]"
      >
        <Link
          href="/"
          className="hover:underline"
        >
          Home
        </Link>

        <ChevronRight
          size={13}
          aria-hidden="true"
        />

        <Link
          href="/shop"
          className="hover:underline"
        >
          The collection
        </Link>

        <ChevronRight
          size={13}
          aria-hidden="true"
        />

        <span
          aria-current="page"
          className="font-semibold text-[var(--gr-theme-text)]"
        >
          {product.name}
        </span>
      </nav>

      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-28">
          <div className="overflow-hidden rounded-2xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-3 shadow-sm sm:p-5">
            <ProductGallery product={product} />
          </div>

          <div className="mt-4 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-4 py-3">
            <p className="mb-0 text-xs leading-6 text-[var(--gr-theme-muted)]">
              Product photographs and descriptions
              are supplied through the Golden Rose
              catalogue. Select a bottle size to view
              its listed selling price.
            </p>
          </div>
        </div>

        <section
          aria-labelledby="product-title"
          className="min-w-0"
        >
          {categoryLine && (
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.17em] text-[var(--gr-theme-gold)]">
              {categoryLine}
            </p>
          )}

          <h1
            id="product-title"
            className="font-serif text-[clamp(2.4rem,4.6vw,4.5rem)] font-normal leading-[1.08] tracking-[-0.04em] text-[var(--gr-theme-text)]"
          >
            {product.name}
          </h1>

          <div className="mt-6 border-b border-[var(--gr-theme-border)] pb-5">
            {startingPrice !== null ? (
              <>
                <p className="mb-2 text-xs text-[var(--gr-theme-muted)]">
                  {ngnVariants.length > 1
                    ? 'Starting from'
                    : 'Listed price'}
                </p>

                <p className="mb-0 font-serif text-3xl text-[var(--gr-theme-text)]">
                  {formatPrice(startingPrice)}
                </p>
              </>
            ) : (
              <p className="mb-0 text-sm text-[var(--gr-theme-muted)]">
                Contact Golden Rose for current
                ordering options.
              </p>
            )}
          </div>

          <ProductInformation product={product} />

          <section
            className="mt-7"
            aria-labelledby="variants-heading"
          >
            <div className="mb-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--gr-theme-gold)]">
                SIZES &amp; PRICES
              </p>

              <h2
                id="variants-heading"
                className="font-serif text-2xl font-normal text-[var(--gr-theme-text)]"
              >
                Available selections
              </h2>

              <p className="mt-2 text-xs leading-6 text-[var(--gr-theme-muted)]">
                Prices are shown for the variants listed
                in the catalogue. Physical stock is
                confirmed by the boutique.
              </p>
            </div>

            {listedVariants.length > 0 ? (
              <ul
                className="grid list-none gap-3 p-0 sm:grid-cols-2"
                aria-label="Listed variants and prices"
              >
                {listedVariants.map(variant => (
                  <li
                    key={variant.id}
                    className="min-w-0 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4"
                  >
                    <p className="mb-2 text-sm font-semibold text-[var(--gr-theme-text)]">
                      {variant.sizeMl
                        ? `${variant.sizeMl} ml`
                        : variant.sku ?? 'Standard size'}
                    </p>

                    <strong className="text-sm text-[var(--gr-theme-gold)]">
                      {formatPrice(
                        variant.priceMinor,
                        variant.currency,
                      )}
                    </strong>

                    {variant.sku && (
                      <p className="mt-2 mb-0 break-words text-xs text-[var(--gr-theme-muted)]">
                        SKU: {variant.sku}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4 text-sm text-[var(--gr-theme-muted)]">
                Current variant prices are not available.
              </p>
            )}
          </section>

          <AddToBag
            variants={product.variants}
          />

          <div className="mt-5 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4 sm:p-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gr-theme-gold)]">
              SAVE THIS FRAGRANCE
            </p>

            {saved === null ? (
              <p
                className="mb-0 text-sm text-[var(--gr-theme-muted)]"
                role="status"
              >
                Saved fragrances are temporarily
                unavailable.

                {' '}
                <a
                  href={
                    '/shop/' +
                    encodeURIComponent(slug)
                  }
                  className="underline"
                >
                  Try again
                </a>
              </p>
            ) : (
              <WishlistButton
                productId={product.id}
                saved={saved}
                signedIn={Boolean(customer)}
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[var(--gr-theme-border)] pt-5">
            <Link
              href="/cart"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--gr-theme-text)]"
            >
              <ShoppingBag
                size={17}
                aria-hidden="true"
              />

              My shopping bag
              <ArrowRight
                size={16}
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export default function ProductPage({
  params,
}: ProductParams) {
  return (
    <>
      <SiteHeader />

      <main className="min-h-[70vh] bg-[var(--gr-theme-bg)] pb-24 pt-8 text-[var(--gr-theme-text)] sm:pt-12">
        <div className="mx-auto w-[calc(100%-40px)] max-w-[1280px] sm:w-[calc(100%-64px)]">
          <Link
            href="/shop"
            className="text-link mb-6"
          >
            <ArrowLeft
              size={16}
              aria-hidden="true"
            />

            Back to collection
          </Link>

          <Suspense
            fallback={
              <p
                className="rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-6 text-sm"
                role="status"
              >
                Loading fragrance details…
              </p>
            }
          >
            <ProductDetail params={params} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
