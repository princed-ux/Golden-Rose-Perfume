import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
import { CustomerAccountShell } from '@/src/components/customer-account-shell';
import { ProductCard } from '@/src/components/product-card';
import { WishlistButton } from '@/src/components/wishlist-button';
import { requireCustomer } from '@/src/lib/customer/session';
import { findCatalogProducts } from '@/src/lib/golden-rose/edge';
import { createClient } from '@/src/lib/supabase/server';
import '@/app/cart/bag.css';

export const metadata: Metadata = { title: 'Saved Fragrances' };

async function SavedFragrances({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [customer, params] = await Promise.all([requireCustomer(), searchParams]);
  const page = /^\d{1,5}$/.test(params.page ?? '') ? Math.max(Number(params.page), 1) : 1;
  const offset = (page - 1) * 12;
  const saved = await (async () => {
    const client = await createClient();
    const { data, error } = await client.from('gr_customer_wishlist').select('product_id')
      .eq('user_id', customer.id).order('saved_at', { ascending: false }).order('product_id').range(offset, offset + 12);
    if (error) throw error;
    const ids: string[] = data.slice(0, 12).map(row => row.product_id);
    const products = await findCatalogProducts(ids);
    return { ids, products: new Map(products.map(product => [product.id, product])), hasNext: data.length > 12 };
  })().catch(() => null);

  return <CustomerAccountShell active="wishlist" name={customer.name}>
    <div className="grc-page">
      <header className="grc-page__heading">
        <p className="grc-eyebrow">YOUR PRIVATE BOUTIQUE</p>
        <h1>Saved fragrances.</h1>
        <p>Come back to the fragrances you want to explore again.</p>
      </header>
      {!saved ? <div className="grc-empty" role="status">
        <Heart aria-hidden="true" />
        <p>Saved fragrances are temporarily unavailable.</p>
        <a className="grc-text-link" href={'/account/wishlist?page=' + page}>Try again</a>
      </div> : !saved.ids.length ? <div className="grc-empty">
        <Heart aria-hidden="true" />
        <div><h2>{page === 1 ? 'No fragrances saved yet.' : 'No fragrances on this page.'}</h2>
          <p>Save a fragrance from its product page to find it here.</p></div>
        <Link href="/shop" className="grc-button grc-button--soft">Explore perfumes</Link>
      </div> : <div className="grc-product-grid">
        {saved.ids.map(id => {
          const product = saved.products.get(id);
          return <article key={id} className="grid min-w-0 content-start gap-3">
            {product ? <ProductCard product={product} compact /> :
              <div className="grc-panel"><h2>Fragrance unavailable</h2><p>This item is no longer in the current catalogue.</p></div>}
            <WishlistButton productId={id} saved removeOnly />
          </article>;
        })}
      </div>}
      {(page > 1 || saved?.hasNext) && <nav aria-label="Saved fragrances pages" className="mt-6 flex flex-wrap gap-5">
        {page > 1 && <Link className="grc-text-link" href={'/account/wishlist?page=' + (page - 1)}>Previous page</Link>}
        {saved?.hasNext && <Link className="grc-text-link" href={'/account/wishlist?page=' + (page + 1)}>Next page</Link>}
      </nav>}
    </div>
  </CustomerAccountShell>;
}

export default function WishlistPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return <Suspense fallback={<p role="status" className="grc-loading">Loading saved fragrances…</p>}>
    <SavedFragrances searchParams={searchParams} />
  </Suspense>;
}
