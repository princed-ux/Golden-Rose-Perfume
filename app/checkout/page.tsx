import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';
import { ShoppingBagScreen } from '@/src/components/shopping-bag';
import { listCatalog } from '@/src/lib/golden-rose/edge';
import { getCustomer } from '@/src/lib/customer/session';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';
import '@/app/cart/bag.css';

async function Checkout() {
  await connection();
  const [products, customer] = await Promise.all([listCatalog().catch(() => null), getCustomer().catch(() => null)]);
  return <ShoppingBagScreen products={products} checkout configured={Boolean(getWhatsAppNumber())}
    profile={customer ? { name: customer.name, email: customer.email } : null} />;
}

export default function CheckoutPage() {
  return <>
    <SiteHeader />
    <main className="container page-spacing gr-bag-page">
      <header>
        <Link href="/cart" className="text-link">← Back to shopping bag</Link>
        <h1>WhatsApp checkout.</h1>
        <p>Prepare your order request for the Golden Rose boutique.</p>
      </header>
      <Suspense fallback={<p role="status">Checking your selections…</p>}><Checkout /></Suspense>
    </main>
  </>;
}
