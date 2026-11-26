
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ArrowLeft,
  MessageCircle,
  RefreshCcw,
} from 'lucide-react';

import {
  canViewModule,
} from '@/src/domain/permissions';

import {
  formatPrice,
} from '@/src/lib/golden-rose/contracts';

import {
  requireStaff,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  updateWhatsAppEnquiryStatus,
} from './actions';

export const metadata: Metadata = {
  title: 'WhatsApp Enquiries | Golden Rose Perfume',
  description:
    'Private, staff-authorized WhatsApp enquiry management.',
};

const statuses = [
  'all',
  'prepared',
  'contacted',
  'confirmed',
  'cancelled',
] as const;

type Status = (typeof statuses)[number];

type EnquiryItem = {
  name: string;
  quantity: number;
  sizeMl: number | null;
  sku: string | null;
  priceMinor: number;
};

type Enquiry = {
  id: string;
  reference: string;
  createdAt: string;
  updatedAt: string;

  status: Exclude<Status, 'all'>;

  customerName: string;
  phone: string;
  email: string | null;
  delivery: string;

  totalMinor: number;
  currency: 'NGN';

  items: EnquiryItem[];
};

type EnquiryList = {
  items: Enquiry[];
  hasMore: boolean;
};

const statusNames: Record<Status, string> = {
  all: 'All enquiries',
  prepared: 'Prepared',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

async function fetchEnquiries(
  status: Status,
  offset: number,
): Promise<EnquiryList> {
  const client = await createClient();

  const { data, error } = await client.rpc(
    'gr_whatsapp_enquiry_staff',
    {
      p_limit: 25,
      p_offset: offset,
      p_status: status,
    },
  );

  if (error) {
    if (
      ['PGRST202', '42883'].includes(error.code ?? '')
    ) {
      throw new Error(
        'The WhatsApp enquiries migration has not been installed.',
      );
    }

    throw new Error(
      'Unable to load the WhatsApp enquiries inbox. Please retry.',
    );
  }

  if (
    !data ||
    !Array.isArray(data.items) ||
    typeof data.hasMore !== 'boolean'
  ) {
    throw new Error(
      'The order enquiry service returned an unexpected response.',
    );
  }

  return {
    items: data.items as Enquiry[],
    hasMore: data.hasMore,
  };
}

export default function WhatsAppEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    notice?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-6 text-sm text-gr-muted"
        >
          Loading WhatsApp enquiries…
        </p>
      }
    >
      <StaffEnquiries searchParams={searchParams} />
    </Suspense>
  );
}

