
import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';

import { SiteHeader } from '@/src/components/site-header';
import { ShoppingBagScreen } from '@/src/components/shopping-bag';
import { getCustomer } from '@/src/lib/customer/session';

import {
  getCheckoutWhatsAppContact,
} from '@/src/lib/customer/whatsapp-contacts';

import '@/app/cart/bag.css';

async function Checkout() {
  await connection();

  const [customer, contactStatus] = await Promise.all([
    getCustomer().catch(() => null),

    getCheckoutWhatsAppContact().then(
      (contact) => ({
        configured: Boolean(contact),
        unavailable: false,
      }),

      () => ({
        configured: false,
        unavailable: true,
      }),
    ),
  ]);

  return (
    <ShoppingBagScreen
      checkout
      configured={contactStatus.configured}
      contactUnavailable={contactStatus.unavailable}
      profile={
        customer
          ? {
              name: customer.name,
              email: customer.email,
            }
          : null
      }
    />
  );
}

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />

      <main className="container page-spacing gr-bag-page">
        <header>
          <Link href="/cart" className="text-link">
            ← Back to shopping bag
          </Link>

          <h1>WhatsApp checkout.</h1>

          <p>
            Prepare a trackable Golden Rose order enquiry,
            then open WhatsApp and send the prepared message.
            The store will confirm availability, final pricing,
            delivery and payment arrangements in the conversation.
          </p>

          <p>
            Preparing an enquiry does not create a paid order,
            charge you, or reserve stock.
          </p>
        </header>

        <Suspense
          fallback={
            <p role="status">
              Checking your selections…
            </p>
          }
        >
          <Checkout />
        </Suspense>
      </main>
    </>
  );
}
