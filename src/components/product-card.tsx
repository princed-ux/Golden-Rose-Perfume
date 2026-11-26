import Link from 'next/link';

import {
  ArrowUpRight,
} from 'lucide-react';

import {
  formatPrice,
  type CatalogProduct,
} from '@/src/lib/golden-rose/contracts';

import {
  ProductPhoto,
} from './product-photo';

interface ProductCardProps {
  product: CatalogProduct;
  compact?: boolean;
  account?: boolean;
}

export function ProductCard({
  product,
  compact = false,
  account = compact,
}: ProductCardProps) {
  const variants = product.variants.filter(
    variant =>
      Number.isSafeInteger(variant.priceMinor) &&
      variant.priceMinor >= 0,
  );

  const variant = variants.reduce<
    (typeof variants)[number] | undefined
  >(
    (lowest, item) =>
      !lowest || item.priceMinor < lowest.priceMinor
        ? item
        : lowest,

    undefined,
  );

  const Title = compact ? 'h3' : 'h2';

  const price = variant
    ? (
        (variants.length > 1 ? 'From ' : '') +
        formatPrice(variant.priceMinor, variant.currency)
      )
    : 'Price unavailable';

  const identifier = encodeURIComponent(
    product.slug || product.id,
  );

  const href = account
    ? `/account/shop?product=${identifier}`
    : `/shop/${identifier}`;

  return (
    <Link
      href={href}
      aria-label={'View ' + product.name}
      className={
        compact
          ? 'grc-product group min-w-0'
          : 'gr-shop-card group flex min-w-0 flex-col'
      }
    >
      <div
        className={
          compact
            ? 'grc-product__art'
            : 'relative flex aspect-[4/5] items-center justify-center overflow-hidden border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] sm:aspect-square lg:aspect-[4/5]'
        }
      >
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none">
          <ProductPhoto
            image={product.images?.[0]}
            name={product.name}
            sizes={
              compact
                ? '(max-width: 767px) 46vw, (max-width: 1279px) 30vw, 24vw'
                : '(max-width: 640px) 95vw, (max-width: 1023px) 48vw, 32vw'
            }
          />
        </div>

        <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] text-[var(--gr-theme-gold)]">
          <ArrowUpRight
            size={16}
            strokeWidth={1.4}
            aria-hidden="true"
          />
        </span>
      </div>

      <div
        className={
          compact
            ? 'grc-product__details min-w-0'
            : 'flex flex-1 flex-col gap-2 pt-4'
        }
      >
        <span
          className={
            compact
              ? 'grc-product__category break-words'
              : 'text-[10px] uppercase tracking-[.14em] text-[var(--gr-theme-gold)]'
          }
        >
          {[product.brand, product.category]
            .filter(Boolean)
            .join(' · ')}
        </span>

        <Title
          className={
            compact
              ? 'break-words'
              : 'break-words font-serif text-2xl leading-tight text-[var(--gr-theme-text)]'
          }
        >
          {product.name}
        </Title>

        <div
          className={
            compact
              ? 'grc-product__bottom flex-wrap!'
              : 'mt-auto flex flex-wrap items-baseline justify-between gap-2 text-sm'
          }
        >
          <strong className="break-words">
            {price}
          </strong>

          {variant?.sizeMl && (
            <span>{variant.sizeMl} ml</span>
          )}
        </div>
      </div>
    </Link>
  );
}