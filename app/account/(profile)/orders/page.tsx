import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  PackageOpen,
  ShoppingBag,
} from 'lucide-react';

import {
  CustomerAccountShell,
} from '@/src/components/customer-account-shell';

import {
  formatPrice,
} from '@/src/lib/golden-rose/contracts';

import {
  requireCustomer,
} from '@/src/lib/customer/session';

import {
  createClient,
} from '@/src/lib/supabase/server';

export const metadata: Metadata = {
  title: 'My Orders — Golden Rose Perfume',
};

interface EnquiryItem {
  name: string;
  quantity: number;
  sizeMl: number | null;
  sku: string | null;
  priceMinor: number;
}

interface Enquiry {
  reference: string;
  createdAt: string;
  updatedAt: string;

  status:
    | 'prepared'
    | 'contacted'
    | 'confirmed'
    | 'cancelled';

  totalMinor: number;
  currency: 'NGN';
  delivery: string;
  items: EnquiryItem[];
}

interface EnquiryPage {
  items: Enquiry[];
  hasMore: boolean;
}

const statuses: Record<
  Enquiry['status'],
  {
    name: string;
    detail: string;
  }
> = {
  prepared: {
    name: 'Enquiry prepared',

    detail:
      'This request was saved, but the WhatsApp message still needs to be sent.',
  },

  contacted: {
    name: 'In conversation',

    detail:
      'The boutique has started reviewing your request. Check your WhatsApp chat.',
  },

  confirmed: {
    name: 'Confirmed by the boutique',

    detail:
      'The team confirmed the request. This does not establish that payment was received.',
  },

  cancelled: {
    name: 'Cancelled',

    detail:
      'This enquiry has been closed without being recorded as a purchase.',
  },
};

/* =========================================================
   RESPONSE VALIDATION
   ========================================================= */

function validEnquiry(
  value: unknown,
): value is Enquiry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Enquiry>;

  return (
    typeof row.reference === 'string' &&
    /^GR-WA-\d+$/.test(row.reference) &&

    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string' &&

    typeof row.status === 'string' &&
    Object.hasOwn(statuses, row.status) &&

    row.currency === 'NGN' &&

    Number.isSafeInteger(row.totalMinor) &&
    (row.totalMinor ?? -1) >= 0 &&

    Array.isArray(row.items) &&

    row.items.every(
      item =>
        Boolean(item) &&
        typeof item.name === 'string' &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        Number.isSafeInteger(item.priceMinor) &&
        item.priceMinor >= 0,
    )
  );
}

/* =========================================================
   AUTHENTICATED ENQUIRY HISTORY
   ========================================================= */

async function loadEnquiries(
  offset: number,
): Promise<EnquiryPage> {
  const client = await createClient();

  const { data, error } = await client.rpc(
    'gr_whatsapp_enquiry_my',
    {
      p_limit: 20,
      p_offset: offset,
    },
  );

  if (error) {
    if (
      ['PGRST202', '42883'].includes(error.code ?? '')
    ) {
      throw new Error(
        'WhatsApp order tracking has not been enabled yet.',
      );
    }

    throw new Error(
      'Your order enquiries are temporarily unavailable. Please retry.',
    );
  }

  if (
    !data ||
    !Array.isArray(data.items) ||
    typeof data.hasMore !== 'boolean' ||
    !data.items.every(validEnquiry)
  ) {
    throw new Error(
      'The enquiry history could not be verified.',
    );
  }

  return {
    items: data.items as Enquiry[],
    hasMore: data.hasMore,
  };
}

/* =========================================================
   ORDER CARD
   ========================================================= */

