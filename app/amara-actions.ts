'use server';

import { getCatalogPage } from '@/src/lib/golden-rose/edge';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

export async function discoverFragrances(input: string) {
  const query = typeof input === 'string' ? input.trim() : '';
  if (query.length > 80) return { message: 'Enter a fragrance name of up to 80 characters.', links: [] };
  try {
    const { items } = await getCatalogPage(0, 4, query);
    if (!items.length) return { message: query ? 'No published fragrances matched that search.' : 'The boutique has not published any fragrances yet.', links: [] };
    return {
      message: 'These fragrances are listed in the live collection.',
      links: items.map(product => {
        const variants = product.variants.map(variant =>
          [variant.sizeMl ? variant.sizeMl + ' ml' : variant.sku, formatPrice(variant.priceMinor, variant.currency)].filter(Boolean).join(' · '));
        return {
          label: product.name,
          href: '/shop/' + encodeURIComponent(product.slug || product.id),
          detail: variants.slice(0, 3).join(' / '),
        };
      }),
    };
  } catch {
    return { message: 'The live catalogue could not be reached. Try again in a moment.', links: [] };
  }
}
