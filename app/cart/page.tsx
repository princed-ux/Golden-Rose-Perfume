import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';
import { ShoppingBagScreen } from '@/src/components/shopping-bag';
import { listCatalog } from '@/src/lib/golden-rose/edge';
import './bag.css';

async function Bag() {
  await connection();
  const products = await listCatalog().catch(() => null);
  return <ShoppingBagScreen products={products} />;
}

export default function CartPage() {
  return <>
    <SiteHeader />
    <main className="container page-spacing gr-bag-page">
      <header>
        <Link href="/shop" className="text-link">← Continue shopping</Link>
        <h1>Your shopping bag.</h1>
        <p>Review your fragrances before requesting your order on WhatsApp.</p>
      </header>
      <Suspense fallback={<p role="status">Loading your bag…</p>}><Bag /></Suspense>
    </main>
  </>;
}
