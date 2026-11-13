
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  PackageOpen,
  ShoppingBag,
} from 'lucide-react';

import { CustomerAccountShell } from '@/src/components/customer-account-shell';
import { requireCustomer } from '@/src/lib/customer/session';

export const metadata: Metadata = {
  title: 'My Orders — Golden Rose Perfume',
};

export default function AccountOrdersPage() {
  return <Suspense fallback={<p className="grc-loading" role="status">Loading your orders…</p>}>
    <AccountOrders />
  </Suspense>;
}

async function AccountOrders() {
  const customer = await requireCustomer();

  return (
    <CustomerAccountShell
      active="orders"
      name={customer.name}
    >
      <div className="grc-page">
        <header className="grc-page__heading">
          <p className="grc-eyebrow">
            YOUR FRAGRANCE JOURNEY
          </p>

          <h1>My orders.</h1>

          <p>
            Every beautiful fragrance starts with
            a conversation. Here&apos;s how your Golden
            Rose order enquiries work.
          </p>
        </header>

        <section
          className="grc-orders-empty"
          aria-labelledby="grc-orders-title"
        >
          <span
            className="grc-orders-empty__art"
            aria-hidden="true"
          />

          <div className="grc-panel__heading">
            <MessageCircle
              size={24}
              strokeWidth={1.5}
              aria-hidden="true"
            />

            <span className="grc-eyebrow">
              ORDER UPDATES
            </span>
          </div>

          <h2 id="grc-orders-title">
            A more personal way to shop.
          </h2>

          <p>
            When you continue from your shopping
            bag to WhatsApp, you send Golden Rose
            an enquiry about your selected fragrances.
          </p>

          <p>
            The Golden Rose team will confirm stock
            availability, final pricing, delivery
            and payment arrangements directly
            in your WhatsApp conversation.
          </p>

          <p>
            This website does not currently record
            WhatsApp enquiries as completed purchases.
            There are no online payment records
            or tracking updates to display here.
          </p>

          <Link
            href="/cart"
            className="grc-button grc-button--gold"
          >
            Open my fragrance bag
            <ArrowUpRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </section>

        <div
          className="grc-quick-grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          }}
        >
          <Link
            href="/shop"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <ShoppingBag size={23} />
            </span>

            <div>
              <h2>Discover perfumes</h2>
              <p>
                Explore the available Golden Rose
                collection.
              </p>
            </div>

            <ArrowRight
              size={17}
              className="grc-quick-card__arrow"
            />
          </Link>

          <Link
            href="/account/settings"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <PackageOpen size={23} />
            </span>

            <div>
              <h2>Your account</h2>
              <p>
                Keep your customer details
                and preferences accessible.
              </p>
            </div>

            <ArrowRight
              size={17}
              className="grc-quick-card__arrow"
            />
          </Link>
        </div>
      </div>
    </CustomerAccountShell>
  );
}
