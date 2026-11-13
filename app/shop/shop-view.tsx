import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Search, ShoppingBag, UserRound } from 'lucide-react';
import { ProductCard } from '@/src/components/product-card';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';
import './page.css';

export function ShopView({
  items, unavailable = false, query = '', category = '', sort = '', page = 1, hasNext = false, categories = [],
}: {
  items: CatalogProduct[] | null; unavailable?: boolean; query?: string; category?: string; sort?: string;
  page?: number; hasNext?: boolean; categories?: string[];
}) {
  const products = items ?? [];
  const filtered = Boolean(query || category || sort);
  const options = [...new Set([...categories, ...products.flatMap(product => product.category ? [product.category] : []), ...(category ? [category] : [])])];
  function pageLink(target: number) {
    const params = new URLSearchParams({ page: String(target) });
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (sort) params.set('sort', sort);
    return '/shop?' + params;
  }

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

        {items !== null && !unavailable && (items.length > 0 || filtered) &&
          <form action="/shop" className="flex flex-wrap items-end gap-3" role="search" aria-label="Find fragrances" key={pageLink(page)}>
            <label className="grid min-w-0 flex-1 basis-52 gap-2 text-xs">Search fragrances
              <input name="q" type="search" defaultValue={query} maxLength={120} placeholder="Search fragrances…"
                className="min-h-11 w-full border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-3 text-base" />
            </label>
            {options.length > 0 && <label className="grid max-w-full gap-2 text-xs">Category
              <select name="category" defaultValue={category} className="min-h-11 max-w-full border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-3">
                <option value="">All fragrances</option>
                {options.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>}
            <label className="grid gap-2 text-xs">Sort by
              <select name="sort" defaultValue={sort} className="min-h-11 border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-3">
                <option value="">Name: A–Z</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </label>
            <button className="min-h-11 bg-[var(--gr-theme-gold)] px-5 text-sm font-semibold text-[var(--gr-theme-surface)]">Apply</button>
            {filtered && <Link href="/shop" className="inline-flex min-h-11 items-center text-sm underline">Clear filters</Link>}
          </form>}
        <section className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8" aria-label="Fragrance products">
          {products.map(product => <ProductCard product={product} key={product.id} />)}
          {!products.length && (
            <div className="col-span-full flex min-h-64 flex-col items-center justify-center gap-4 border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] px-5 py-10 text-center">
              <Search size={25} strokeWidth={1} className="text-[var(--gr-theme-gold)]" aria-hidden="true" />
              {unavailable ? <><h2 className="font-serif text-3xl">The collection is temporarily unavailable.</h2><a className="min-h-11 underline" href={pageLink(page)}>Try again</a></>
                : items === null ? <p role="status">Loading the collection…</p>
                  : filtered ? <><h2 className="font-serif text-3xl">No fragrances match your filters.</h2><Link href="/shop" className="min-h-11 underline">Show all fragrances</Link></>
                    : <><h2 className="font-serif text-3xl">{page > 1 ? 'No fragrances on this page.' : 'The collection is coming soon.'}</h2><p className="max-w-sm text-sm leading-6 text-[var(--gr-theme-muted)]">Fragrances will appear here when they are released.</p></>}
            </div>
          )}
        </section>
        {(page > 1 || hasNext) && <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Catalogue pages">
          {page > 1 && <Link href={pageLink(page - 1)} className="inline-flex min-h-11 items-center underline">Previous page</Link>}
          <span className="text-sm">Page {page}</span>
          {hasNext && <Link href={pageLink(page + 1)} className="inline-flex min-h-11 items-center underline">Next page</Link>}
        </nav>}
        <div className="flex flex-col gap-3 border-t border-[var(--gr-theme-border)] pt-7 sm:flex-row sm:items-center sm:justify-between"><span className="text-[10px] leading-6 text-[var(--gr-theme-muted)]">A considered collection. A personal expression.</span><Link href="/#gr-story" className="inline-flex min-h-11 items-center gap-3 text-xs text-[var(--gr-theme-gold)]">Discover the Golden Rose story <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      </main>
      <footer className="border-t border-[#d8b575]/20 bg-[#0d0b09] px-5 pt-8 pb-24 text-[#b7a485] sm:px-9 lg:px-14"><div className="mx-auto flex max-w-[1248px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-2"><span className="font-serif text-xl tracking-[.1em] text-[#e2c189]">GOLDEN ROSE</span><span className="text-[8px] tracking-[.22em]">PERFUME · BEAUTY OF FRAGRANCE</span></div><nav aria-label="Shop footer" className="flex gap-6 text-[11px]"><Link href="/">Home</Link><Link href="/account">Your account</Link><Link href="/cart">Shopping bag</Link></nav></div></footer>
    </div>
  );
}
