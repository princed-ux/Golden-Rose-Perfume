import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Banknote, CalendarDays, ClipboardList,
  PackageCheck, ReceiptText, RefreshCw, Search, ShieldCheck,
  Store, type LucideIcon,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import {
  WorkspaceNotice, WorkspacePageHeader, WorkspacePanel,
  workspaceInput, workspaceLabel, workspacePrimary, workspaceSecondary,
} from '@/src/components/workspace/page-layout';
import { loadRecordedReceipt, loadSalesPage, type RecordedReceipt, type SaleFilters } from './data';
import { PrintSaleReceipt } from './print-button';
import './orders-print.css';

export const metadata: Metadata = {
  title: 'Sales & Orders | Golden Rose Perfume',
  description: 'Authorized sales history, store-scoped receipts and transaction records.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currency = new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 2,
});
const money = (minor: number) => currency.format(minor / 100);
const when = (value: string) => new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos',
}).format(new Date(value));
const card = 'min-w-0 rounded-2xl border border-[#e4d4cb] bg-[#fffdfa] p-6 shadow-[0_8px_28px_rgba(55,19,35,0.06)]';

function Summary({
  label, value, detail, icon: Icon,
}: {
  label: string; value: string; detail: string; icon: LucideIcon;
}) {
  return <article className={card}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold leading-5 text-[#5b394b]">{label}</span>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f4e6ce] text-[#8d6334]">
        <Icon size={21} strokeWidth={2} aria-hidden="true" />
      </span>
    </div>
    <strong className="mt-4 block break-words font-serif text-[clamp(1.8rem,3vw,2.5rem)] font-semibold leading-tight tabular-nums text-[#3d152b]">
      {value}
    </strong>
    <p className="mt-2 text-sm leading-6 text-[#705761]">{detail}</p>
  </article>;
}

function SaleReceipt({ receipt }: { receipt: RecordedReceipt }) {
  return <div className="grid min-w-0 gap-5">
    <WorkspacePageHeader
      kicker="Verified transaction / Receipt reprint"
      title={'Receipt GR-' + String(receipt.saleNumber).padStart(7, '0')}
      description="This receipt is reconstructed from the original confirmed POS transaction. No payment or inventory changes are made by reprinting."
      actions={<div className="flex flex-wrap gap-2">
        <Link className={workspaceSecondary} href="/workspace/orders">
          <ArrowLeft size={17} aria-hidden="true" /> Back to sales
        </Link>
        <PrintSaleReceipt />
      </div>}
    />

    <div className="mx-auto w-full max-w-[760px]">
      <article
        id="gr-sales-receipt"
        className="rounded-2xl border border-[#e9ddd5] bg-white p-6 shadow-[0_8px_36px_rgba(50,19,33,0.06)] sm:p-10"
        aria-label="Confirmed sales receipt"
      >
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[#e9dfd9] pb-6">
          <div>
            <p className="font-serif text-3xl tracking-wide text-[#471b31]">GOLDEN ROSE</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.23em] text-[#aa803f]">
              Beauty of Fragrance
            </p>
            <p className="mt-5 text-xs text-[#6f5b65]">Sales receipt · Payment confirmed</p>
          </div>
          <div className="text-left text-sm sm:text-right">
            <strong className="text-[#48263b]">
              GR-{String(receipt.saleNumber).padStart(7, '0')}
            </strong>
            <p className="mt-2 text-[#766571]">{when(receipt.createdAt)}</p>
            <p className="text-[#766571]">{receipt.locationName}</p>
            <p className="mt-2 font-semibold text-[#356846]">COMPLETED · CASH</p>
          </div>
        </header>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead className="border-b border-[#e9dfd9] text-xs text-[#7e6471]">
              <tr>
                <th scope="col" className="pb-3 pr-3 font-semibold">Fragrance</th>
                <th scope="col" className="pb-3 text-right font-semibold">Qty</th>
                <th scope="col" className="pb-3 pl-3 text-right font-semibold">Unit</th>
                <th scope="col" className="pb-3 pl-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1e8e3]">
              {receipt.items.map((line, index) => (
                <tr key={line.variantId + ':' + index}>
                  <td className="py-3 pr-3">
                    <strong className="block font-semibold text-[#48263b]">{line.name}</strong>
                    <span className="text-xs text-[#8a7580]">
                      {[line.sku, line.sizeMl ? line.sizeMl + ' ml' : null].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-3 pl-3 text-right tabular-nums">{money(line.unitPriceMinor)}</td>
                  <td className="py-3 pl-3 text-right font-semibold tabular-nums">{money(line.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-6 grid max-w-[360px] gap-2 border-t border-[#e9dfd9] pt-5 text-sm">
          {[
            ['Subtotal', receipt.subtotalMinor],
            ['Discount', -receipt.discountMinor],
            ['Tax', receipt.taxMinor],
          ].map(([name, amount]) => (
            <div className="flex justify-between gap-4" key={name}>
              <span className="text-[#765f6b]">{name}</span>
              <span className="tabular-nums text-[#45293a]">{money(Number(amount))}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between gap-4 border-t border-[#e9dfd9] pt-3 text-base font-bold text-[#471b31]">
            <span>Total paid</span><span>{money(receipt.totalMinor)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Cash received</span><span>{money(receipt.tenderedMinor)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Change returned</span><span>{money(receipt.changeMinor)}</span>
          </div>
        </div>

        <footer className="mt-10 border-t border-[#e9dfd9] pt-5 text-center text-xs leading-6 text-[#75626c]">
          Thank you for shopping with Golden Rose Perfume.
          <p>Keep this receipt as proof of this completed purchase.</p>
        </footer>
      </article>
    </div>
  </div>;
}

type Params = Record<string, string | string[] | undefined>;
const single = (params: Params, name: string) =>
  typeof params[name] === 'string' ? params[name] as string : '';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { role, token } = await requireStaff();
  if (!canViewModule(role, 'orders')) notFound();

  const params = await searchParams;
  const requestedReceipt = single(params, 'saleId');
  if (requestedReceipt) {
    if (!UUID.test(requestedReceipt)) {
      return <WorkspaceNotice title="Invalid receipt reference" tone="error">
        Return to <Link href="/workspace/orders" className="underline">Sales & Orders</Link> and select a recorded sale.
      </WorkspaceNotice>;
    }
    let receipt: RecordedReceipt | null = null;
    let receiptError = '';
    try {
      receipt = await loadRecordedReceipt(token, requestedReceipt);
    } catch (error) {
      receiptError = error instanceof Error ? error.message : 'Try again later.';
    }

    // JSX is rendered outside the data-fetch try/catch.
    // Rendering errors should propagate to the Next.js error boundary.
    if (receipt) return <SaleReceipt receipt={receipt} />;
    return <div className="grid gap-4">
      <WorkspacePageHeader title="Receipt unavailable" kicker="Sales & Orders"
        actions={<Link className={workspaceSecondary} href="/workspace/orders">Back to sales</Link>} />
      <WorkspaceNotice title="Could not retrieve receipt" tone="error">
        {receiptError || 'Receipt data is unavailable.'}
      </WorkspaceNotice>
    </div>;
  }

  const search = single(params, 'search').trim().slice(0, 100);
  const from = single(params, 'from');
  const to = single(params, 'to');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const filters: SaleFilters = {
    search,
    from: datePattern.test(from) ? from : '',
    to: datePattern.test(to) ? to : '',
    offset: /^\d{1,5}$/.test(single(params, 'offset')) &&
      Number(single(params, 'offset')) <= 10000
      ? Number(single(params, 'offset')) : 0,
  };

  let page: Awaited<ReturnType<typeof loadSalesPage>> | null = null;
  let failure = '';
  try {
    page = await loadSalesPage(token, filters);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Sales History could not be loaded.';
  }

  const sales = page?.items ?? [];
  const totalOnPage = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const unitsOnPage = sales.reduce((sum, sale) => sum + sale.units, 0);
  const distinctStores = new Set(sales.map(sale => sale.locationId)).size;
  function pageLink(offset: number) {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    query.set('offset', String(offset));
    return '/workspace/orders?' + query.toString();
  }

  return <div className="grid min-w-0 gap-6 pb-10">
    <WorkspacePageHeader
      kicker="Golden Rose / Commerce"
      title="Sales & Orders"
      description="Review confirmed in-store transactions, find products sold, and reprint receipts. Web and WhatsApp order connections will appear separately once verified."
      actions={<div className="flex flex-wrap gap-2">
        <Link className={workspaceSecondary} href="/workspace/orders">
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </Link>
        {canViewModule(role, 'pos') && (
          <Link
            className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl border border-[#bd904b] bg-[#e3bd78] px-5 py-3 text-base font-bold !text-[#321a29] shadow-[0_6px_18px_rgba(60,30,30,.12)] transition hover:border-[#ab7834] hover:bg-[#f1d29a] hover:!text-[#321a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b622d]"
            href="/workspace/pos"
          >
            <Banknote size={19} aria-hidden="true" />
            Open POS
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}
      </div>}
    />

    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label="Sales channels">
      <span className="rounded-full border border-[#cfb58c] bg-[#fff4e3] px-3 py-1.5 text-[#815625]">
        In-store · Confirmed cash sales
      </span>
      <span className="rounded-full border border-[#e7dcd7] bg-white px-3 py-1.5 text-[#8b7b81]">
        Online and WhatsApp orders · Not connected
      </span>
    </nav>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Visible sales summary">
      <Summary label="Sales on this page" value={page ? String(sales.length) : '—'}
        detail="Confirmed records on the current page only" icon={ReceiptText} />
      <Summary label="Paid value shown" value={page ? money(totalOnPage) : '—'}
        detail="Cash POS totals on this page, not all-time revenue" icon={Banknote} />
      <Summary label="Units sold shown" value={page ? unitsOnPage.toLocaleString('en-NG') : '—'}
        detail="Product units included in visible receipts" icon={PackageCheck} />
      <Summary label="Stores represented" value={page ? String(distinctStores) : '—'}
        detail="Physical selling locations in these results" icon={Store} />
    </section>

    <WorkspacePanel className="grid gap-5" label="gr-sales-filters">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gr-sales-filters" className="font-serif text-2xl text-[#471c32]">Find a transaction</h2>
          <p className="mt-1 text-sm leading-6 text-[#705d68]">Search by receipt number, fragrance or SKU. Dates use Lagos local time.</p>
        </div>
        <ShieldCheck size={20} className="text-[#9b733e]" aria-hidden="true" />
      </div>
      <form method="get" action="/workspace/orders"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <label className={workspaceLabel}>Receipt / product
          <span className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[#a68153]" aria-hidden="true" />
            <input name="search" className={workspaceInput + ' pl-9'} defaultValue={filters.search}
              maxLength={100} placeholder="GR number, fragrance or SKU" />
          </span>
        </label>
        <label className={workspaceLabel}>From
          <input type="date" name="from" defaultValue={filters.from} className={workspaceInput} />
        </label>
        <label className={workspaceLabel}>To
          <input type="date" name="to" defaultValue={filters.to} className={workspaceInput} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={workspacePrimary}>
            <CalendarDays size={16} aria-hidden="true" /> Apply
          </button>
          <Link href="/workspace/orders" className={workspaceSecondary}>Clear</Link>
        </div>
      </form>
    </WorkspacePanel>

    <WorkspacePanel className="grid gap-4" label="gr-sales-register">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gr-sales-register" className="font-serif text-2xl text-[#471c32]">Recorded sales</h2>
          <p className="mt-1 text-sm leading-6 text-[#705d68]">
            {page ? 'Real completed transactions · Most recent first' : 'Retrieving the protected sales ledger'}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-[#8c7680]">
          <ClipboardList size={16} aria-hidden="true" /> Store-scoped access
        </span>
      </div>

      {failure ? (
        <WorkspaceNotice title="Sales register unavailable" tone="error"
          action={<Link className={workspaceSecondary} href="/workspace/orders">Retry</Link>}>
          {failure} Existing transactions have not been changed.
        </WorkspaceNotice>
      ) : sales.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-[#e7d9d2] bg-[#fffcf8] px-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#f7ebdb] text-[#a27a44]">
            <ReceiptText size={25} aria-hidden="true" />
          </span>
          <h3 className="font-serif text-xl text-[#471c32]">
            {filters.search || filters.from || filters.to ? 'No sales match these filters' : 'No completed POS sales yet'}
          </h3>
          <p className="max-w-md text-sm leading-6 text-[#87747d]">
            {filters.search || filters.from || filters.to
              ? 'Try another date range, receipt number, product name or SKU.'
              : 'Confirmed cash sales will appear automatically after a real POS checkout. No example transactions are shown.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#eee2dc]" role="region"
          aria-label="Sales history table" tabIndex={0}>
          <table className="w-full min-w-[900px] border-collapse text-left text-base">
            <thead className="bg-[#f9f0e6] text-xs font-bold uppercase tracking-wide text-[#624957]">
              <tr>
                <th scope="col" className="px-4 py-3">Receipt</th>
                <th scope="col" className="px-4 py-3">Date / time</th>
                <th scope="col" className="px-4 py-3">Store</th>
                <th scope="col" className="px-4 py-3">Products</th>
                <th scope="col" className="px-4 py-3">Payment</th>
                <th scope="col" className="px-4 py-3 text-right">Paid</th>
                <th scope="col" className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e5e0]">
              {sales.map(sale => (
                <tr key={sale.saleId} className="bg-white hover:bg-[#fffaf5]">
                  <td className="px-4 py-4 font-semibold text-[#482438]">
                    GR-{String(sale.saleNumber).padStart(7, '0')}
                  </td>
                  <td className="px-4 py-4 text-[#67525d]">{when(sale.createdAt)}</td>
                  <td className="px-4 py-4 text-[#67525d]">{sale.locationName}</td>
                  <td className="px-4 py-4 text-[#67525d]">
                    {sale.units} unit{sale.units === 1 ? '' : 's'}
                    <span className="block text-sm text-[#77616c]">{sale.lineCount} line{sale.lineCount === 1 ? '' : 's'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[#e9f4eb] px-2.5 py-1 text-xs font-semibold text-[#347148]">
                      Cash · Completed
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums text-[#471c32]">{money(sale.totalMinor)}</td>
                  <td className="px-4 py-4 text-right">
                    <Link href={'/workspace/orders?saleId=' + encodeURIComponent(sale.saleId)}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#7f4f28] underline-offset-2 hover:underline">
                      View receipt <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page && (page.hasMore || filters.offset > 0) && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee3df] pt-4"
          aria-label="Sales pages">
          <span className="text-xs text-[#86717d]">
            Page {Math.floor(filters.offset / page.limit) + 1} · {sales.length} displayed
          </span>
          <div className="flex gap-2">
            {filters.offset > 0 && (
              <Link className={workspaceSecondary}
                href={pageLink(Math.max(0, filters.offset - page.limit))}>Previous</Link>
            )}
            {page.hasMore && (
              <Link className={workspaceSecondary}
                href={pageLink(filters.offset + page.limit)}>
                Next <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </WorkspacePanel>

    <p className="text-xs leading-6 text-[#87747d]">
      Sales & Orders currently reads confirmed in-store cash POS transactions only.
      Quotations, invoices, online orders and WhatsApp checkout require separate
      verified business records and will not be treated as completed POS sales.
    </p>
  </div>;
}
