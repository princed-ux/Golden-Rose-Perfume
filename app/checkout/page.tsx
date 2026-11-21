import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';
import { ShoppingBagScreen } from '@/src/components/shopping-bag';
import { getCustomer } from '@/src/lib/customer/session';
import { getStoreWhatsAppContact } from '@/src/lib/customer/whatsapp-contacts';
import '@/app/cart/bag.css';

async function Checkout() {
  await connection();
  const [customer, contact] = await Promise.all([
    getCustomer().catch(() => null),
    getStoreWhatsAppContact().then(
      value => ({ configured: Boolean(value), unavailable: false }),
      () => ({ configured: false, unavailable: true }),
    ),
  ]);
  return <ShoppingBagScreen checkout configured={contact.configured} contactUnavailable={contact.unavailable}
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
