
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  blankInvoiceDraft as blankDraft,
  blankInvoiceLine as blankLine,
  calculateInvoiceDraft as calculate,
  draftUnitPrice,
  type InvoiceDraft as Draft,
  type InvoiceDraftLine as Line,
} from '@/src/lib/golden-rose/invoice-draft';
import { findInvoiceCustomers, findInvoiceProducts, type InvoiceCustomerChoice, type InvoiceProductChoice } from './lookup-actions';
import { InvoiceLookup } from './lookup';

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Copy,
  FilePlus2,
  FileText,
  Landmark,
  Mail,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#53203a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3d1428] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b38a57] disabled:cursor-not-allowed disabled:opacity-40';

const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e5d6cc] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a2a42] transition hover:border-[#bf995e] hover:bg-[#fff9f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b38a57] disabled:cursor-not-allowed disabled:opacity-40';

const control =
  'min-h-11 w-full min-w-0 rounded-xl border border-[#e3d5cd] bg-white px-3.5 py-2.5 text-sm text-[#402332] shadow-sm outline-none placeholder:text-[#a3939b] focus:border-[#ac8a59] focus:ring-2 focus:ring-[#d6bb89]/40 disabled:bg-[#f7f1ed]';

const card =
  'min-w-0 rounded-2xl border border-[#ecdfd9] bg-[#fffdfa] shadow-[0_7px_30px_rgba(72,23,45,0.04)]';

const label =
  'grid min-w-0 gap-2 text-xs font-semibold text-[#6f5162]';

const formatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
});

const money = (minor: number) => formatter.format(minor / 100);

type RegisterTab = 'all' | 'quotations' | 'invoices';

