
'use client';
import { ActionButton, ActionScope, useActionNotice } from '@/src/components/action-feedback';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  blankInvoiceDraft as blankDraft,
  blankInvoiceLine as blankLine,
  calculateInvoiceDraft as calculate,
  draftUnitPrice,
  type InvoiceDraft as Draft,
  type InvoiceDraftLine as Line,
} from '@/src/lib/golden-rose/invoice-draft';
import {
  billingDraftPayload, billingFilters, savedDocumentAmounts, savedDocumentDraft,
  type BillingAction, type BillingDocument, type BillingFilters, type BillingPayload, type BillingRegisterData, type BillingResult,
} from '@/src/lib/golden-rose/billing';
import { findBillingCustomers, getBillingDocument, loadBilling, updateBilling } from './billing-actions';
import { BillingDocumentControls, BillingRegister } from './billing-panel';
import { DocumentPreview } from './document-preview';
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
  value = '—',
}: {
  value?: string;
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
            {value}
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
        No {kind} match this view
      </h3>

      <p className="max-w-md text-sm leading-6 text-[#887480]">
        Saved documents appear here after the server confirms them. Adjust the filters or prepare a new draft. No demonstration records are inserted.
      </p>

      <ActionButton
        type="button"
        className={secondary + ' mt-2'}
        onClick={onCompose}
      >
        <FilePlus2 size={17} aria-hidden="true" />
        Compose an unissued draft
      </ActionButton>
    </div>
  );
}

