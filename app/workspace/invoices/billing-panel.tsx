'use client';

import { ActionButton } from '@/src/components/action-feedback';
import { useState, type FormEvent } from 'react';
import {
  billingFilters, billingMinor, billingStatus, invoiceNumber, quoteReference,
  type BillingAction, type BillingDocument, type BillingFilters, type BillingPayload, type BillingRegisterData,
} from '@/src/lib/golden-rose/billing';
import { draftUnitPrice } from '@/src/lib/golden-rose/invoice-draft';

const box = 'grid min-w-0 gap-4 rounded-2xl border border-[#ecdfd9] bg-[#fffdfa] p-4 sm:p-6';
const button = 'min-h-11 rounded-xl border border-[#e5d6cc] bg-white px-3 py-2 text-sm font-semibold text-[#53203a] hover:bg-[#fff5e6] disabled:opacity-45';
const primary = 'min-h-11 rounded-xl bg-[#53203a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3d1428] disabled:opacity-45';
const field = 'min-h-11 w-full min-w-0 rounded-xl border border-[#e5d6cc] bg-white px-3 py-2 text-sm text-[#402332]';
const label = 'grid min-w-0 gap-1 text-xs font-semibold text-[#6f5162]';
const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const money = (minor: number) => formatter.format(minor / 100);

