'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Search, ShoppingBag, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { ProductCard } from '@/src/components/product-card';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';
import './page.css';

const ALL = 'All fragrances';

export function ShopView({ items, unavailable = false }: { items: CatalogProduct[] | null; unavailable?: boolean }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState('featured');
  const categories = [...new Set(items?.flatMap(product => product.category ? [product.category] : []) ?? [])];
  const products = (items ?? []).filter(product => {
    const matchesCategory = category === null || product.category === category;
    const searchable = [product.name, product.brand, product.category].filter(Boolean).join(' ').toLowerCase();
    return matchesCategory && searchable.includes(query.trim().toLowerCase());
  });
  if (sort === 'price-low') products.sort((a, b) => (a.variants[0]?.priceMinor ?? Infinity) - (b.variants[0]?.priceMinor ?? Infinity));
  if (sort === 'price-high') products.sort((a, b) => (b.variants[0]?.priceMinor ?? -Infinity) - (a.variants[0]?.priceMinor ?? -Infinity));
  if (sort === 'name') products.sort((a, b) => a.name.localeCompare(b.name));
  const filtered = Boolean(query.trim()) || category !== null;
  function clearFilters() { setQuery(''); setCategory(null); }

  return (
    <div className="gr-shop min-h-screen bg-[var(--gr-theme-bg)] text-[var(--gr-theme-text)]">
      <div className="flex min-h-8 items-center justify-center gap-4 bg-[#c5a56a] px-4 py-2 text-center text-[8px] font-bold tracking-[.18em] text-[#21170f] sm:text-[9px]">BEAUTY OF FRAGRANCE <span aria-hidden="true">✦</span> THE GOLDEN ROSE COLLECTION</div>
      <header className="border-b border-[#d8b575]/20 bg-[#0d0b09] text-[#f0dbac]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-5 px-5 py-3 sm:px-9 lg:px-14 lg:py-1">
          <Link href="/" aria-label="Golden Rose Perfume homepage" className="shrink-0"><Image src="/assets/brand/golden-rose-logo.png" alt="Golden Rose Perfume — Beauty Of Fragrance" width={1188} height={1324} sizes="72px" className="h-16 w-auto lg:h-20" preload /></Link>
          <nav aria-label="Shop navigation" className="order-3 flex w-full items-center justify-between gap-4 border-t border-[#d8b575]/10 pt-4 pb-1 text-[10px] tracking-wide sm:justify-center sm:gap-9 lg:order-none lg:w-auto lg:border-0 lg:p-0 lg:text-xs">
            <Link href="/" className="transition-colors hover:text-white">Home</Link><Link href="/shop" aria-current="page" className="text-[#f5d794] underline decoration-[#b79560] underline-offset-8">Shop All</Link><Link href="/#collections" className="transition-colors hover:text-white">Collections</Link><Link href="/#gr-story" className="transition-colors hover:text-white">Our Story</Link>
          </nav>
          <div className="flex items-center gap-5 text-[11px] sm:gap-7">
            <Link href="/account" aria-label="Your customer account" className="flex min-h-11 items-center gap-2 transition-colors hover:text-white"><UserRound size={18} strokeWidth={1.4} aria-hidden="true" /><span className="hidden sm:inline">Account</span></Link>
            <Link href="/cart" aria-label="Shopping bag" className="flex min-h-11 items-center gap-2 transition-colors hover:text-white"><ShoppingBag size={18} strokeWidth={1.4} aria-hidden="true" /><span className="hidden sm:inline">Bag</span></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-5 pt-5 pb-16 sm:gap-10 sm:px-9 sm:pt-10 lg:px-14 lg:pt-11">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[10px] text-[var(--gr-theme-muted)]"><Link href="/" className="hover:text-[var(--gr-theme-gold)]">Home</Link><ChevronRight size={12} aria-hidden="true" /><span aria-current="page" className="text-[var(--gr-theme-gold)]">The collection</span></nav>
        <section className="flex flex-col gap-4 border-b border-[var(--gr-theme-border)] pb-6 sm:pb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-12" aria-labelledby="shop-title">
          <div className="flex max-w-2xl flex-col gap-4">
            <p className="text-[9px] font-semibold tracking-[.24em] text-[var(--gr-theme-gold)]">THE FRAGRANCE LIBRARY</p>
            <h1 id="shop-title" className="font-serif text-[42px] leading-[1.08] tracking-[-.045em] sm:text-6xl lg:text-[68px]">Find your <em className="text-[var(--gr-theme-gold)]">signature.</em></h1>
            <p className="max-w-lg text-[13px] leading-7 text-[var(--gr-theme-muted)]">Explore the Golden Rose collection and find a scent that feels like you.</p>
          </div>
        </section>

        {!!items?.length && <section className="flex flex-col gap-5" aria-label="Browse the collection">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div role="search" className="relative w-full text-base sm:max-w-sm">
              <label htmlFor="shop-search" className="sr-only">Search fragrances by name, brand or scent family</label>
              <Search size={17} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--gr-theme-gold)]" />
              <input id="shop-search" type="search" placeholder="Search fragrances…" value={query} onChange={event => setQuery(event.target.value)} className="min-h-12 w-full rounded-none border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] py-3 pr-4 pl-11 text-[var(--gr-theme-text)] placeholder:text-[var(--gr-theme-muted)] focus:border-[var(--gr-theme-gold)] focus:outline-none" />
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--gr-theme-muted)]"><SlidersHorizontal size={14} aria-hidden="true" /><label htmlFor="shop-sort">Sort by</label><select id="shop-sort" value={sort} onChange={event => setSort(event.target.value)} className="min-h-11 max-w-full border-0 border-b border-[var(--gr-theme-border)] bg-[var(--gr-theme-bg)] py-2 pr-3 text-[var(--gr-theme-text)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--gr-theme-gold)]"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select></div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-nowrap gap-2 overflow-x-auto pb-1 text-[11px] sm:w-auto sm:flex-wrap" aria-label="Scent families">{[null, ...categories].map(item => <button type="button" key={item === null ? 'all' : 'category:' + item} aria-pressed={category === item} onClick={() => setCategory(item)} className={`min-h-10 shrink-0 rounded-full border px-4 py-2 transition-colors motion-reduce:transition-none ${category === item ? 'border-[var(--gr-theme-gold)] bg-[var(--gr-theme-gold)] text-[var(--gr-theme-surface)]' : 'border-[var(--gr-theme-border)] bg-transparent text-[var(--gr-theme-muted)] hover:border-[var(--gr-theme-gold)] hover:text-[var(--gr-theme-gold)]'}`}>{item ?? ALL}</button>)}</div>
            <div className="flex items-center justify-between gap-4 text-[10px] text-[var(--gr-theme-muted)]"><span role="status" aria-live="polite">Showing {products.length} of {items.length} fragrances</span>{filtered && <button type="button" onClick={clearFilters} className="flex min-h-10 items-center gap-1.5 text-[var(--gr-theme-gold)] underline underline-offset-4"><X size={12} aria-hidden="true" /> Clear filters</button>}</div>
          </div>
        </section>}

        <section className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8" aria-label="Fragrance products">
          {products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}
          {!products.length && (
            <div className="col-span-full flex min-h-64 flex-col items-center justify-center gap-4 border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-5 py-10 text-center">
              <Search size={25} strokeWidth={1} className="text-[var(--gr-theme-gold)]" aria-hidden="true" />
              {unavailable ? <><h2 className="font-serif text-3xl">The collection is temporarily unavailable.</h2><button type="button" className="min-h-11 underline" onClick={() => window.location.reload()}>Try again</button></>
                : items === null ? <p role="status">Loading the collection…</p>
                  : filtered ? <><h2 className="font-serif text-3xl">No fragrances match your filters.</h2><button type="button" onClick={clearFilters} className="min-h-11 underline">Show all fragrances</button></>
                    : <><h2 className="font-serif text-3xl">The collection is coming soon.</h2><p className="max-w-sm text-sm leading-6 text-[var(--gr-theme-muted)]">Fragrances will appear here when they are released.</p></>}
            </div>
          )}
        </section>
        <div className="flex flex-col gap-3 border-t border-[var(--gr-theme-border)] pt-7 sm:flex-row sm:items-center sm:justify-between"><span className="text-[10px] leading-6 text-[var(--gr-theme-muted)]">A considered collection. A personal expression.</span><Link href="/#gr-story" className="inline-flex min-h-11 items-center gap-3 text-xs text-[var(--gr-theme-gold)]">Discover the Golden Rose story <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      </main>
      <footer className="border-t border-[#d8b575]/20 bg-[#0d0b09] px-5 pt-8 pb-24 text-[#b7a485] sm:px-9 lg:px-14"><div className="mx-auto flex max-w-[1248px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-2"><span className="font-serif text-xl tracking-[.1em] text-[#e2c189]">GOLDEN ROSE</span><span className="text-[8px] tracking-[.22em]">PERFUME · BEAUTY OF FRAGRANCE</span></div><nav aria-label="Shop footer" className="flex gap-6 text-[11px]"><Link href="/">Home</Link><Link href="/account">Your account</Link><Link href="/cart">Shopping bag</Link></nav></div></footer>
    </div>
  );
}