function TinyStat({
  icon: Icon,
  label,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <div className={card + ' p-4 sm:p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#79616c]">
            {label}
          </p>

          <p className="mt-2 font-serif text-[2rem] leading-none text-[#4d1b35]">
            —
          </p>
        </div>

        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f8eddb] text-[#a57736]">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#9b8790]">
        {detail}
      </p>
    </div>
  );
}

function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[#eee3de] pb-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f7eddf] text-xs font-bold text-[#987344]">
        {number}
      </span>

      <div className="min-w-0">
        <h3 className="font-serif text-xl text-[#4d2036]">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-[#907b85]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function EmptyRegister({
  tab,
  onCompose,
}: {
  tab: RegisterTab;
  onCompose: () => void;
}) {
  const kind =
    tab === 'quotations'
      ? 'quotations'
      : tab === 'invoices'
        ? 'invoices'
        : 'documents';

  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-[#e7d8d0] bg-[#fffaf5] px-5 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-[#f7ead8] text-[#a1773c]">
        <FileText size={28} strokeWidth={1.5} aria-hidden="true" />
      </span>

      <h3 className="font-serif text-[1.45rem] text-[#4e2038]">
        Issued {kind} are unavailable
      </h3>

      <p className="max-w-md text-sm leading-6 text-[#887480]">
        Issued documents will appear here when the billing ledger,
        document numbering, customer assignments and payment
        reconciliation are connected. No demonstration records
        are inserted.
      </p>

      <button
        type="button"
        className={secondary + ' mt-2'}
        onClick={onCompose}
      >
        <FilePlus2 size={17} aria-hidden="true" />
        Compose an unissued draft
      </button>
    </div>
  );
}

function DraftPreview({
  draft,
  calc,
}: {
  draft: Draft;
  calc: ReturnType<typeof calculate>;
}) {
  return (
    <article
      id="gr-invoice-print"
      className="relative min-w-0 overflow-hidden rounded-xl border border-[#e9dcd4] bg-white p-5 text-[#402737] shadow-[0_9px_32px_rgba(59,28,43,.06)] sm:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-14px] top-28 rotate-[-17deg] border-4 border-[#a96e7b]/12 px-5 py-2 text-4xl font-black tracking-[.2em] text-[#a96e7b]/12 sm:text-5xl"
      >
        DRAFT
      </div>

      <header className="relative flex flex-wrap items-start justify-between gap-5 border-b-2 border-[#5b263f] pb-5">
        <div>
          <p className="font-serif text-[1.75rem] tracking-wide text-[#4b1934]">
            GOLDEN ROSE
          </p>

          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.22em] text-[#ac8047]">
            BEAUTY OF FRAGRANCE
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a54b56]">
            UNISSUED DRAFT
          </p>

          <h2 className="mt-2 font-serif text-2xl text-[#4b1f38]">
            {draft.kind === 'quotation' ? 'Quotation' : 'Invoice'}
          </h2>

          <p className="mt-1 text-[10px] font-semibold text-[#9b7886]">
            No official document number
          </p>
        </div>
      </header>

      <div className="relative mt-5 rounded-lg border border-[#f1ded5] bg-[#fff5f1] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a24d55]">
        Preview only · Not issued · Not proof of payment
      </div>

      <div className="relative mt-6 grid gap-5 text-xs sm:grid-cols-2">
        <div className="grid content-start gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#987986]">
            Prepared for
          </span>

          <strong className="break-words text-sm text-[#4c2639]">
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
            <span className="text-[#957f88]">Document date</span>
            <p className="font-semibold">
              {draft.issueDate || 'Not selected'}
            </p>
          </div>

          <div>
            <span className="text-[#957f88]">
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
            <tr className="border-b border-[#c9ae9c] text-[10px] font-bold uppercase text-[#7f6974]">
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

          <tbody className="divide-y divide-[#f1e9e4]">
            {calc.rows.map((line, index) => (
              <tr key={line.id}>
                <td className="py-3 pr-2 align-top">
                  <strong className="block break-words text-[#503246]">
                    {line.description.trim() || `Item ${index + 1}`}
                  </strong>

                  {line.sku && (
                    <span className="text-[#97838c]">
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

      <div className="relative ml-auto mt-6 grid max-w-[330px] gap-3 border-t border-[#e4d7d0] pt-5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-[#856b79]">Subtotal</span>
          <strong>{money(calc.subtotal)}</strong>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-[#856b79]">Discount</span>
          <strong>− {money(calc.discount)}</strong>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-[#856b79]">Tax</span>
          <strong>{calc.taxRate === null ? 'No rate set' : money(calc.tax)}</strong>
        </div>

        <div className="flex justify-between gap-4 border-t border-[#ddc9bc] pt-3 text-base font-bold text-[#4b1c35]">
          <span>Draft amount</span>
          <span>
            {calc.valid ? money(calc.total) : 'Incomplete'}
          </span>
        </div>
      </div>

      {(draft.notes || draft.paymentTerms) && (
        <div className="relative mt-7 grid gap-3 border-t border-[#eee3dc] pt-4 text-xs leading-5">
          {draft.paymentTerms && (
            <p>
              <strong className="text-[#603c4e]">Terms:</strong>{' '}
              <span className="whitespace-pre-wrap">
                {draft.paymentTerms}
              </span>
            </p>
          )}

          {draft.notes && (
            <p>
              <strong className="text-[#603c4e]">Notes:</strong>{' '}
              <span className="whitespace-pre-wrap">
                {draft.notes}
              </span>
            </p>
          )}
        </div>
      )}

      <footer className="relative mt-10 border-t border-[#eee3dc] pt-4 text-center text-[10px] leading-5 text-[#86707c]">
        Prepared using Golden Rose Perfume · Draft preview only

        <p>
          This document has no issued reference and does not confirm
          a sale or payment.
        </p>
      </footer>
    </article>
  );
}

export function InvoiceStudio({ canBrowseCustomers, staffCatalogue }: { canBrowseCustomers: boolean; staffCatalogue: boolean }) {
  const [tab, setTab] = useState<RegisterTab>('all');

  const [view, setView] =
    useState<'register' | 'composer'>('register');

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [nextId, setNextId] = useState(2);

  const [copied, setCopied] =
    useState<'idle' | 'success' | 'failed'>('idle');

  const calc = useMemo(() => calculate(draft), [draft]);

  const patch = <K extends keyof Draft>(
    field: K,
    value: Draft[K],
  ) => {
    setDraft(current => ({ ...current, [field]: value }));
  };

  const updateLine = (
    id: number,
    field: keyof Omit<Line, 'id'>,
    value: string,
  ) => {
    setDraft(current => ({
      ...current,
      lines: current.lines.map(line =>
        line.id === id
          ? { ...line, [field]: value }
          : line,
      ),
    }));
  };

  const addLine = () => {
    if (draft.lines.length >= 30) return;

    const id = nextId;
    setNextId(value => value + 1);

    setDraft(current => ({
      ...current,
      lines: [...current.lines, blankLine(id)],
    }));
  };

  const copyLine = (line: Line) => {
    if (draft.lines.length >= 30) return;

    const id = nextId;
    setNextId(value => value + 1);

    setDraft(current => ({
      ...current,
      lines: [...current.lines, { ...line, id }],
    }));
  };

  function chooseCustomer(customer: InvoiceCustomerChoice) {
    setDraft(current => ({
      ...current, recipient: customer.label, email: customer.email ?? '', phone: customer.phone ?? '', company: '', address: '',
    }));
  }

  function chooseProduct(product: InvoiceProductChoice) {
    const first = draft.lines[0];
    const emptyFirst = draft.lines.length === 1 && !first.description && !first.unitPrice && !first.sku && first.quantity === '1';
    if (!emptyFirst && draft.lines.length >= 30) return;
    const id = emptyFirst ? first.id : nextId;
    const line = { ...blankLine(id), description: product.label, sku: product.sku ?? '', unitPrice: draftUnitPrice(product.priceMinor) };
    setDraft(current => ({ ...current, lines: emptyFirst ? [line] : [...current.lines, line] }));
    if (!emptyFirst) setNextId(value => value + 1);
  }

  const removeLine = (id: number) => {
    if (draft.lines.length === 1) return;

    setDraft(current => ({
      ...current,
      lines: current.lines.filter(line => line.id !== id),
    }));
  };

  const startOver = () => {
    if (
      !window.confirm(
        'Clear all unsaved draft fields? This draft has not been saved anywhere.',
      )
    ) {
      return;
    }

    setDraft(blankDraft());
    setNextId(2);
    setCopied('idle');
  };

  const copySummary = async () => {
    if (!calc.valid) return;

    const text = [
      `Golden Rose — ${draft.kind === 'quotation' ? 'Quotation' : 'Invoice'} DRAFT (UNISSUED)`,
      `Prepared for: ${draft.recipient}`,
      `Document date: ${draft.issueDate}`,
      `${draft.kind === 'quotation' ? 'Valid until' : 'Due date'}: ${draft.dueDate}`,
      ...calc.rows.map(
        line =>
          `${line.description} — ${line.qty} × ${money(line.unit ?? 0)} = ${money(line.amount)}`,
      ),
      `Subtotal: ${money(calc.subtotal)}`,
      `Discount: ${money(calc.discount)}`,
      `Tax: ${calc.taxRate === null ? 'No rate set' : money(calc.tax)}`,
      `Draft amount: ${money(calc.total)}`,
      'NOT ISSUED — NOT PROOF OF PAYMENT',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied('success');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="grid min-w-0 gap-6 pb-12">
      <header className="relative overflow-hidden rounded-[22px] border border-[#5c2745] bg-[linear-gradient(119deg,#331023_0%,#52233e_62%,#795449_100%)] px-5 py-6 text-white shadow-[0_12px_35px_rgba(68,25,48,.13)] sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full border border-[#e2c18a]/20"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 size-44 rounded-full border border-[#e2c18a]/15"
        />

        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="grid max-w-[640px] gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#e4c48f]">
              Operations / Financial documents
            </p>

            <h1 className="font-serif text-[clamp(2rem,4.5vw,3.1rem)] leading-tight">
              Invoices &amp; Quotes
            </h1>

            <p className="text-sm leading-6 text-[#f4e8ed]">
              Build beautifully presented customer quotations
              and invoice drafts, with accurate prices, discounts
              and printable A4 documents.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setView(view === 'composer' ? 'register' : 'composer')
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e9c78c] px-4 py-2.5 text-sm font-bold text-[#401d30] hover:bg-[#f3dcae]"
          >
            {view === 'composer' ? (
              <ArrowLeft size={17} />
            ) : (
              <FilePlus2 size={17} />
            )}

            {view === 'composer'
              ? 'Back to register'
              : 'Prepare new draft'}
          </button>
        </div>
      </header>

      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Invoice overview"
      >
        <TinyStat
          icon={ReceiptText}
          label="Issued invoices"
          detail="Verified only after billing activation"
        />

        <TinyStat
          icon={WalletCards}
          label="Outstanding balance"
          detail="Not calculated until payment records are connected"
        />

        <TinyStat
          icon={FileText}
          label="Open quotations"
          detail="Official quotation register is pending"
        />

        <TinyStat
          icon={Landmark}
          label="Payments received"
          detail="Will use reconciled collections, not estimates"
        />
      </div>

      <div
        role="status"
        className="flex min-w-0 items-start gap-3 rounded-xl border border-[#e8d7b8] bg-[#fff7e9] p-4 text-sm leading-6 text-[#75512d]"
      >
        <ShieldCheck
          className="mt-0.5 shrink-0"
          size={19}
          aria-hidden="true"
        />

        <p>
          <strong>Billing ledger not connected yet.</strong>{' '}
          Documents prepared here stay in browser memory.
          They are not numbered, issued, emailed, stored, or marked
          paid. Real POS receipts are available separately in
          Sales &amp; Orders.
        </p>
      </div>

      {view === 'register' ? (
        <section className={card + ' p-4 sm:p-6'}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eee1d9] pb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#a4783d]">
                Document control
              </p>

              <h2 className="mt-1 font-serif text-2xl text-[#4a1d35]">
                Financial document register
              </h2>

              <p className="mt-1 text-xs leading-5 text-[#917c86]">
                Filter issued documents and review customer balances
                when billing is connected.
              </p>
            </div>

            <button
              className={secondary}
              type="button"
              onClick={() => setView('composer')}
            >
              <Plus size={16} />
              New document draft
            </button>
          </div>

          <div
            className="mt-5 flex flex-wrap gap-2"
            role="group"
            aria-label="Document categories"
          >
            {(
              [
                ['all', 'All documents'],
                ['quotations', 'Quotations'],
                ['invoices', 'Invoices'],
              ] as const
            ).map(([key, title]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={
                  'rounded-lg px-4 py-2 text-xs font-semibold transition ' +
                  (tab === key
                    ? 'bg-[#54213a] text-white'
                    : 'border border-[#e6d9d0] bg-white text-[#6e5160] hover:bg-[#fff8ef]')
                }
              >
                {title}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ede1dc] bg-white p-4">
            <span className="flex items-center gap-2 text-sm text-[#87747e]">
              <Search size={17} />
              Search issued references
            </span>

            <span className="text-xs font-semibold text-[#a27949]">
              Billing database not connected
            </span>
          </div>

          <div className="mt-5">
            <EmptyRegister
              tab={tab}
              onCompose={() => setView('composer')}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#917b85]">
            <span>
              Completed in-store sales do not become invoices
              automatically.
            </span>

            <Link
              href="/workspace/orders"
              className="inline-flex items-center gap-1.5 font-semibold text-[#7e4d31] hover:underline"
            >
              Open POS sales
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid min-w-0 gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.17em] text-[#a4783d]">
                Drafting studio
              </p>

              <h2 className="mt-1 font-serif text-2xl text-[#4b2039]">
                Create a commercial document
              </h2>

              <p className="mt-1 text-sm text-[#8d7883]">
                Fill in the details and check the live document
                preview.
              </p>
            </div>

            <button
              type="button"
              className={secondary}
              onClick={startOver}
            >
              <RotateCcw size={16} />
              Start over
            </button>
          </div>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(410px,.9fr)]">
            <div className="grid min-w-0 content-start gap-4">
              <section className={card + ' grid gap-5 p-4 sm:p-6'}>
                <SectionHeading
                  number="01"
                  title="Document details"
                  subtitle="Decide which document you are preparing and its dates."
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  {(['quotation', 'invoice'] as const).map(kind => (
                    <button
                      type="button"
                      key={kind}
                      aria-pressed={draft.kind === kind}
                      onClick={() => patch('kind', kind)}
                      className={
                        'flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 text-left ' +
                        (draft.kind === kind
                          ? 'border-[#b18c54] bg-[#fff7ea] text-[#53253b]'
                          : 'border-[#ebdfd8] bg-white text-[#8b7580]')
                      }
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <FileText size={19} />
                        {kind === 'quotation'
                          ? 'Quotation'
                          : 'Invoice'}
                      </span>

                      {draft.kind === kind && (
                        <CheckCircle2
                          size={18}
                          className="text-[#9d753d]"
                        />
                      )}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={label}>
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays size={15} />
                      Document date
                    </span>

                    <input
                      className={control}
                      type="date"
                      value={draft.issueDate}
                      onChange={event =>
                        patch('issueDate', event.target.value)
                      }
                    />
                  </label>

                  <label className={label}>
                    {draft.kind === 'quotation'
                      ? 'Valid until'
                      : 'Payment due date'}

                    <input
                      className={control}
                      type="date"
                      min={draft.issueDate || undefined}
                      value={draft.dueDate}
                      onChange={event =>
                        patch('dueDate', event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>

              <section className={card + ' grid gap-5 p-4 sm:p-6'}>
                <SectionHeading
                  number="02"
                  title="Bill to"
                  subtitle="Add the customer's details. This will appear on the draft document."
                />

                {canBrowseCustomers && <InvoiceLookup title="Choose a customer from CRM" filterLabel="Search active customers"
                  load={findInvoiceCustomers} select={chooseCustomer} />}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={label}>
                    <span className="inline-flex items-center gap-2">
                      <UserRound size={15} />
                      Recipient name
                    </span>

                    <input
                      className={control}
                      maxLength={120}
                      value={draft.recipient}
                      onChange={event =>
                        patch('recipient', event.target.value)
                      }
                      placeholder="Customer or contact name"
                    />
                  </label>

                  <label className={label}>
                    Company (optional)

                    <input
                      className={control}
                      maxLength={120}
                      value={draft.company}
                      onChange={event =>
                        patch('company', event.target.value)
                      }
                      placeholder="Business / organization"
                    />
                  </label>

                  <label className={label}>
                    <span className="inline-flex items-center gap-2">
                      <Mail size={15} />
                      Email (optional)
                    </span>

                    <input
                      className={control}
                      type="email"
                      maxLength={254}
                      value={draft.email}
                      onChange={event =>
                        patch('email', event.target.value)
                      }
                      placeholder="customer@example.com"
                    />
                  </label>

                  <label className={label}>
                    Phone (optional)

                    <input
                      className={control}
                      type="tel"
                      maxLength={25}
                      value={draft.phone}
                      onChange={event =>
                        patch('phone', event.target.value)
                      }
                      placeholder="+234 ..."
                    />
                  </label>

                  <label className={label + ' sm:col-span-2'}>
                    Billing address (optional)

                    <textarea
                      className={control + ' min-h-20 resize-y'}
                      maxLength={350}
                      value={draft.address}
                      onChange={event =>
                        patch('address', event.target.value)
                      }
                      placeholder="Street, city and delivery or billing address"
                    />
                  </label>
                </div>
              </section>

              <section className={card + ' grid gap-5 p-4 sm:p-6'}>
                <SectionHeading
                  number="03"
                  title="Items & pricing"
                  subtitle="Work in Nigerian naira. All calculations use integer kobo internally."
                />

                {draft.lines.length < 30 && <InvoiceLookup title={staffCatalogue ? 'Add from the staff catalogue' : 'Add from the published catalogue'}
                  filterLabel={staffCatalogue ? 'Filter the current page by fragrance or SKU' : 'Search published fragrances'}
                  load={findInvoiceProducts} select={chooseProduct} />}

                <div className="grid gap-3">
                  {draft.lines.map((line, index) => (
                    <div
                      className="grid min-w-0 gap-3 rounded-xl border border-[#ecded6] bg-[#fffaf5] p-3 sm:p-4"
                      key={line.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-xs font-bold uppercase tracking-wider text-[#956c47]">
                          Line {String(index + 1).padStart(2, '0')}
                        </strong>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => copyLine(line)}
                            disabled={draft.lines.length >= 30}
                            aria-label={`Duplicate line ${index + 1}`}
                            className="rounded-lg border border-[#e6d8cd] bg-white p-2 text-[#775268] hover:bg-[#fff1de] disabled:opacity-40"
                          >
                            <Copy size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            disabled={draft.lines.length === 1}
                            aria-label={`Remove line ${index + 1}`}
                            className="rounded-lg border border-[#e6d8cd] bg-white p-2 text-[#9f4955] hover:bg-[#fff1ef] disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <label className={label}>
                          Fragrance / description

                          <input
                            className={control}
                            maxLength={180}
                            value={line.description}
                            onChange={event =>
                              updateLine(
                                line.id,
                                'description',
                                event.target.value,
                              )
                            }
                            placeholder="e.g. Oud Eau de Parfum 100 ml"
                          />
                        </label>

                        <label className={label}>
                          SKU (optional)

                          <input
                            className={control}
                            maxLength={60}
                            value={line.sku}
                            onChange={event =>
                              updateLine(
                                line.id,
                                'sku',
                                event.target.value,
                              )
                            }
                            placeholder="Product code"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className={label}>
                          Quantity

                          <input
                            className={control}
                            type="number"
                            min={1}
                            max={10000}
                            step={1}
                            value={line.quantity}
                            onChange={event =>
                              updateLine(
                                line.id,
                                'quantity',
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <label className={label}>
                          Unit price (₦)

                          <input
                            className={control}
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={event =>
                              updateLine(
                                line.id,
                                'unitPrice',
                                event.target.value,
                              )
                            }
                            placeholder="0.00"
                          />
                        </label>

                        <div className={label}>
                          <span>Line total</span>

                          <strong className="flex min-h-11 items-center rounded-xl bg-white px-3 text-sm tabular-nums text-[#55253e]">
                            {calc.rows[index].valid
                              ? money(calc.rows[index].amount)
                              : '—'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={secondary + ' justify-self-start'}
                  onClick={addLine}
                  disabled={draft.lines.length >= 30}
                >
                  <Plus size={17} />
                  Add another item
                  {draft.lines.length >= 30 && '(maximum 30)'}
                </button>

                <div className="grid gap-4 border-t border-[#eee3dd] pt-5 sm:grid-cols-2">
                  <label className={label}>
                    Document discount (₦)

                    <input
                      className={control}
                      inputMode="decimal"
                      value={draft.discount}
                      onChange={event =>
                        patch('discount', event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </label>

                  <label className={label}>
                    Tax rate (%) (optional)
                    <input className={control} inputMode="decimal" value={draft.taxRate}
                      onChange={event => patch('taxRate', event.target.value)} placeholder="No rate set" />
                    <span className="text-xs font-normal leading-5 text-[#6f5162]">Applied after the discount. Use your approved rate for this preview.</span>
                  </label>
                </div>

                <div className="grid gap-3 rounded-xl bg-[#f8f0e8] p-5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-[#7f6471]">Subtotal</span>
                    <strong className="tabular-nums">
                      {money(calc.subtotal)}
                    </strong>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-[#7f6471]">Discount</span>
                    <strong className="tabular-nums">
                      − {money(calc.discount)}
                    </strong>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-[#7f6471]">Tax</span>
                    <strong className="tabular-nums">{calc.taxRate === null ? 'No rate set' : money(calc.tax)}</strong>
                  </div>

                  <div className="flex justify-between gap-3 border-t border-[#e4d6c5] pt-3 text-lg text-[#4e1d36]">
                    <strong>Draft total</strong>

                    <strong className="tabular-nums">
                      {calc.valid ? money(calc.total) : '—'}
                    </strong>
                  </div>
                </div>
              </section>

              <section className={card + ' grid gap-5 p-4 sm:p-6'}>
                <SectionHeading
                  number="04"
                  title="Terms & finishing"
                  subtitle="Set the terms that the customer should see before you print."
                />

                <label className={label}>
                  Payment terms / validity notes

                  <textarea
                    className={control + ' min-h-20 resize-y'}
                    maxLength={450}
                    value={draft.paymentTerms}
                    onChange={event =>
                      patch('paymentTerms', event.target.value)
                    }
                    placeholder="E.g. quotation valid for seven days; prices subject to stock availability"
                  />
                </label>

                <label className={label}>
                  Additional notes

                  <textarea
                    className={control + ' min-h-24 resize-y'}
                    maxLength={800}
                    value={draft.notes}
                    onChange={event =>
                      patch('notes', event.target.value)
                    }
                    placeholder="Delivery instructions or product information"
                  />
                </label>

                <div
                  role="status"
                  className={
                    'rounded-xl border p-4 text-xs leading-5 ' +
                    (calc.valid
                      ? 'border-[#d6e5d4] bg-[#f0f8f0] text-[#3f7449]'
                      : 'border-[#ead9b7] bg-[#fff9ee] text-[#856433]')
                  }
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {calc.valid ? (
                      <BadgeCheck size={18} />
                    ) : (
                      <CircleAlert size={18} />
                    )}

                    {calc.valid
                      ? 'Draft is ready to preview and print'
                      : 'Complete the draft before printing'}
                  </div>

                  {!calc.valid && (
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {calc.issues.map(message => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            <div className="min-w-0 2xl:sticky 2xl:top-6 2xl:self-start">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#a27540]">
                    Real-time A4 preview
                  </p>

                  <h3 className="font-serif text-xl text-[#4b2138]">
                    Customer document
                  </h3>
                </div>

                <span className="rounded-full bg-[#fff0e8] px-3 py-1 text-[11px] font-bold text-[#a94b57]">
                  UNISSUED
                </span>
              </div>

              <DraftPreview draft={draft} calc={calc} />

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={primary}
                  disabled={!calc.valid}
                  onClick={() => window.print()}
                >
                  <Printer size={17} />
                  Print / Save PDF
                </button>

                <button
                  type="button"
                  className={secondary}
                  disabled={!calc.valid}
                  onClick={copySummary}
                >
                  <ClipboardCopy size={17} />
                  Copy summary
                </button>
              </div>

              {copied === 'success' && (
                <p
                  role="status"
                  className="mt-3 text-xs text-[#36714c]"
                >
                  Draft summary copied to your clipboard.
                </p>
              )}

              {copied === 'failed' && (
                <p
                  role="alert"
                  className="mt-3 text-xs text-[#a64b56]"
                >
                  Clipboard unavailable. Use the print option instead.
                </p>
              )}

              <p className="mt-3 text-xs leading-5 text-[#8c7782]">
                No server record is created. Closing or refreshing
                this page discards the draft; printing does not
                issue it or record payment.
              </p>
            </div>
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8dcd6] pt-4 text-xs text-[#89757f]">
        <span>Golden Rose · Commercial documents</span>

        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={15} />
          Staff permissions checked by the workspace
        </span>
      </footer>
    </div>
  );
}