export function BillingRegister({ data, filters, busy, apply, open, configure }: {
  data: BillingRegisterData; filters: BillingFilters; busy: boolean;
  apply: (next: BillingFilters) => void; open: (id: string) => void;
  configure: (payload: BillingPayload) => void;
}) {
  const [storeId, setStoreId] = useState(data.stores.find(store => store.active)?.id ?? '');
  const selectedStore = data.stores.find(store => store.id === storeId);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    apply({
      search: String(values.get('search') ?? '').trim(), kind: String(values.get('kind')) as BillingFilters['kind'],
      status: String(values.get('status')) as BillingFilters['status'], storeId: String(values.get('storeId') ?? ''),
      from: String(values.get('from') ?? ''), to: String(values.get('to') ?? ''), page: 0,
    });
  }

  function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    configure({
      storeId, name: values.get('name'), address: values.get('address'), contact: values.get('contact'),
      taxId: values.get('taxId'), taxBasis: values.get('taxBasis'), taxBps: billingMinor(String(values.get('taxRate') ?? '')),
    });
  }

  return (
    <section className={box} aria-busy={busy}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#a4783d]">Document control</p>
        <h2 className="font-serif text-2xl text-[#4a1d35]">Financial document register</h2>
      </div>
      <form key={JSON.stringify({ ...filters, page: 0 })} onSubmit={filter}
        className="grid min-w-0 gap-3 rounded-xl border border-[#ecdfd9] bg-[#fffaf5] p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className={label + ' sm:col-span-2'}>Customer or document number
          <input className={field} name="search" maxLength={120} defaultValue={filters.search} placeholder="Name or document number" type="search" />
        </label>
        <label className={label}>Document type
          <select className={field} name="kind" defaultValue={filters.kind}><option value="">All documents</option>
            <option value="quotation">Quotations</option><option value="invoice">Invoices</option>
          </select>
        </label>
        <label className={label}>Status
          <select className={field} name="status" defaultValue={filters.status}><option value="">All statuses</option>
            {Object.entries(billingStatus).map(([status, name]) => <option key={status} value={status}>{name}</option>)}
          </select>
        </label>
        <label className={label}>Store
          <select className={field} name="storeId" defaultValue={filters.storeId}><option value="">All permitted stores</option>
            {data.stores.map(store => <option key={store.id} value={store.id}>{store.name}{store.active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        <label className={label}>From <input className={field} type="date" name="from" defaultValue={filters.from} /></label>
        <label className={label}>To <input className={field} type="date" name="to" defaultValue={filters.to} /></label>
        <div className="flex flex-wrap items-end gap-2">
          <ActionButton className={primary} disabled={busy}>Search</ActionButton>
          <ActionButton className={button} type="button" disabled={busy} onClick={() => apply(billingFilters)}>Clear</ActionButton>
        </div>
      </form>
      {!data.documents.length ? <p className="rounded-xl border border-dashed border-[#e5d6cc] p-5 text-sm text-[#6f5162]">
        No saved documents match these filters. Use Prepare new draft to start a quotation or invoice.
      </p> : (
        <ul className="grid divide-y divide-[#ecdfd9] rounded-xl border border-[#ecdfd9] bg-white">
          {data.documents.map(doc => (
            <li key={doc.id} className="grid min-w-0 gap-2 p-3 text-sm text-[#5a394c] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0 break-words"><strong>{doc.recipient}</strong>
                <p>{invoiceNumber(doc.invoice_number) || (doc.kind === 'invoice' ? 'Invoice draft' : quoteReference(doc.id))} · {doc.location_name}</p>
              </div>
              <div><p>{billingStatus[doc.status]}</p><time dateTime={doc.issue_date}>{doc.issue_date}</time></div>
              <div className="tabular-nums"><p>{money(doc.total_minor)}</p>
                {doc.balance_minor !== null && <p className="text-xs">Balance {money(doc.balance_minor)}</p>}
              </div>
              <ActionButton type="button" className={button} disabled={busy} onClick={() => open(doc.id)}
                aria-label={'Open ' + (invoiceNumber(doc.invoice_number) || doc.kind) + ' for ' + doc.recipient}>Open</ActionButton>
            </li>
          ))}
        </ul>
      )}
      {(data.page > 0 || data.more) && <div className="flex flex-wrap items-center gap-2 text-sm">
        <ActionButton type="button" className={button} disabled={busy || data.page === 0}
          onClick={() => apply({ ...filters, page: data.page - 1 })}>Previous</ActionButton>
        <span>Page {data.page + 1}</span>
        <ActionButton type="button" className={button} disabled={busy || !data.more}
          onClick={() => apply({ ...filters, page: data.page + 1 })}>Next</ActionButton>
      </div>}
      {data.canConfigure && <details className="rounded-xl border border-[#ecdfd9] bg-[#fffaf5] p-4 text-[#53203a]">
        <summary className="cursor-pointer font-semibold">Store billing identity and verified tax</summary>
        <p className="my-3 text-sm">Use verified business details and the approved rate for this store. Enter zero only if the documented rule calls for zero tax.</p>
        <label className={label}>Store
          <select className={field} value={storeId} onChange={event => setStoreId(event.target.value)}>
            <option value="">Select a store</option>
            {data.stores.filter(store => store.active).map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        {selectedStore && <form key={selectedStore.id} onSubmit={saveConfiguration} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>Legal business name <input className={field} name="name" required minLength={2} maxLength={150}
            defaultValue={selectedStore.identity?.name} /></label>
          <label className={label}>Business contact <input className={field} name="contact" required minLength={3} maxLength={254}
            defaultValue={selectedStore.identity?.contact} /></label>
          <label className={label}>Business address <textarea className={field} name="address" required minLength={5} maxLength={500}
            defaultValue={selectedStore.identity?.address} /></label>
          <label className={label}>Tax identifier, if applicable <input className={field} name="taxId" maxLength={100}
            defaultValue={selectedStore.identity?.taxId} /></label>
          <label className={label}>Verified tax rate (%) <input className={field} name="taxRate" required type="number" min={0} max={100}
            step="0.01" defaultValue={selectedStore.taxBps === null ? undefined : draftUnitPrice(selectedStore.taxBps)} /></label>
          <label className={label}>Verification reference or basis <textarea className={field} name="taxBasis" required minLength={3} maxLength={500}
            defaultValue={selectedStore.taxBasis ?? undefined} /></label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" required /> I have verified these details and the tax rule.</label>
          <ActionButton className={primary} disabled={busy}>Save verified billing settings</ActionButton>
        </form>}
      </details>}
    </section>
  );
}

export function BillingDocumentControls({ doc, data, busy, run, edit }: {
  doc: BillingDocument; data: BillingRegisterData;
  busy: boolean;
  run: (action: BillingAction, payload: BillingPayload) => void;
  edit: () => void;
}) {
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [mode, setMode] = useState<'pos' | 'offline' | 'void' | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const base = { id: doc.id, revision: doc.revision };
  const activeStore = data.stores.find(store => store.id === doc.location_id);
  const getValues = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return new FormData(event.currentTarget);
  };
  return (
    <section className={box} aria-busy={busy}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#a4783d]">{doc.location_name} · {billingStatus[doc.status]}</p>
        <h2 className="font-serif text-2xl text-[#4a1d35]">
          {invoiceNumber(doc.invoice_number) || (doc.kind === 'quotation' ? 'Saved quotation' : 'Saved invoice draft')}
        </h2>
        {doc.original_quote_id && <p className="mt-1 break-all text-sm">Original quotation: {quoteReference(doc.original_quote_id)}</p>}
      </div>
      {activeStore && !activeStore.active && <p className="text-sm">This store is inactive. The saved document is available for reference only.</p>}
      {doc.state === 'draft' && activeStore?.active && <div className="grid gap-3">
        {!doc.original_quote_id && <ActionButton type="button" className={button} disabled={busy} onClick={edit}>Edit saved draft</ActionButton>}
        {doc.tax_bps === null && <p className="text-sm">Verify the store billing identity and tax, then save this draft again to finalize it.</p>}
        {doc.tax_bps !== null && doc.kind === 'quotation' && <form className="grid gap-2" onSubmit={event => {
          const values = getValues(event);
          run('accept', { ...base, reason: values.get('reason') });
        }}>
          <label className={label}>Customer acceptance reference <input className={field} name="reason" required minLength={3} maxLength={500}
            placeholder="Reference for the customer's confirmed acceptance" /></label>
          <ActionButton className={primary} disabled={busy}>Record quote acceptance</ActionButton>
        </form>}
        {doc.tax_bps !== null && doc.kind === 'invoice' && (confirmIssue ? (
          <div className="grid gap-2 rounded-xl bg-[#fff3e9] p-3 text-sm">
            <p>Issue this invoice for {money(doc.total_minor)}? The server will assign its official number and lock the financial details.</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton type="button" className={primary} disabled={busy} onClick={() => run('issue', base)}>Confirm issuance</ActionButton>
              <ActionButton type="button" className={button} disabled={busy} onClick={() => setConfirmIssue(false)}>Cancel</ActionButton>
            </div>
          </div>
        ) : <ActionButton type="button" className={primary} disabled={busy} onClick={() => setConfirmIssue(true)}>Issue invoice</ActionButton>)}
      </div>}
      {doc.state === 'accepted' && activeStore?.active && <form className="grid gap-2" onSubmit={event => {
        const values = getValues(event);
        run('convert', { ...base, dueDate: values.get('dueDate') });
      }}>
        <label className={label}>Invoice payment due date
          <input className={field} name="dueDate" type="date" min={data.today} required />
        </label>
        <ActionButton className={primary} disabled={busy}>Create invoice from quotation</ActionButton>
      </form>}
      {doc.state === 'issued' && (
        <div className="grid gap-3">
          <h3 className="font-serif text-xl text-[#4a1d35]">Payments and reconciliation</h3>
          {!doc.payments.length && <p className="text-sm">No payment events recorded.</p>}
          {doc.payments.length > 0 && <ul className="grid gap-2">
            {doc.payments.map(payment => <li className="grid gap-1 break-words rounded-xl border border-[#ecdfd9] p-3 text-sm" key={payment.id}>
              <strong>{payment.reference} · {money(payment.amount_minor)}</strong>
              <span>{payment.source === 'pos' ? 'Completed POS receipt' : 'Offline payment'} · {payment.status}</span>
              {payment.evidence && <p>Evidence reference: {payment.evidence}</p>}
              {payment.review_note && <p>Review: {payment.review_note}</p>}
              {activeStore?.active && data.canReviewPayments && payment.canReview && (review === payment.id ? (
                <form className="grid gap-2" onSubmit={event => {
                  const values = getValues(event);
                  run('review_payment', { ...base, paymentId: payment.id, decision: values.get('decision'), reason: values.get('reason') });
                }}>
                  <label className={label}>Decision <select className={field} name="decision" required defaultValue="">
                    <option value="" disabled>Select outcome</option><option value="verified">Evidence verified</option><option value="rejected">Reject evidence</option>
                  </select></label>
                  <label className={label}>Review note <textarea className={field} name="reason" required minLength={3} maxLength={500} /></label>
                  <ActionButton className={primary} disabled={busy}>Submit review</ActionButton>
                </form>
              ) : <ActionButton type="button" className={button} disabled={busy} onClick={() => setReview(payment.id)}>Review evidence</ActionButton>)}
            </li>)}
          </ul>}
          {activeStore?.active && <div className="flex flex-wrap gap-2">
            {!!doc.balance_minor && <>
              <ActionButton type="button" className={button} onClick={() => setMode(mode === 'pos' ? null : 'pos')} aria-expanded={mode === 'pos'}>Apply POS receipt</ActionButton>
              <ActionButton type="button" className={button} onClick={() => setMode(mode === 'offline' ? null : 'offline')} aria-expanded={mode === 'offline'}>Submit offline payment</ActionButton>
            </>}
            {data.canConfigure && doc.paid_minor === 0 && !doc.payments.some(payment => payment.status === 'pending') &&
              <ActionButton type="button" className={button} onClick={() => setMode(mode === 'void' ? null : 'void')} aria-expanded={mode === 'void'}>Void invoice</ActionButton>}
          </div>}
          {activeStore?.active && mode === 'pos' && !!doc.balance_minor && <form className="grid gap-2" onSubmit={event => {
            const values = getValues(event);
            run('apply_pos', { ...base, receiptNumber: values.get('receipt') });
          }}>
            <p className="text-sm">Match a completed receipt from this store. Its net amount can be applied once; the original POS sale stays unchanged.</p>
            <label className={label}>POS receipt number <input className={field} name="receipt" required inputMode="numeric" pattern="[0-9]{1,15}" /></label>
            <ActionButton className={primary} disabled={busy}>Apply completed receipt</ActionButton>
          </form>}
          {activeStore?.active && mode === 'offline' && !!doc.balance_minor && <form className="grid gap-2" onSubmit={event => {
            const values = getValues(event);
            run('propose_payment', { ...base, amountMinor: billingMinor(String(values.get('amount') ?? '')),
              reference: values.get('reference'), evidence: values.get('evidence') });
          }}>
            <p className="text-sm">A different authorized reviewer must verify the evidence before the balance changes.</p>
            <label className={label}>Amount (₦) <input className={field} name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label className={label}>Provider and payment reference
              <input className={field} name="reference" required minLength={3} maxLength={120} placeholder="Provider and its transaction ID" />
            </label>
            <label className={label}>Evidence reference and reconciliation details
              <textarea className={field} name="evidence" required minLength={10} maxLength={500} placeholder="Internal bank statement or deposit reference; omit credentials and account numbers" />
            </label>
            <ActionButton className={primary} disabled={busy}>Submit for verification</ActionButton>
          </form>}
          {activeStore?.active && mode === 'void' && doc.paid_minor === 0 && <form className="grid gap-2" onSubmit={event => {
            const values = getValues(event);
            run('void', { ...base, reason: values.get('reason') });
          }}>
            <p className="text-sm">The invoice will be marked void and its number and contents will remain in history.</p>
            <label className={label}>Reason for voiding <textarea className={field} name="reason" required minLength={3} maxLength={500} /></label>
            <ActionButton className={primary} disabled={busy}>Confirm void</ActionButton>
          </form>}
        </div>
      )}
    </section>
  );
}
