
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';

import {
  catalogPages,
  getCatalogPage,
} from '@/src/lib/golden-rose/edge';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';

import { ShopView } from './shop-view';

export const metadata: Metadata = {
  title: 'Shop Perfumes',
  description: 'Explore the Golden Rose Perfume collection and find a fragrance for every moment.',
};

const PAGE_SIZE = 24;
const MAX_PAGE = 41_666;

type ShopSearch = {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function lowestPrice(product: CatalogProduct): number {
  const prices = product.variants
    .map(variant => variant.priceMinor)
    .filter(price => Number.isSafeInteger(price) && price >= 0);

  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

async function Catalog({
  searchParams,
}: {
  searchParams: Promise<ShopSearch>;
}) {
  await connection();

  const params = await searchParams;
  const query = single(params.q).trim().slice(0, 120);
  const category = single(params.category).trim().slice(0, 120);
  const requestedSort = single(params.sort);
  const sort = requestedSort === 'price-low' || requestedSort === 'price-high'
    ? requestedSort
    : '';

  const pageText = single(params.page);
  const parsedPage = /^\d{1,5}$/.test(pageText)
    ? Number(pageText)
    : 1;
  const page = Math.min(MAX_PAGE, Math.max(1, parsedPage));
  const offset = (page - 1) * PAGE_SIZE;

  const result = await (async () => {
    // Keep the existing backend-paginated catalogue request
    // for ordinary browsing and name searches.
    if (!category && !sort) {
      return getCatalogPage(offset, PAGE_SIZE + 1, query);
    }

    // The current public catalogue endpoint does not yet
    // support database-side category filtering and price sorting.
    // Preserve complete-catalogue sorting and filtering so the
    // result is not limited to the first 24 published products.
    const matching: CatalogProduct[] = [];
    const categoryNames = new Set<string>();

    for await (const batch of catalogPages(query)) {
      for (const product of batch) {
        if (product.category) categoryNames.add(product.category);

        if (!category || product.category === category) {
          matching.push(product);
        }
      }
    }

    if (sort) {
      matching.sort((a, b) => {
        const aPrice = lowestPrice(a);
        const bPrice = lowestPrice(b);

        // Unpriced products belong last in either direction.
        if (!Number.isFinite(aPrice) || !Number.isFinite(bPrice)) {
          if (!Number.isFinite(aPrice) && !Number.isFinite(bPrice)) {
            return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
          }
          return Number.isFinite(aPrice) ? -1 : 1;
        }

        const difference = sort === 'price-low'
          ? aPrice - bPrice
          : bPrice - aPrice;

        return difference === 0
          ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
          : difference;
      });
    }

    return {
      items: matching.slice(offset, offset + PAGE_SIZE + 1),
      categories: Array.from(categoryNames).sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' }),
      ),
    };
  })().catch(() => null);

  return (
    <ShopView
      items={result?.items.slice(0, PAGE_SIZE) ?? []}
      unavailable={result === null}
      query={query}
      category={category}
      sort={sort}
      page={page}
      hasNext={(result?.items.length ?? 0) > PAGE_SIZE}
      categories={result?.categories ?? []}
    />
  );
}

export default function ShopPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearch>;
}) {
  return (
    <Suspense fallback={<ShopView items={null} />}>
      <Catalog searchParams={searchParams} />
    </Suspense>
  );
}