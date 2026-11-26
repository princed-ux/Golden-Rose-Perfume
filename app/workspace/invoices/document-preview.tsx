import { draftUnitPrice, type calculateInvoiceDraft, type InvoiceDraft } from '../../../src/lib/golden-rose/invoice-draft';
import { invoiceNumber, quoteReference, type BillingDocument } from '../../../src/lib/golden-rose/billing';

const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const money = (minor: number) => formatter.format(minor / 100);

export function DocumentPreview({
  draft,
  calc,
  saved,
}: {
  draft: InvoiceDraft;
  calc: ReturnType<typeof calculateInvoiceDraft>;
  saved?: BillingDocument;
}) {
  const issued = saved?.state === 'issued' || saved?.state === 'voided';
  const preview = !saved || saved.state === 'draft';
  return (
    <article
      id="gr-invoice-print"
      className="relative min-w-0 overflow-hidden rounded-xl border border-gr-border bg-gr-surface p-5 text-gr-text shadow-[0_9px_32px_rgba(59,28,43,.06)] sm:p-7"
    >
      {preview && <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-14px] top-28 rotate-[-17deg] border-4 border-gr-border/12 px-5 py-2 text-4xl font-black tracking-[.2em] text-gr-danger/12 sm:text-5xl"
      >
        DRAFT
      </div>}

      <header className="relative flex flex-wrap items-start justify-between gap-5 border-b-2 border-gr-border pb-5">
        <div>
          <p className="font-serif text-[1.75rem] tracking-wide text-gr-text">
            GOLDEN ROSE
          </p>

          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.22em] text-gr-gold">
            BEAUTY OF FRAGRANCE
          </p>
          {saved?.issuer && <div className="mt-2 grid gap-0.5 break-words text-[10px]">
            <strong>{saved.issuer.name}</strong>
            <span className="whitespace-pre-wrap">{saved.issuer.address}</span>
            <span>{saved.issuer.contact}</span>
            {saved.issuer.taxId && <span>Tax ID: {saved.issuer.taxId}</span>}
          </div>}
        </div>

        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gr-danger">
            {preview ? 'UNISSUED DRAFT' : saved?.state === 'voided' ? 'VOIDED INVOICE' :
              issued ? 'OFFICIAL INVOICE' : 'ACCEPTED QUOTATION'}
          </p>

          <h2 className="mt-2 font-serif text-2xl text-gr-text">
            {draft.kind === 'quotation' ? 'Quotation' : 'Invoice'}
          </h2>

          <p className="mt-1 max-w-50 break-all text-[10px] font-semibold text-gr-danger">
            {issued ? invoiceNumber(saved.invoice_number) : preview ? 'No official document number' : quoteReference(saved.id)}
          </p>
        </div>
      </header>

      {(preview || saved?.state === 'voided') && <div className="relative mt-5 rounded-lg border border-gr-border bg-gr-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-gr-danger">
        {preview ? 'Preview only · Not issued · Not proof of payment' : 'Voided · Retained for reference'}
      </div>}

      <div className="relative mt-6 grid gap-5 text-xs sm:grid-cols-2">
        <div className="grid content-start gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-gr-muted">
            Prepared for
          </span>

          <strong className="break-words text-sm text-gr-text">
            {draft.recipient.trim() || 'Customer name'}
          </strong>

          {draft.company && (
            <span className="break-words">{draft.company}</span>
          )}

          {draft.email && (
            <span className="break-all">{draft.email}</span>
          )}

          {draft.phone && <span>{draft.phone}</span>}

          {draft.address && (
            <span className="whitespace-pre-wrap break-words">
              {draft.address}
            </span>
          )}
        </div>

        <div className="grid content-start gap-2 sm:text-right">
          <div>
            <span className="text-gr-muted">Document date</span>
            <p className="font-semibold">
              {draft.issueDate || 'Not selected'}
            </p>
          </div>

          <div>
            <span className="text-gr-muted">
              {draft.kind === 'quotation'
                ? 'Valid until'
                : 'Payment due'}
            </span>

            <p className="font-semibold">
              {draft.dueDate || 'Not selected'}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-7 overflow-x-auto">
        <table className="w-full min-w-[330px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-gr-border text-[10px] font-bold uppercase text-gr-muted">
              <th scope="col" className="pb-3 pr-2">
                Item / description
              </th>
              <th scope="col" className="pb-3 text-right">
                Qty
              </th>
              <th scope="col" className="pb-3 text-right">
                Unit
              </th>
              <th scope="col" className="pb-3 text-right">
                Amount
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gr-border">
            {calc.rows.map((line, index) => (
              <tr key={line.id}>
                <td className="py-3 pr-2 align-top">
                  <strong className="block break-words text-gr-text">
                    {line.description.trim() || `Item ${index + 1}`}
                  </strong>

                  {line.sku && (
                    <span className="text-gr-muted">
                      SKU: {line.sku}
                    </span>
                  )}
                </td>

                <td className="py-3 text-right align-top tabular-nums">
                  {Number.isSafeInteger(line.qty)
                    ? line.qty
                    : '—'}
                </td>

                <td className="py-3 text-right align-top tabular-nums">
                  {line.unit === null
                    ? '—'
                    : money(line.unit)}
                </td>

                <td className="py-3 text-right align-top font-semibold tabular-nums">
                  {line.valid
                    ? money(line.amount)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="relative ml-auto mt-6 grid max-w-[330px] gap-3 border-t border-gr-border pt-5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gr-muted">Subtotal</span>
          <strong>{money(calc.subtotal)}</strong>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-gr-muted">Discount</span>
          <strong>− {money(calc.discount)}</strong>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-gr-muted">Tax{saved?.tax_bps != null && ' (' + draftUnitPrice(saved.tax_bps) + '%)'}</span>
          <strong>{calc.taxRate === null ? 'No rate set' : money(calc.tax)}</strong>
        </div>

        <div className="flex justify-between gap-4 border-t border-gr-border pt-3 text-base font-bold text-gr-text">
          <span>{preview ? 'Draft amount' : 'Total (NGN)'}</span>
          <span>
            {calc.valid ? money(calc.total) : 'Incomplete'}
          </span>
        </div>
        {saved?.state === 'issued' && <>
          <div className="flex justify-between gap-4"><span>Verified payments</span><strong>{money(saved.paid_minor)}</strong></div>
          <div className="flex justify-between gap-4"><span>Outstanding balance</span><strong>{money(saved.balance_minor ?? 0)}</strong></div>
        </>}
      </div>

      {(draft.notes || draft.paymentTerms) && (
        <div className="relative mt-7 grid gap-3 border-t border-gr-border pt-4 text-xs leading-5">
          {draft.paymentTerms && (
            <p>
              <strong className="text-gr-text">Terms:</strong>{' '}
              <span className="whitespace-pre-wrap">
                {draft.paymentTerms}
              </span>
            </p>
          )}

          {draft.notes && (
            <p>
              <strong className="text-gr-text">Notes:</strong>{' '}
              <span className="whitespace-pre-wrap">
                {draft.notes}
              </span>
            </p>
          )}
        </div>
      )}

      <footer className="relative mt-10 border-t border-gr-border pt-4 text-center text-[10px] leading-5 text-gr-muted">
        {preview ? 'Prepared using Golden Rose Perfume · Draft preview only' : saved?.location_name}
        {preview && <p>
          This document has no issued reference and does not confirm
          a sale or payment.
        </p>}
      </footer>
    </article>
  );
}
