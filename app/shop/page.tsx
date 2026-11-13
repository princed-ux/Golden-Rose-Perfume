import { Suspense } from 'react';
import { connection } from 'next/server';
import { catalogPages, getCatalogPage } from '@/src/lib/golden-rose/edge';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';
import { ShopView } from './shop-view';

const PAGE_SIZE = 24;
type ShopSearch = { q?: string; category?: string; sort?: string; page?: string };

function price(product: CatalogProduct) {
  return Math.min(...product.variants.map(variant => variant.priceMinor));
}

async function Catalog({ searchParams }: { searchParams: Promise<ShopSearch> }) {
  await connection();
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : '';
  const category = typeof params.category === 'string' ? params.category.trim().slice(0, 120) : '';
  const sort = params.sort === 'price-low' || params.sort === 'price-high' ? params.sort : '';
  const page = /^\d{1,5}$/.test(params.page ?? '') ? Math.min(41666, Math.max(Number(params.page), 1)) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const result = await (async () => {
    if (!category && !sort) return getCatalogPage(offset, PAGE_SIZE + 1, query);
    const items: CatalogProduct[] = [];
    const categories = new Set<string>();
    for await (const batch of catalogPages(query)) {
      for (const product of batch) {
        if (product.category) categories.add(product.category);
        if (!category || product.category === category) items.push(product);
      }
    }
    if (sort) items.sort((a, b) => sort === 'price-low' ? price(a) - price(b) : price(b) - price(a));
    return { items: items.slice(offset, offset + PAGE_SIZE + 1), categories: [...categories].sort() };
  })().catch(() => null);
  return <ShopView items={result?.items.slice(0, PAGE_SIZE) ?? []} unavailable={result === null}
    query={query} category={category} sort={sort} page={page} hasNext={(result?.items.length ?? 0) > PAGE_SIZE}
    categories={result?.categories ?? []} />;
}

export default function ShopPage({ searchParams }: { searchParams: Promise<ShopSearch> }) {
  return <Suspense fallback={<ShopView items={null} />}><Catalog searchParams={searchParams} /></Suspense>;
}
