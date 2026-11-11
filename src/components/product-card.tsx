import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/src/domain';
import { ArrowUpRight } from 'lucide-react';
import { BottleArt } from './bottle-art';
import { formatNaira } from '@/src/lib/demo-data';

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const variant = ((index % 3) + 1) as 1 | 2 | 3;
  const firstVariant = product.variants[0];
  return (
    <Link className="gr-shop-card group flex min-w-0 flex-col" href={`/shop/${product.id}`} aria-label={`View ${product.name}`}>
      <div className={`gr-shop-card-art gr-shop-card-art--${variant} relative flex aspect-[4/5] items-center justify-center overflow-hidden border border-[var(--gr-theme-border)] sm:aspect-square lg:aspect-[4/5]`}>
        {product.images[0] ? <Image src={product.images[0]} alt={product.name} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" className="object-contain p-7 transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" /> : <div className="scale-95 transition-transform duration-700 group-hover:scale-100 motion-reduce:transform-none motion-reduce:transition-none"><BottleArt variant={variant} /></div>}
        <span className="absolute top-4 left-4 text-[8px] font-medium tracking-[.16em] text-[var(--gr-theme-muted)]">ILLUSTRATIVE PRODUCT</span>
        <span className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] text-[var(--gr-theme-gold)] transition-colors group-hover:border-[var(--gr-theme-gold)]"><ArrowUpRight size={18} strokeWidth={1.3} aria-hidden="true" /></span>
      </div>
      <div className="flex flex-1 flex-col gap-3 pt-5">
        <span className="text-[9px] tracking-[.17em] text-[var(--gr-theme-gold)]">{product.category.toUpperCase()}{firstVariant?.sizeMl ? ` · ${firstVariant.sizeMl} ML` : ''}</span>
        <h2 className="min-h-[2.5em] font-serif text-[27px] leading-[1.2] tracking-[-.02em] text-[var(--gr-theme-text)] transition-colors group-hover:text-[var(--gr-theme-gold)] sm:text-2xl">{product.name}</h2>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-[15px] font-medium tabular-nums text-[var(--gr-theme-text)]">{firstVariant ? formatNaira(firstVariant.priceMinor) : 'Price to be confirmed'}</p><span className="text-[9px] text-[var(--gr-theme-muted)]">Illustrative price</span></div>
        <span className="mt-2 inline-flex min-h-11 items-center justify-between gap-4 border-b border-[var(--gr-theme-border)] text-[10px] font-semibold tracking-[.08em] text-[var(--gr-theme-gold)] transition-colors group-hover:border-[var(--gr-theme-gold)]">VIEW FRAGRANCE <ArrowUpRight size={15} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
