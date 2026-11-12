import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/src/components/site-header';
import { BottleArt } from '@/src/components/bottle-art';
import { findCatalogProduct } from '@/src/lib/golden-rose/edge';
import { formatPrice, type CatalogProduct } from '@/src/lib/golden-rose/contracts';
import { AddToBag } from './add-to-bag';
import '@/app/cart/bag.css';

type ProductParams = { params: Promise<{ slug: string }> };

async function ProductDetail({ params }: ProductParams) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) || slug.length > 240) notFound();
  await connection();
  let product: CatalogProduct | null;
  try {
    product = await findCatalogProduct(slug);
  } catch {
    return <section className="page-heading" role="alert">
      <h1>Fragrance details are temporarily unavailable.</h1>
      <Link href={'/shop/' + encodeURIComponent(slug)} className="text-link">Try again</Link>
    </section>;
  }
  if (!product) notFound();
  return (
    <div className="detail-layout">
      <div className="detail-art" aria-hidden="true"><BottleArt variant={2} /></div>
      <section className="detail-copy">
        <p className="overline">{[product.brand, product.category].filter(Boolean).join(' · ')}</p>
        <h1>{product.name}</h1>
        {product.description && <p>{product.description}</p>}
        <ul className="flex list-none flex-wrap gap-3 p-0" aria-label="Available variants and prices">
          {product.variants.map(variant => <li key={variant.id} className="detail-pill">
            {variant.sizeMl ? variant.sizeMl + ' ml' : variant.sku ?? 'Variant'} <span aria-hidden="true">·</span> {formatPrice(variant.priceMinor, variant.currency)}
          </li>)}
        </ul>
        <AddToBag variants={product.variants} />
      </section>
    </div>
  );
}

export default function ProductPage({ params }: ProductParams) {
  return <>
    <SiteHeader />
    <main className="container page-spacing">
      <Link href="/shop" className="text-link"><ArrowLeft size={16} aria-hidden="true" /> Back to collection</Link>
      <Suspense fallback={<p role="status">Loading fragrance details…</p>}><ProductDetail params={params} /></Suspense>
    </main>
  </>;
}

