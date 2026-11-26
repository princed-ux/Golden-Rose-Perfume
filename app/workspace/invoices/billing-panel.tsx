'use client';

import { ActionButton } from '@/src/components/action-feedback';
import { useState, type FormEvent } from 'react';

import {
  billingFilters,
  billingMinor,
  billingStatus,
  invoiceNumber,
  quoteReference,
  type BillingAction,
  type BillingDocument,
  type BillingFilters,
  type BillingPayload,
  type BillingRegisterData,
} from '@/src/lib/golden-rose/billing';

import {
  draftUnitPrice,
} from '@/src/lib/golden-rose/invoice-draft';

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileText,
  Settings2,
} from 'lucide-react';

/* =========================================================
   GOLDEN ROSE PERFUME — BILLING CONTROLS
   ========================================================= */

const box =
  'grid min-w-0 gap-4 rounded-2xl border border-gr-border bg-gr-surface p-4 sm:p-6';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gr-border bg-gr-surface px-3 py-2 text-sm font-semibold text-gr-text hover:bg-gr-accent-soft disabled:opacity-45';

const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gr-strong-hover px-4 py-2 text-sm font-semibold text-gr-on-strong hover:bg-gr-strong-hover disabled:opacity-45';

const field =
  'min-h-11 w-full min-w-0 rounded-xl border border-gr-border bg-gr-surface px-3 py-2 text-sm text-gr-text';

const label =
  'grid min-w-0 gap-1.5 text-xs font-semibold text-gr-muted';

const formatter =
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  });

const money = (minor: number) =>
  formatter.format(minor / 100);

/* =========================================================
   REUSABLE BUSINESS BILLING CONFIGURATION
   ========================================================= */

function BillingSetup({
  store,
  busy,
  configure,
}: {
  store: BillingRegisterData['stores'][number];
  busy: boolean;
  configure: (payload: BillingPayload) => void;
}) {
  function saveConfiguration(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const values =
      new FormData(event.currentTarget);

    configure({
      storeId: store.id,
      name: values.get('name'),
      address: values.get('address'),
      contact: values.get('contact'),
      taxId: values.get('taxId'),
      taxBasis: values.get('taxBasis'),

      taxBps: billingMinor(
        String(values.get('taxRate') ?? ''),
      ),
    });
  }

  return (
    <form
      key={store.id}
      onSubmit={saveConfiguration}
      className="grid min-w-0 gap-4"
    >
      <fieldset
        disabled={busy}
        className="grid min-w-0 gap-3 sm:grid-cols-2"
      >
        <label className={label}>
          Registered business name *

          <input
            className={field}
            name="name"
            required
            minLength={2}
            maxLength={150}
            defaultValue={store.identity?.name}
            placeholder="e.g. Golden Rose Perfume"
          />
        </label>

        <label className={label}>
          Business phone or email *

          <input
            className={field}
            name="contact"
            required
            minLength={3}
            maxLength={254}
            defaultValue={store.identity?.contact}
            placeholder="Business contact details"
          />
        </label>

        <label className={`${label} sm:col-span-2`}>
          Business address *

          <textarea
            className={field}
            name="address"
            rows={3}
            required
            minLength={5}
            maxLength={500}
            defaultValue={store.identity?.address}
            placeholder="Store address, city and state"
          />
        </label>

        <label className={label}>
          Tax identification number

          <input
            className={field}
            name="taxId"
            maxLength={100}
            defaultValue={store.identity?.taxId}
            placeholder="Optional, where applicable"
          />
        </label>

        <label className={label}>
          Verified tax rate (%) *

          <input
            className={field}
            name="taxRate"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            defaultValue={
              store.taxBps === null
                ? undefined
                : draftUnitPrice(store.taxBps)
            }
            placeholder="Enter applicable tax rate"
          />
        </label>

        <label className={`${label} sm:col-span-2`}>
          Tax verification reference *

          <textarea
            className={field}
            name="taxBasis"
            rows={2}
            required
            minLength={3}
            maxLength={500}
            defaultValue={store.taxBasis ?? undefined}
            placeholder="Applicable tax rule or verified accountant reference"
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-gr-border bg-gr-surface p-3 text-xs leading-5 sm:col-span-2">
          <input
            type="checkbox"
            required
            className="mt-1 accent-[#53203a]"
          />

          <span>
            I confirm that the business details
            and applicable tax treatment have
            been verified.
          </span>
        </label>
      </fieldset>

      <ActionButton
        className={primary}
        disabled={busy}
      >
        <CheckCircle2 size={17} />
        Save business billing details
      </ActionButton>

      <p className="text-xs leading-5 text-gr-muted">
        These details are reused for future documents
        from this store. Enter zero tax only when
        that treatment has been verified.
      </p>
    </form>
  );
}