export function InvoiceStudio({ initialBilling, initialDocument = null, canBrowseCustomers, staffCatalogue }: {
  initialBilling: BillingResult<BillingRegisterData>; initialDocument?: BillingDocument | null; canBrowseCustomers: boolean; staffCatalogue: boolean;
}) {
  const [tab, setTab] = useState<RegisterTab>('all');

  const [view, setView] =
    useState<'register' | 'composer' | 'saved'>(initialDocument ? 'saved' : 'register');

  const [billing, setBilling] = useState(initialBilling.data ?? null);
  const [filters, setFilters] = useState(billingFilters);
  const [message, setMessage] = useState(initialBilling.error ?? '');
  const [saved, setSaved] = useState<BillingDocument | null>(initialDocument);
  const [storeId, setStoreId] = useState(initialDocument?.location_id ?? initialBilling.data?.stores.find(store => store.active)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{status:'idle'|'success'|'error';message:string}>({status:'idle',message:''});
  useActionNotice(actionResult);
  useActionNotice(useMemo(() => ({status:'error' as const,message}), [message]));
  const locked = useRef(false);
  const requests = useRef(new Map<string, string>());

  const issued = billing?.documents.filter(doc => doc.kind === 'invoice' && doc.state === 'issued') ?? [];
  const outstanding = issued.reduce((sum,doc)=>sum+(doc.balance_minor ?? 0),0);
  const settled = issued.reduce((sum,doc)=>sum+doc.paid_minor,0);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [nextId, setNextId] = useState(2);

  const [copied, setCopied] =
    useState<'idle' | 'success' | 'failed'>('idle');

  const selectedStore = billing?.stores.find(store => store.id === storeId);
  const formDraft = useMemo(() => billing ?
    { ...draft, taxRate: selectedStore?.taxBps == null ? '' : draftUnitPrice(selectedStore.taxBps) } : draft,
  [billing, draft, selectedStore]);
  const calc = useMemo(() => calculate(formDraft), [formDraft]);

  async function perform(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    setActionResult({status:'idle',message:''});
    try {
      await work();
    } catch {
      setMessage('Could not complete the billing request. Retry before assuming it was saved.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function readRegister(next: BillingFilters) {
    const response = await loadBilling(next);
    if (!response.data) { setMessage(response.error); return; }
    setBilling(response.data);
    setFilters(next);
    setStoreId(current => current || response.data.stores.find(store => store.active)?.id || '');
  }

  function showRegister() {
    setView('register');
    if (billing) void perform(() => readRegister(filters));
  }

  function freshDraft() {
    setSaved(null);
    setDraft({ ...blankDraft(), issueDate: billing?.today ?? '' });
    setNextId(2);
    setCopied('idle');
    setMessage('');
    setStoreId(billing?.stores.find(store => store.active && store.id === filters.storeId)?.id ??
      billing?.stores.find(store => store.active)?.id ?? '');
    setView('composer');
  }

  function openSaved(id: string) {
    void perform(async () => {
      const response = await getBillingDocument(id);
      if (!response.data) { setMessage(response.error); return; }
      setSaved(response.data);
      setView('saved');
    });
  }

  function editSaved() {
    if (!saved) return;
    const fields = savedDocumentDraft(saved);
    setStoreId(saved.location_id);
    setDraft(fields);
    setNextId(fields.lines.length + 1);
    setView('composer');
  }

  function mutate(action: BillingAction, payload: BillingPayload) {
    void perform(async () => {
      const fingerprint = JSON.stringify([action, payload]);
      const requestKey = requests.current.get(fingerprint) ?? crypto.randomUUID();
      requests.current.set(fingerprint, requestKey);
      const response = await updateBilling(action, { ...payload, requestKey });
      if (!response.data) { setMessage(response.error); return; }
      requests.current.delete(fingerprint);
      const messages: Record<BillingAction,string> = {configure:'Billing settings saved.',save:'Document draft saved.',accept:'Quotation acceptance recorded.',convert:'Invoice draft created from the accepted quotation.',issue:'Official invoice issued.',void:'Document voided; its financial history is retained.',apply_pos:'Existing POS payment allocated. No additional sale was created.',propose_payment:'Payment submitted for approval; it is not settled yet.',review_payment:'Payment review saved.'};
      setActionResult({status:'success',message:messages[action]});
      if ('configured' in response.data) {
        await readRegister(filters);
      } else {
        // A replay can return the original successful result. Reload the
        // current snapshot so subsequent payment and status changes are visible.
        const latest = await getBillingDocument(response.data.id);
        setSaved(latest.data ?? response.data);
        setView('saved');
        if (latest.error) setMessage('Change saved. ' + latest.error);
      }
    });
  }

  const patch = <K extends keyof Draft>(
    field: K,
    value: Draft[K],
  ) => {
    setDraft(current => ({
      ...current, [field]: value,
      ...(['recipient', 'email', 'phone'].includes(field) ? { customerId: undefined } : {}),
    }));
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
      ...current, customerId: billing ? customer.id : undefined, recipient: customer.label,
      email: customer.email ?? '', phone: customer.phone ?? '', company: '', address: '',
    }));
  }

  function chooseProduct(product: InvoiceProductChoice) {
    const first = draft.lines[0];
    const emptyFirst = draft.lines.length === 1 && !first.description && !first.unitPrice && !first.sku && first.quantity === '1';
    if (!emptyFirst && draft.lines.length >= 30) return;
    const id = emptyFirst ? first.id : nextId;
    const line = { ...blankLine(id), variantId: billing ? product.id : undefined,
      description: product.label, sku: product.sku ?? '', unitPrice: draftUnitPrice(product.priceMinor) };
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
        'Clear unsaved draft fields and start a new document?',
      )
    ) {
      return;
    }

    freshDraft();
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
    <ActionScope pending={busy}><div className="grid min-w-0 gap-6 pb-12">
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

          <ActionButton
            type="button"
            onClick={view === 'register' ? freshDraft : showRegister}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e9c78c] px-4 py-2.5 text-sm font-bold text-[#401d30] hover:bg-[#f3dcae] disabled:opacity-50"
          >
            {view !== 'register' ? (
              <ArrowLeft size={17} />
            ) : (
              <FilePlus2 size={17} />
            )}

            {view !== 'register'
              ? 'Back to register'
              : 'Prepare new draft'}
          </ActionButton>
        </div>
      </header>

      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Invoice overview"
      >
        <TinyStat
          icon={ReceiptText}
          label="Issued invoices"
          value={billing ? String(issued.length) : '—'}
          detail="Issued invoices on this register page"
        />

        <TinyStat
          icon={WalletCards}
          label="Outstanding balance"
          value={billing ? money(outstanding) : '—'}
          detail="Unpaid balances on this page only"
        />

        <TinyStat
          icon={FileText}
          label="Open quotations"
          value={billing ? String(billing.documents.filter(doc=>doc.kind==='quotation' && ['draft','accepted'].includes(doc.state)).length) : '—'}
          detail="Draft / accepted quotes on this page"
        />

        <TinyStat
          icon={Landmark}
          label="Verified invoice settlements"
          value={billing ? money(settled) : '—'}
          detail="This page only. Includes POS allocations; do not add to POS revenue."
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

      {message && <div role="alert" className="rounded-xl border border-[#ecc9bf] bg-[#fff4ec] p-4 text-sm text-[#773445]">{message}</div>}
      {busy && <p role="status" className="text-sm text-[#6f5162]">Working on your billing request…</p>}

      {view === 'saved' && saved && billing ? (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
          <div className="grid min-w-0 gap-3">
            <DocumentPreview saved={saved} draft={savedDocumentDraft(saved)} calc={savedDocumentAmounts(saved)} />
            <ActionButton type="button" className={primary} onClick={() => window.print()} disabled={busy}>
              <Printer size={17} /> {saved.invoice_number ? 'Print invoice / Save PDF' : 'Print document / Save PDF'}
            </ActionButton>
          </div>
          <BillingDocumentControls key={saved.id + ':' + saved.revision} doc={saved} data={billing} busy={busy}
            run={mutate} edit={editSaved} />
        </div>
      ) : view === 'register' ? billing ? (
        <BillingRegister data={billing} filters={filters} busy={busy} open={openSaved}
          apply={next => void perform(() => readRegister(next))}
          configure={payload => mutate('configure',payload)} />
      ) : (
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

            <ActionButton
              className={secondary}
              type="button"
              onClick={freshDraft}
            >
              <Plus size={16} />
              New document draft
            </ActionButton>
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
              <ActionButton
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
              </ActionButton>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ede1dc] bg-white p-4">
            <span className="flex items-center gap-2 text-sm text-[#87747e]">
              <Search size={17} />
              Search issued references
            </span>

            <ActionButton type="button" disabled={busy} className={secondary}
              onClick={() => void perform(() => readRegister(billingFilters))}>Retry connection</ActionButton>
          </div>

          <div className="mt-5">
            <EmptyRegister
              tab={tab}
              onCompose={freshDraft}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#917b85]">
            <span>
              Completed in-store sales do not become invoices
              automatically.
            </span>

            {staffCatalogue && <Link
              href="/workspace/orders"
              className="inline-flex items-center gap-1.5 font-semibold text-[#7e4d31] hover:underline"
            >
              Open POS sales
              <ArrowRight size={15} />
            </Link>}
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
                {saved ? 'Edit saved draft' : 'Create a commercial document'}
              </h2>

              <p className="mt-1 text-sm text-[#8d7883]">
                Fill in the details and check the live document
                preview.
              </p>
            </div>

            <ActionButton
              type="button"
              className={secondary}
              onClick={startOver}
              disabled={busy}
            >
              <RotateCcw size={16} />
              Start over
            </ActionButton>
          </div>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(410px,.9fr)]">
            <fieldset disabled={busy} className="grid min-w-0 content-start gap-4" aria-label="Document fields">
              <section className={card + ' grid gap-5 p-4 sm:p-6'}>
                <SectionHeading
                  number="01"
                  title="Document details"
                  subtitle="Decide which document you are preparing and its dates."
                />

                {billing && <label className={label}>Billing store
                  <select className={control} value={storeId} disabled={!!saved} onChange={event => {
                    setStoreId(event.target.value);
                    setDraft(current => current.customerId
                      ? { ...current, customerId: undefined, recipient: '', email: '', phone: '', company: '', address: '' }
                      : current);
                  }}>
                    <option value="">Select a store</option>
                    {billing.stores.filter(store => store.active).map(store => <option value={store.id} key={store.id}>{store.name}</option>)}
                  </select>
                </label>}

                <div className="grid gap-3 sm:grid-cols-2">
                  {(['quotation', 'invoice'] as const).map(kind => (
                    <ActionButton
                      type="button"
                      key={kind}
                      aria-pressed={draft.kind === kind}
                      onClick={() => patch('kind', kind)}
                      disabled={!!saved}
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
                    </ActionButton>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={label}>
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays size={15} />
                      {billing && draft.kind === 'invoice' ? 'Draft document date' : 'Document date'}
                    </span>

                    <input
                      className={control}
                      type="date"
                      value={draft.issueDate}
                      onChange={event =>
                        patch('issueDate', event.target.value)
                      }
                    />
                    {billing && draft.kind === 'invoice' && <span className="font-normal">The official date is set when the server issues the invoice.</span>}
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

                {billing ? storeId && <InvoiceLookup key={storeId} title="Choose a customer from this store"
                  filterLabel="Search active customers (at least two characters)"
                  load={(search) => findBillingCustomers(storeId, search)} select={chooseCustomer} /> :
                  canBrowseCustomers && <InvoiceLookup title="Choose a customer from CRM" filterLabel="Search active customers"
                    load={findInvoiceCustomers} select={chooseCustomer} />}
                {draft.customerId && <p className="text-xs text-[#6f5162]">Linked to CRM. Editing the name, email or phone removes the link.</p>}

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
                          <ActionButton
                            type="button"
                            onClick={() => copyLine(line)}
                            disabled={draft.lines.length >= 30}
                            aria-label={`Duplicate line ${index + 1}`}
                            className="rounded-lg border border-[#e6d8cd] bg-white p-2 text-[#775268] hover:bg-[#fff1de] disabled:opacity-40"
                          >
                            <Copy size={16} />
                          </ActionButton>

                          <ActionButton
                            type="button"
                            onClick={() => removeLine(line.id)}
                            disabled={draft.lines.length === 1}
                            aria-label={`Remove line ${index + 1}`}
                            className="rounded-lg border border-[#e6d8cd] bg-white p-2 text-[#9f4955] hover:bg-[#fff1ef] disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </ActionButton>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <label className={label}>
                          Fragrance / description

                          <input
                            className={control}
                            maxLength={180}
                            value={line.description}
                            readOnly={!!line.variantId}
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
                            readOnly={!!line.variantId}
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
                            readOnly={!!line.variantId}
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

                <ActionButton
                  type="button"
                  className={secondary + ' justify-self-start'}
                  onClick={addLine}
                  disabled={draft.lines.length >= 30}
                >
                  <Plus size={17} />
                  Add another item
                  {draft.lines.length >= 30 && '(maximum 30)'}
                </ActionButton>

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
                    {billing ? 'Verified store tax rate (%)' : 'Tax rate (%) (optional)'}
                    <input className={control} inputMode="decimal" value={formDraft.taxRate} readOnly={!!billing}
                      onChange={event => patch('taxRate', event.target.value)} placeholder="No rate set" />
                    <span className="text-xs font-normal leading-5 text-[#6f5162]">{billing ?
                      'Applied after the discount. An owner verifies the rate before issuance.' :
                      'Applied after the discount. Use your approved rate for this preview.'}</span>
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
            </fieldset>

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

              <DocumentPreview draft={formDraft} calc={calc} />

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {billing && <ActionButton type="button" className={primary + ' sm:col-span-2'}
                  disabled={!storeId || !calc.valid || busy}
                  onClick={() => mutate('save', billingDraftPayload(formDraft, storeId, saved))}>
                  Save {draft.kind === 'quotation' ? 'quotation' : 'invoice'} draft
                </ActionButton>}
                <ActionButton
                  type="button"
                  className={primary}
                  disabled={!calc.valid}
                  onClick={() => window.print()}
                >
                  <Printer size={17} />
                  Print / Save PDF
                </ActionButton>

                <ActionButton
                  type="button"
                  className={secondary}
                  disabled={!calc.valid}
                  onClick={copySummary}
                >
                  <ClipboardCopy size={17} />
                  Copy summary
                </ActionButton>
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
                {billing ? 'Save to recover this draft after refresh. Printing a draft does not issue it or record payment.' :
                  'No server record is created. Closing or refreshing discards the draft; printing does not issue it or record payment.'}
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
    </div></ActionScope>
  );
}
