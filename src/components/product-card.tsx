import Link from 'next/link';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';
import { ArrowUpRight } from 'lucide-react';
import { BottleArt } from './bottle-art';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

export function ProductCard({ product, index }: { product: CatalogProduct; index: number }) {
  const variant = ((index % 3) + 1) as 1 | 2 | 3;
  const firstVariant = product.variants[0];
  return (
    <Link className="gr-shop-card group flex min-w-0 flex-col" href={`/shop/${encodeURIComponent(product.slug || product.id)}`} aria-label={`View ${product.name}`}>
      <div className={`gr-shop-card-art gr-shop-card-art--${variant} relative flex aspect-[4/5] items-center justify-center overflow-hidden border border-[var(--gr-theme-border)] sm:aspect-square lg:aspect-[4/5]`}>
        <div aria-hidden="true" className="scale-95 transition-transform duration-700 group-hover:scale-100 motion-reduce:transform-none motion-reduce:transition-none"><BottleArt variant={variant} /></div>
        <span className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] text-[var(--gr-theme-gold)] transition-colors group-hover:border-[var(--gr-theme-gold)]"><ArrowUpRight size={18} strokeWidth={1.3} aria-hidden="true" /></span>
      </div>
      <div className="flex flex-1 flex-col gap-3 pt-5">
        <span className="text-[9px] uppercase tracking-[.17em] text-[var(--gr-theme-gold)]">{[product.brand, product.category, firstVariant?.sizeMl ? firstVariant.sizeMl + ' ml' : null].filter(Boolean).join(' · ')}</span>
        <h2 className="min-h-[2.5em] font-serif text-[27px] leading-[1.2] tracking-[-.02em] text-[var(--gr-theme-text)] transition-colors group-hover:text-[var(--gr-theme-gold)] sm:text-2xl">{product.name}</h2>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-[15px] font-medium tabular-nums text-[var(--gr-theme-text)]">{firstVariant ? (product.variants.length > 1 ? 'From ' : '') + formatPrice(firstVariant.priceMinor, firstVariant.currency) : 'Price unavailable'}</p></div>
        <span className="mt-2 inline-flex min-h-11 items-center justify-between gap-4 border-b border-[var(--gr-theme-border)] text-[10px] font-semibold tracking-[.08em] text-[var(--gr-theme-gold)] transition-colors group-hover:border-[var(--gr-theme-gold)]">VIEW FRAGRANCE <ArrowUpRight size={15} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