function EnquiryCard({
  enquiry,
}: {
  enquiry: Enquiry;
}) {
  const status = statuses[enquiry.status];

  return (
    <article className="min-w-0 rounded-2xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--gr-theme-gold)]">
            Reference
          </p>

          <h3 className="mt-1 break-words font-serif text-xl text-[var(--gr-theme-text)]">
            {enquiry.reference}
          </h3>

          <p className="mt-1 text-xs text-[var(--gr-theme-muted)]">
            {new Date(enquiry.createdAt).toLocaleString(
              'en-NG',
              {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Lagos',
              },
            )}
          </p>
        </div>

        <span className="max-w-full rounded-lg border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--gr-theme-gold)]">
          {status.name}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--gr-theme-muted)]">
        {status.detail}
      </p>

      <ul className="mt-4 grid gap-3 border-t border-[var(--gr-theme-border)] pt-4 text-sm text-[var(--gr-theme-text)]">
        {enquiry.items.map((item, index) => (
          <li
            key={`${enquiry.reference}-${index}`}
            className="flex min-w-0 flex-wrap justify-between gap-2 sm:flex-nowrap sm:gap-4"
          >
            <span className="min-w-0 break-words">
              {item.name}

              {item.sizeMl
                ? ` · ${item.sizeMl} ml`
                : ''}

              {' × '}
              {item.quantity}
            </span>

            <span className="shrink-0 font-semibold">
              {formatPrice(
                item.priceMinor * item.quantity,
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gr-theme-border)] pt-4">
        <span className="text-sm text-[var(--gr-theme-muted)]">
          Estimated product total · Not a paid receipt
        </span>

        <strong className="text-lg text-[var(--gr-theme-text)]">
          {formatPrice(enquiry.totalMinor)}
        </strong>
      </div>

      {enquiry.delivery && (
        <p className="mt-3 break-words text-xs text-[var(--gr-theme-muted)]">
          Requested delivery: {enquiry.delivery}
        </p>
      )}
    </article>
  );
}

/* =========================================================
   CUSTOMER ORDER PAGE
   ========================================================= */

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default function AccountOrdersPage(props: Props) {
  return (
    <Suspense
      fallback={
        <p
          className="grc-loading"
          role="status"
        >
          Loading your orders…
        </p>
      }
    >
      <AccountOrders {...props} />
    </Suspense>
  );
}

async function AccountOrders({
  searchParams,
}: Props) {
  const customer = await requireCustomer();
  const params = await searchParams;

  const rawPage = Number(params.page ?? '1');

  const page =
    Number.isSafeInteger(rawPage) &&
    rawPage >= 1 &&
    rawPage <= 5000
      ? rawPage
      : 1;

  const offset = (page - 1) * 20;

  let history: EnquiryPage | null = null;
  let error = '';

  try {
    history = await loadEnquiries(offset);

  } catch (reason) {
    error =
      reason instanceof Error
        ? reason.message
        : 'Order history could not be loaded.';
  }

  return (
    <CustomerAccountShell
      active="orders"
      name={customer.name}
    >
      <div className="grc-page min-w-0">
        <header className="grc-page__heading">
          <p className="grc-eyebrow">
            YOUR FRAGRANCE JOURNEY
          </p>

          <h1>My orders.</h1>

          <p>
            Follow the fragrance enquiries you prepared
            on Golden Rose. The boutique confirms stock,
            delivery, final prices and payment in WhatsApp.
          </p>
        </header>

        {error ? (
          <section
            className="grc-orders-empty"
            role="alert"
          >
            <h2>Enquiry history unavailable</h2>

            <p>{error}</p>

            <Link
              href={`/account/orders?page=${page}`}
              className="grc-button grc-button--gold"
            >
              Try again
            </Link>
          </section>
        ) : history?.items.length ? (
          <section
            aria-labelledby="grc-orders-title"
            className="grid min-w-0 gap-4"
          >
            <h2
              id="grc-orders-title"
              className="font-serif text-2xl text-[var(--gr-theme-text)]"
            >
              Your WhatsApp enquiries
            </h2>

            {history.items.map(enquiry => (
              <EnquiryCard
                key={enquiry.reference}
                enquiry={enquiry}
              />
            ))}

            <nav
              className="flex flex-wrap justify-between gap-3"
              aria-label="Order history pages"
            >
              {page > 1 ? (
                <Link
                  className="grc-button grc-button--soft"
                  href={`/account/orders?page=${page - 1}`}
                >
                  <ArrowLeft size={16} />
                  Previous
                </Link>
              ) : (
                <span />
              )}

              {history.hasMore && (
                <Link
                  className="grc-button grc-button--soft"
                  href={`/account/orders?page=${page + 1}`}
                >
                  Next
                  <ArrowRight size={16} />
                </Link>
              )}
            </nav>
          </section>
        ) : (
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
                ORDER ENQUIRIES
              </span>
            </div>

            <h2 id="grc-orders-title">
              Your fragrance journey starts here.
            </h2>

            <p>
              {page > 1
                ? 'No WhatsApp enquiries on this page.'
                : 'No WhatsApp enquiries are attached to this account yet.'}
            </p>

            <p>
              Prepare an enquiry from your shopping bag,
              open WhatsApp, and send the prepared message
              to the boutique. An enquiry is not a
              confirmed sale or payment.
            </p>

            {page > 1 && (
              <Link
                href={`/account/orders?page=${page - 1}`}
                className="grc-text-link"
              >
                Previous page
              </Link>
            )}

            <Link
              href="/account/shop?view=bag"
              className="grc-button grc-button--gold"
            >
              Open my fragrance bag

              <ArrowUpRight
                size={16}
                aria-hidden="true"
              />
            </Link>
          </section>
        )}

        {/* CUSTOMER SHOPPING SHORTCUTS */}

        <div
          className="grc-quick-grid"
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
          }}
        >
          <Link
            href="/account/shop"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <ShoppingBag size={23} />
            </span>

            <div>
              <h2>Discover perfumes</h2>

              <p>
                Explore the Golden Rose collection.
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
                Update your customer details and preferences.
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