/* =========================================================
   DOCUMENT REGISTER
   ========================================================= */

export function BillingRegister({
  data,
  filters,
  busy,
  apply,
  open,
  configure,
}: {
  data: BillingRegisterData;
  filters: BillingFilters;
  busy: boolean;
  apply: (next: BillingFilters) => void;
  open: (id: string) => void;
  configure: (payload: BillingPayload) => void;
}) {
  const [storeId, setStoreId] =
    useState(
      data.stores.find(store => store.active)?.id ?? '',
    );

  const selectedStore =
    data.stores.find(store => store.id === storeId);

  const configurationRequired =
    data.stores.some(
      store =>
        store.active &&
        (
          store.taxBps === null ||
          !store.identity
        ),
    );

  function filter(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const values =
      new FormData(event.currentTarget);

    apply({
      search: String(
        values.get('search') ?? '',
      ).trim(),

      kind: String(
        values.get('kind'),
      ) as BillingFilters['kind'],

      status: String(
        values.get('status'),
      ) as BillingFilters['status'],

      storeId: String(values.get('storeId') ?? ''),
      from: String(values.get('from') ?? ''),
      to: String(values.get('to') ?? ''),
      page: 0,
    });
  }

  return (
    <section
      className={box}
      aria-busy={busy}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gr-gold">
          Customer documents
        </p>

        <h2 className="font-serif text-2xl text-gr-text">
          Invoices &amp; Quotations
        </h2>

        <p className="mt-1 text-sm text-gr-muted">
          Find saved documents, issue invoices and
          manage customer payments.
        </p>
      </div>

      {/* INITIAL BILLING CONFIGURATION */}

      {data.canConfigure && (
        <details
          id="billing-configuration"
          open={configurationRequired || undefined}
          className="rounded-xl border border-gr-border bg-gr-surface p-4 text-gr-text"
        >
          <summary className="cursor-pointer font-semibold">
            {configurationRequired
              ? 'Complete business billing setup'
              : 'Business billing details'}
          </summary>

          <div className="mt-4 grid gap-4">
            {configurationRequired ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-gr-border bg-gr-surface-alt p-3 text-sm"
              >
                <CircleAlert
                  size={19}
                  className="mt-0.5 shrink-0"
                />

                <p>
                  Complete this one-time setup to
                  issue official invoices. Drafts can
                  still be prepared and saved.
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-gr-success">
                <CheckCircle2 size={17} />
                Billing configuration available
              </p>
            )}

            <label className={label}>
              Selling location

              <select
                className={field}
                value={storeId}
                disabled={busy}
                onChange={event =>
                  setStoreId(event.target.value)
                }
              >
                <option value="">
                  Select a store
                </option>

                {data.stores
                  .filter(store => store.active)
                  .map(store => (
                    <option
                      key={store.id}
                      value={store.id}
                    >
                      {store.name}
                    </option>
                  ))}
              </select>
            </label>

            {selectedStore?.active && (
              <BillingSetup
                key={selectedStore.id}
                store={selectedStore}
                busy={busy}
                configure={configure}
              />
            )}
          </div>
        </details>
      )}

      {/* DOCUMENT SEARCH AND FILTERS */}

      <form
        key={JSON.stringify({ ...filters, page: 0 })}
        onSubmit={filter}
        className="grid min-w-0 gap-3 rounded-xl border border-gr-border bg-gr-surface p-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className={`${label} sm:col-span-2`}>
          Customer or invoice number

          <input
            className={field}
            name="search"
            maxLength={120}
            defaultValue={filters.search}
            placeholder="Customer name or document number"
            type="search"
          />
        </label>

        <label className={label}>
          Document type

          <select
            className={field}
            name="kind"
            defaultValue={filters.kind}
          >
            <option value="">All documents</option>
            <option value="quotation">Quotations</option>
            <option value="invoice">Invoices</option>
          </select>
        </label>

        <label className={label}>
          Document status

          <select
            className={field}
            name="status"
            defaultValue={filters.status}
          >
            <option value="">All statuses</option>

            {Object.entries(billingStatus).map(
              ([status, name]) => (
                <option
                  key={status}
                  value={status}
                >
                  {name}
                </option>
              ),
            )}
          </select>
        </label>

        <label className={label}>
          Selling location

          <select
            className={field}
            name="storeId"
            defaultValue={filters.storeId}
          >
            <option value="">
              All permitted stores
            </option>

            {data.stores.map(store => (
              <option
                key={store.id}
                value={store.id}
              >
                {store.name}
                {store.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          From

          <input
            className={field}
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>

        <label className={label}>
          To

          <input
            className={field}
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <ActionButton
            className={primary}
            disabled={busy}
          >
            Search
          </ActionButton>

          <ActionButton
            className={button}
            type="button"
            disabled={busy}
            onClick={() => apply(billingFilters)}
          >
            Clear
          </ActionButton>
        </div>
      </form>

      {/* SAVED DOCUMENTS */}

      {!data.documents.length ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-gr-border p-8 text-center">
          <FileText
            size={32}
            className="text-gr-gold"
          />

          <strong className="text-gr-text">
            No matching documents
          </strong>

          <p className="max-w-md text-sm text-gr-muted">
            Create a new quotation or invoice,
            or change the filters to find an
            existing document.
          </p>
        </div>
      ) : (
        <ul className="grid divide-y divide-gr-border rounded-xl border border-gr-border bg-gr-surface">
          {data.documents.map(doc => (
            <li
              key={doc.id}
              className="grid min-w-0 gap-3 p-4 text-sm text-gr-text sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0 break-words">
                <strong>
                  {doc.recipient}
                </strong>

                <p className="mt-1 text-xs">
                  {invoiceNumber(doc.invoice_number) ||
                    (
                      doc.kind === 'invoice'
                        ? 'Saved invoice draft'
                        : quoteReference(doc.id)
                    )}
                  {' · '}
                  {doc.location_name}
                </p>
              </div>

              <div>
                <span
                  className={
                    'inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ' +
                    (
                      doc.state === 'draft'
                        ? 'bg-gr-surface-alt text-gr-gold'

                        : doc.state === 'voided'
                          ? 'bg-gr-danger-bg text-gr-danger'

                          : 'bg-gr-success-bg text-gr-success'
                    )
                  }
                >
                  {billingStatus[doc.status]}
                </span>

                <time
                  className="mt-1 block text-xs"
                  dateTime={doc.issue_date}
                >
                  {doc.issue_date}
                </time>
              </div>

              <div className="tabular-nums">
                <strong>
                  {money(doc.total_minor)}
                </strong>

                {doc.balance_minor !== null && (
                  <p className="text-xs">
                    Balance {money(doc.balance_minor)}
                  </p>
                )}
              </div>

              <ActionButton
                type="button"
                className={button}
                disabled={busy}
                onClick={() => open(doc.id)}
                aria-label={
                  'Open ' +
                  (
                    invoiceNumber(doc.invoice_number) ||
                    doc.kind
                  ) +
                  ' for ' +
                  doc.recipient
                }
              >
                {doc.state === 'draft'
                  ? 'Continue'
                  : 'View document'}

                <ArrowRight size={15} />
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {/* PAGINATION */}

      {(data.page > 0 || data.more) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ActionButton
            type="button"
            className={button}
            disabled={busy || data.page === 0}
            onClick={() =>
              apply({
                ...filters,
                page: data.page - 1,
              })
            }
          >
            Previous
          </ActionButton>

          <span>
            Page {data.page + 1}
          </span>

          <ActionButton
            type="button"
            className={button}
            disabled={busy || !data.more}
            onClick={() =>
              apply({
                ...filters,
                page: data.page + 1,
              })
            }
          >
            Next
          </ActionButton>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   INDIVIDUAL DOCUMENT CONTROLS
   ========================================================= */

export function BillingDocumentControls({
  doc,
  data,
  busy,
  run,
  edit,
}: {
  doc: BillingDocument;
  data: BillingRegisterData;
  busy: boolean;
  run: (
    action: BillingAction,
    payload: BillingPayload,
  ) => void;
  edit: () => void;
}) {
  const [confirmIssue, setConfirmIssue] =
    useState(false);

  const [mode, setMode] =
    useState<'pos' | 'offline' | 'void' | null>(null);

  const [review, setReview] =
    useState<string | null>(null);

  const base = {
    id: doc.id,
    revision: doc.revision,
  };

  const activeStore =
    data.stores.find(
      store => store.id === doc.location_id,
    );

  const storeConfigured =
    Boolean(
      activeStore?.identity &&
      activeStore.taxBps !== null,
    );

  const getValues = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    return new FormData(
      event.currentTarget,
    );
  };

  return (
    <section
      className={box}
      aria-busy={busy}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gr-gold">
          {doc.location_name}
          {' · '}
          {billingStatus[doc.status]}
        </p>

        <h2 className="font-serif text-2xl text-gr-text">
          {invoiceNumber(doc.invoice_number) ||
            (
              doc.kind === 'quotation'
                ? 'Saved quotation'
                : 'Saved invoice'
            )}
        </h2>

        {doc.original_quote_id && (
          <p className="mt-1 break-all text-sm">
            Original quotation:{' '}
            {quoteReference(doc.original_quote_id)}
          </p>
        )}
      </div>

      {/* DOCUMENT TOTALS */}

      <div className="grid gap-3 rounded-xl border border-gr-border bg-gr-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gr-muted">
            Document total
          </span>

          <strong className="break-all text-xl tabular-nums text-gr-text">
            {money(doc.total_minor)}
          </strong>
        </div>

        {doc.state === 'issued' && (
          <>
            <div className="flex justify-between gap-3 border-t border-gr-border pt-3 text-sm">
              <span>Amount paid</span>

              <strong>
                {money(doc.paid_minor)}
              </strong>
            </div>

            <div className="flex justify-between gap-3 text-sm">
              <span>Outstanding balance</span>

              <strong className="text-gr-gold">
                {doc.balance_minor === null
                  ? 'Unavailable'
                  : money(doc.balance_minor)}
              </strong>
            </div>
          </>
        )}
      </div>

      {!activeStore?.active && (
        <p className="rounded-xl bg-gr-surface p-3 text-sm">
          The selling location is unavailable or
          inactive. This document is available
          for reference only.
        </p>
      )}

      {/* DRAFT COMPLETION */}

      {doc.state === 'draft' &&
        activeStore?.active && (
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 text-sm leading-6 text-gr-gold">
              <FileText
                size={20}
                className="mt-0.5 shrink-0"
              />

              <div>
                <strong className="block">
                  Saved successfully
                </strong>

                {doc.kind === 'invoice'
                  ? 'Review and issue this invoice when ready. The official invoice number will be generated automatically.'

                  : 'Review this quotation and record the customer’s acceptance when confirmed.'}
              </div>
            </div>

            {/* BILLING CONFIGURATION BLOCKER */}

            {doc.tax_bps === null && (
              <div className="grid gap-4 rounded-xl border border-gr-border bg-gr-surface p-4">
                <div className="flex items-start gap-3">
                  <Settings2
                    size={20}
                    className="mt-0.5 shrink-0 text-gr-gold"
                  />

                  <div>
                    <h3 className="font-semibold text-gr-text">
                      {storeConfigured
                        ? 'Update the saved document'

                        : 'Complete billing setup'}
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-gr-muted">
                      {storeConfigured
                        ? 'The store billing details are now available. Edit and save this draft again to apply them.'

                        : 'Before issuing official documents, the store needs verified business information and tax treatment.'}
                    </p>
                  </div>
                </div>

                {!storeConfigured && data.canConfigure && (
                  <BillingSetup
                    store={activeStore}
                    busy={busy}
                    configure={payload =>
                      run('configure', payload)
                    }
                  />
                )}

                {!storeConfigured && !data.canConfigure && (
                  <p className="rounded-lg bg-gr-surface p-3 text-sm text-gr-gold">
                    Ask an authorized administrator
                    to complete the business billing
                    details. Your saved draft will
                    remain available.
                  </p>
                )}
              </div>
            )}

            {!doc.original_quote_id && (
              <ActionButton
                type="button"
                className={button}
                disabled={busy}
                onClick={edit}
              >
                {doc.tax_bps === null && storeConfigured
                  ? 'Update and save invoice'
                  : 'Edit document'}
              </ActionButton>
            )}

            {/* QUOTATION ACCEPTANCE */}

            {doc.tax_bps !== null &&
              doc.kind === 'quotation' && (
                <form
                  className="grid gap-3"
                  onSubmit={event => {
                    const values = getValues(event);

                    run('accept', {
                      ...base,
                      reason: values.get('reason'),
                    });
                  }}
                >
                  <label className={label}>
                    Customer acceptance reference

                    <input
                      className={field}
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="e.g. Customer confirmed via WhatsApp"
                    />
                  </label>

                  <ActionButton
                    className={primary}
                    disabled={busy}
                  >
                    Record quotation acceptance
                  </ActionButton>
                </form>
              )}

            {/* OFFICIAL INVOICE ISSUANCE */}

            {doc.tax_bps !== null &&
              doc.kind === 'invoice' && (
                confirmIssue ? (
                  <div className="grid gap-3 rounded-xl border border-gr-border bg-gr-surface-alt p-4 text-sm">
                    <strong className="text-gr-text">
                      Confirm invoice issuance
                    </strong>

                    <p>
                      Issue this invoice for{' '}
                      <strong>
                        {money(doc.total_minor)}
                      </strong>
                      ? An official invoice number
                      will be assigned, and its
                      financial details will be locked.
                    </p>

                    <p className="text-xs text-gr-muted">
                      Issuing an invoice does not
                      automatically record payment.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        type="button"
                        className={primary}
                        disabled={busy}
                        onClick={() =>
                          run('issue', base)
                        }
                      >
                        <FileCheck2 size={17} />
                        Confirm and issue
                      </ActionButton>

                      <ActionButton
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          setConfirmIssue(false)
                        }
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <ActionButton
                    type="button"
                    className={primary}
                    disabled={busy}
                    onClick={() =>
                      setConfirmIssue(true)
                    }
                  >
                    <FileCheck2 size={17} />
                    Issue official invoice
                  </ActionButton>
                )
              )}
          </div>
        )}

      {/* ACCEPTED QUOTATION CONVERSION */}

      {doc.state === 'accepted' &&
        activeStore?.active && (
          <form
            className="grid gap-3"
            onSubmit={event => {
              const values = getValues(event);

              run('convert', {
                ...base,
                dueDate: values.get('dueDate'),
              });
            }}
          >
            <p className="text-sm text-gr-muted">
              The customer has accepted this
              quotation. Create the corresponding
              invoice without re-entering its products.
            </p>

            <label className={label}>
              Invoice payment due date

              <input
                className={field}
                name="dueDate"
                type="date"
                min={data.today}
                required
              />
            </label>

            <ActionButton
              className={primary}
              disabled={busy}
            >
              Create invoice from quotation
            </ActionButton>
          </form>
        )}

      {/* ISSUED INVOICE */}

      {doc.state === 'issued' && (
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-gr-success-border bg-gr-success-bg p-3 text-sm text-gr-success">
            <CheckCircle2
              size={20}
              className="mt-0.5 shrink-0"
            />

            <div>
              <strong className="block">
                Official invoice issued
              </strong>

              This invoice is ready to print or
              save as PDF using the document preview.
            </div>
          </div>

          <h3 className="font-serif text-xl text-gr-text">
            Payments &amp; Reconciliation
          </h3>

          {!doc.payments.length && (
            <p className="text-sm text-gr-muted">
              No payments have been recorded.
            </p>
          )}

          {/* PAYMENT HISTORY */}

          {doc.payments.length > 0 && (
            <ul className="grid gap-2">
              {doc.payments.map(payment => (
                <li
                  className="grid gap-2 break-words rounded-xl border border-gr-border p-3 text-sm"
                  key={payment.id}
                >
                  <strong>
                    {payment.reference}
                    {' · '}
                    {money(payment.amount_minor)}
                  </strong>

                  <span>
                    {payment.source === 'pos'
                      ? 'Completed POS receipt'
                      : 'Offline payment'}
                    {' · '}
                    {payment.status}
                  </span>

                  {payment.evidence && (
                    <p>
                      Evidence reference:{' '}
                      {payment.evidence}
                    </p>
                  )}

                  {payment.review_note && (
                    <p>
                      Review: {payment.review_note}
                    </p>
                  )}

                  {activeStore?.active &&
                    data.canReviewPayments &&
                    payment.canReview && (
                      review === payment.id ? (
                        <form
                          className="grid gap-2"
                          onSubmit={event => {
                            const values = getValues(event);

                            run('review_payment', {
                              ...base,

                              paymentId: payment.id,

                              decision:
                                values.get('decision'),

                              reason:
                                values.get('reason'),
                            });
                          }}
                        >
                          <label className={label}>
                            Payment verification

                            <select
                              className={field}
                              name="decision"
                              required
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select outcome
                              </option>

                              <option value="verified">
                                Payment verified
                              </option>

                              <option value="rejected">
                                Reject evidence
                              </option>
                            </select>
                          </label>

                          <label className={label}>
                            Review note

                            <textarea
                              className={field}
                              name="reason"
                              required
                              minLength={3}
                              maxLength={500}
                            />
                          </label>

                          <ActionButton
                            className={primary}
                            disabled={busy}
                          >
                            Submit review
                          </ActionButton>
                        </form>
                      ) : (
                        <ActionButton
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            setReview(payment.id)
                          }
                        >
                          Review payment
                        </ActionButton>
                      )
                    )}
                </li>
              ))}
            </ul>
          )}

          {/* PAYMENT OPERATIONS */}

          {activeStore?.active && (
            <div className="flex flex-wrap gap-2">
              {!!doc.balance_minor && (
                <>
                  <ActionButton
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      setMode(
                        mode === 'pos' ? null : 'pos',
                      )
                    }
                    aria-expanded={mode === 'pos'}
                  >
                    Apply POS receipt
                  </ActionButton>

                  <ActionButton
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      setMode(
                        mode === 'offline'
                          ? null
                          : 'offline',
                      )
                    }
                    aria-expanded={mode === 'offline'}
                  >
                    Record offline payment
                  </ActionButton>
                </>
              )}

              {data.canConfigure &&
                doc.paid_minor === 0 &&
                !doc.payments.some(
                  payment => payment.status === 'pending',
                ) && (
                  <ActionButton
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      setMode(
                        mode === 'void' ? null : 'void',
                      )
                    }
                    aria-expanded={mode === 'void'}
                  >
                    Void invoice
                  </ActionButton>
                )}
            </div>
          )}

          {/* EXISTING POS PAYMENT ALLOCATION */}

          {activeStore?.active &&
            mode === 'pos' &&
            !!doc.balance_minor && (
              <form
                className="grid gap-3 rounded-xl border border-gr-border p-4"
                onSubmit={event => {
                  const values = getValues(event);

                  run('apply_pos', {
                    ...base,
                    receiptNumber:
                      values.get('receipt'),
                  });
                }}
              >
                <p className="text-sm">
                  Enter the receipt number of an
                  existing completed POS sale from
                  this store. The payment will be
                  allocated without creating a
                  duplicate sale.
                </p>

                <label className={label}>
                  POS receipt number

                  <input
                    className={field}
                    name="receipt"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{1,15}"
                    placeholder="Enter numeric receipt number"
                  />
                </label>

                <ActionButton
                  className={primary}
                  disabled={busy}
                >
                  Apply completed receipt
                </ActionButton>
              </form>
            )}

          {/* OFFLINE PAYMENT SUBMISSION */}

          {activeStore?.active &&
            mode === 'offline' &&
            !!doc.balance_minor && (
              <form
                className="grid gap-3 rounded-xl border border-gr-border p-4"
                onSubmit={event => {
                  const values = getValues(event);

                  run('propose_payment', {
                    ...base,

                    amountMinor: billingMinor(
                      String(values.get('amount') ?? ''),
                    ),

                    reference:
                      values.get('reference'),

                    evidence:
                      values.get('evidence'),
                  });
                }}
              >
                <p className="text-sm">
                  Record the payment evidence.
                  A different authorized reviewer
                  must verify the payment before the
                  invoice balance is updated.
                </p>

                <label className={label}>
                  Amount received (₦)

                  <input
                    className={field}
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="e.g. 150000.00"
                  />
                </label>

                <label className={label}>
                  Payment provider and reference

                  <input
                    className={field}
                    name="reference"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Provider and transaction reference"
                  />
                </label>

                <label className={label}>
                  Payment evidence

                  <textarea
                    className={field}
                    name="evidence"
                    required
                    minLength={10}
                    maxLength={500}
                    placeholder="Bank statement or deposit reference. Do not enter credentials."
                  />
                </label>

                <ActionButton
                  className={primary}
                  disabled={busy}
                >
                  Submit payment for verification
                </ActionButton>
              </form>
            )}

          {/* VOID INVOICE */}

          {activeStore?.active &&
            data.canConfigure &&
            mode === 'void' &&
            doc.paid_minor === 0 &&
            !doc.payments.some(
              payment => payment.status === 'pending',
            ) && (
              <form
                className="grid gap-3 rounded-xl border border-gr-danger-border bg-gr-danger-bg p-4"
                onSubmit={event => {
                  const values = getValues(event);

                  run('void', {
                    ...base,
                    reason: values.get('reason'),
                  });
                }}
              >
                <p className="text-sm text-gr-danger">
                  The invoice will be marked as void.
                  Its document number and history
                  will be retained.
                </p>

                <label className={label}>
                  Reason for voiding

                  <textarea
                    className={field}
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    className={primary}
                    disabled={busy}
                  >
                    Confirm void
                  </ActionButton>

                  <ActionButton
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => setMode(null)}
                  >
                    Cancel
                  </ActionButton>
                </div>
              </form>
            )}
        </div>
      )}
    </section>
  );
}