async function StaffEnquiries({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    notice?: string;
  }>;
}) {
  const staff = await requireStaff();

  if (!canViewModule(staff.role, 'orders')) {
    notFound();
  }

  const params = await searchParams;

  const status: Status =
    statuses.includes(params.status as Status)
      ? (params.status as Status)
      : 'all';

  const possiblePage = Number(
    params.page ?? '1',
  );

  const page =
    Number.isSafeInteger(possiblePage) &&
    possiblePage >= 1 &&
    possiblePage <= 4000
      ? possiblePage
      : 1;

  let data: EnquiryList | null = null;
  let error = '';

  try {
    data = await fetchEnquiries(
      status,
      (page - 1) * 25,
    );
  } catch (reason) {
    error =
      reason instanceof Error
        ? reason.message
        : 'The enquiry inbox is unavailable.';
  }

  const notice =
    params.notice === 'updated'
      ? 'Enquiry status updated. No payment or stock adjustment was recorded.'
      : params.notice === 'failed'
        ? 'The status update was rejected. Refresh and check the enquiry state.'
        : params.notice === 'invalid'
          ? 'Select a valid status action.'
          : '';

  const href = (nextPage: number) =>
    `/workspace/orders/whatsapp?status=${status}&page=${nextPage}`;

  return (
    <main className="grid min-w-0 gap-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gr-gold">
            SALES OPERATIONS / CUSTOMER REQUESTS
          </p>

          <h1 className="mt-2 font-serif text-3xl text-gr-text">
            WhatsApp enquiries.
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gr-muted">
            Track prepared requests separately from
            verified POS sales. Opening WhatsApp is not
            proof that a customer sent a message or
            completed payment.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/workspace/orders"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text"
          >
            <ArrowLeft size={16} />

            POS sales history
          </Link>

          <Link
            href="/workspace/orders/whatsapp"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gr-strong px-4 text-sm font-semibold text-gr-on-strong"
          >
            <RefreshCcw size={16} />

            Refresh inbox
          </Link>
        </div>
      </div>

      {notice && (
        <p
          role={
            params.notice === 'updated'
              ? 'status'
              : 'alert'
          }
          className="rounded-xl border border-gr-border bg-gr-surface p-4 text-sm text-gr-gold"
        >
          {notice}
        </p>
      )}

      <nav
        aria-label="Enquiry status filters"
        className="flex flex-wrap gap-2"
      >
        {statuses.map((option) => (
          <Link
            key={option}
            href={
              `/workspace/orders/whatsapp?status=${option}`
            }
            aria-current={
              status === option
                ? 'page'
                : undefined
            }
            className={
              status === option
                ? 'rounded-full bg-gr-strong px-4 py-2 text-xs font-semibold text-gr-on-strong'
                : 'rounded-full border border-gr-border bg-gr-surface px-4 py-2 text-xs font-semibold text-gr-text'
            }
          >
            {statusNames[option]}
          </Link>
        ))}
      </nav>

      {error ? (
        <section
          role="alert"
          className="rounded-2xl border border-gr-border bg-gr-surface p-6"
        >
          <h2 className="font-serif text-xl text-gr-text">
            Enquiries unavailable
          </h2>

          <p className="mt-2 text-sm text-gr-muted">
            {error}
          </p>
        </section>
      ) : data?.items.length ? (
        <div className="grid gap-4">
          {data.items.map((enquiry) => (
            <article
              key={enquiry.id}
              className="grid gap-4 rounded-2xl border border-gr-border bg-gr-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gr-gold">
                    {enquiry.reference}
                  </p>

                  <h2 className="mt-1 font-serif text-xl text-gr-text">
                    {enquiry.customerName}
                  </h2>

                  <p className="mt-1 text-xs text-gr-muted">
                    {new Date(
                      enquiry.createdAt,
                    ).toLocaleString(
                      'en-NG',
                      {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Africa/Lagos',
                      },
                    )}
                  </p>
                </div>

                <span className="rounded-full border border-gr-border bg-gr-surface-alt px-3 py-2 text-xs font-semibold text-gr-gold">
                  {statusNames[enquiry.status]}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gr-muted">
                <span>
                  <strong className="text-gr-text">
                    Phone:
                  </strong>
                  {' '}
                  {enquiry.phone}
                </span>

                {enquiry.email && (
                  <span>
                    <strong className="text-gr-text">
                      Email:
                    </strong>
                    {' '}
                    {enquiry.email}
                  </span>
                )}

                {enquiry.delivery && (
                  <span>
                    <strong className="text-gr-text">
                      Delivery:
                    </strong>
                    {' '}
                    {enquiry.delivery}
                  </span>
                )}
              </div>

              <ul className="grid gap-2 border-y border-gr-border py-3">
                {enquiry.items.map(
                  (item, index) => (
                    <li
                      key={
                        enquiry.id + '-' + index
                      }
                      className="flex flex-wrap justify-between gap-2 text-sm text-gr-text"
                    >
                      <span>
                        {item.name}

                        {item.sizeMl
                          ? ` · ${item.sizeMl} ml`
                          : ''}

                        {' × '}
                        {item.quantity}
                      </span>

                      <strong>
                        {formatPrice(
                          item.priceMinor *
                            item.quantity,
                        )}
                      </strong>
                    </li>
                  ),
                )}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gr-muted">
                  Estimated product total

                  <strong className="ml-2 text-gr-text">
                    {formatPrice(
                      enquiry.totalMinor,
                    )}
                  </strong>

                  <span className="ml-2 text-xs">
                    (not a receipt)
                  </span>
                </p>

                <div className="flex flex-wrap gap-2">
                  {enquiry.status === 'prepared' && (
                    <form
                      action={
                        updateWhatsAppEnquiryStatus
                      }
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={enquiry.id}
                      />

                      <input
                        type="hidden"
                        name="status"
                        value="contacted"
                      />

                      <button
                        type="submit"
                        className="min-h-10 rounded-lg bg-gr-strong px-4 text-xs font-bold text-gr-on-strong"
                      >
                        Mark contacted
                      </button>
                    </form>
                  )}

                  {enquiry.status === 'contacted' && (
                    <form
                      action={
                        updateWhatsAppEnquiryStatus
                      }
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={enquiry.id}
                      />

                      <input
                        type="hidden"
                        name="status"
                        value="confirmed"
                      />

                      <button
                        type="submit"
                        className="min-h-10 rounded-lg bg-gr-strong px-4 text-xs font-bold text-gr-on-strong"
                      >
                        Confirm enquiry
                      </button>
                    </form>
                  )}

                  {[
                    'prepared',
                    'contacted',
                  ].includes(
                    enquiry.status,
                  ) && (
                    <form
                      action={
                        updateWhatsAppEnquiryStatus
                      }
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={enquiry.id}
                      />

                      <input
                        type="hidden"
                        name="status"
                        value="cancelled"
                      />

                      <button
                        type="submit"
                        className="min-h-10 rounded-lg border border-gr-border bg-gr-surface px-4 text-xs font-bold text-gr-danger"
                      >
                        Cancel enquiry
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <p className="flex items-start gap-2 text-xs text-gr-gold">
                <MessageCircle
                  size={15}
                  className="mt-0.5 flex-none"
                />

                Staff must independently verify
                the WhatsApp conversation. Confirmation
                here does not charge the customer
                or deduct stock.
              </p>
            </article>
          ))}

          <nav
            className="flex justify-between gap-2"
            aria-label="Enquiry inbox pages"
          >
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                className="rounded-lg border border-gr-border bg-gr-surface px-4 py-2 text-sm"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}

            {data.hasMore ? (
              <Link
                href={href(page + 1)}
                className="rounded-lg border border-gr-border bg-gr-surface px-4 py-2 text-sm"
              >
                Next
              </Link>
            ) : null}
          </nav>
        </div>
      ) : (
        <section className="rounded-2xl border border-gr-border bg-gr-surface p-8 text-center">
          <MessageCircle
            className="mx-auto text-gr-gold"
            size={30}
          />

          <h2 className="mt-3 font-serif text-2xl text-gr-text">
            No enquiries in this view
          </h2>

          <p className="mt-2 text-sm text-gr-muted">
            Customer requests appear here after
            the checkout enquiry has been recorded.
          </p>
        </section>
      )}
    </main>
  );
}
