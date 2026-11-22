
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileWarning,
  Receipt,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { formatPrice } from '@/src/lib/golden-rose/contracts';
import {
  WorkspaceNotice,
  WorkspacePageHeader,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

export const metadata: Metadata = {
  title: 'Financial Reconciliation | Golden Rose Perfume',
  description: 'Verify financial evidence before releasing profit figures.',
};

type Report = {
  from: string;
  to: string;
  locationId: string | null;
  currency: 'NGN';
  completedSales: number;
  completedRevenueMinor: number;
  qaCodedSales: number;
  approvedExpensesMinor: number;
  paidRecordedExpensesMinor: number;
  invoiceOutstandingMinor: number;
  purchaseCommitmentsMinor: number;
  saleLines: number;
  validCostSnapshots: number;
  missingCostSnapshots: number;
  missingUnitCosts: number;
  costSnapshotMismatches: number;
  salesWithoutLines: number;
  saleTotalMismatches: number;
  knownSnapshotCostMinor: number;
  costSnapshotsComplete: boolean;
  refundLedgerConnected: boolean;
  profitAvailable: boolean;
};

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
};

const COUNT_KEYS = [
  'completedSales', 'completedRevenueMinor', 'qaCodedSales',
  'approvedExpensesMinor', 'paidRecordedExpensesMinor',
  'invoiceOutstandingMinor', 'purchaseCommitmentsMinor',
  'saleLines', 'validCostSnapshots', 'missingCostSnapshots',
  'missingUnitCosts', 'costSnapshotMismatches',
  'salesWithoutLines', 'saleTotalMismatches',
  'knownSnapshotCostMinor',
] as const;

function readFirst(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.from === 'string' && validDate(record.from) &&
    typeof record.to === 'string' && validDate(record.to) &&
    (record.locationId === null || typeof record.locationId === 'string') &&
    record.currency === 'NGN' &&
    COUNT_KEYS.every(key =>
      typeof record[key] === 'number' &&
      Number.isSafeInteger(record[key]) &&
      (record[key] as number) >= 0
    ) &&
    typeof record.costSnapshotsComplete === 'boolean' &&
    typeof record.refundLedgerConnected === 'boolean' &&
    typeof record.profitAvailable === 'boolean'
  );
}

async function loadFinancialReconciliation(from: string, to: string) {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_financial_reconciliation', {
    p_from: from || null,
    p_to: to || null,
    p_location_id: null,
  });

  if (error) {
    if (['PGRST202', '42883'].includes(error.code ?? '')) {
      throw new Error('The financial reconciliation migration has not been installed.');
    }
    if (error.code === '42501') {
      throw new Error('Access denied. Your reporting role or active staff session could not be verified.');
    }
    throw new Error('Financial reconciliation could not be loaded. Check your reporting access and retry.');
  }

  if (!isReport(data)) {
    throw new Error('The financial evidence response was incomplete or unsafe to display.');
  }

  return data;
}

function number(value: number): string {
  return value.toLocaleString('en-NG');
}

function EvidenceCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-[#f9eddf] text-[#a4773e]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-xs font-semibold text-[#765d6b]">{title}</h3>
      <p className="mt-2 break-words font-serif text-2xl text-[#4d1e34]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[#8b7782]">{description}</p>
    </article>
  );
}

export default function FinancialReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-6">Checking financial evidence…</p>}>
      <AuthorizedFinancialReconciliation searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizedFinancialReconciliation({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const staff = await requireStaff();
  if (!canViewModule(staff.role, 'reports')) notFound();

  const params = await searchParams;
  const from = readFirst(params.from);
  const to = readFirst(params.to);
  const inputInvalid = (from.length > 0 && !validDate(from)) ||
    (to.length > 0 && !validDate(to)) ||
    (from !== '' && to !== '' && from > to);

  let report: Report | null = null;
  let error = '';

  if (inputInvalid) {
    error = 'Choose valid dates in chronological order.';
  } else {
    try {
      report = await loadFinancialReconciliation(from, to);
    } catch (reason) {
      error = reason instanceof Error
        ? reason.message
        : 'The financial report could not be loaded.';
    }
  }

  const accountingGap = report
    ? report.missingCostSnapshots + report.missingUnitCosts +
      report.costSnapshotMismatches + report.salesWithoutLines +
      report.saleTotalMismatches
    : 0;

  return (
    <main className="grid min-w-0 gap-6 pb-12">
      <WorkspacePageHeader
        kicker="Management / Accounting integrity"
        title="Financial reconciliation"
        description="Compare completed sales with immutable cost-at-sale evidence. Profit is withheld until costs, returns and refunds are fully reconciled."
        actions={
          <Link href="/workspace/reports" className={workspaceSecondary}>
            Reports &amp; Analytics <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      <form method="get" action="/workspace/reports/reconciliation"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-4"
      >
        <label className="grid min-w-40 gap-2 text-sm font-semibold text-[#54213a]">
          Start date
          <input type="date" name="from" defaultValue={from}
            className={workspaceInput} />
        </label>
        <label className="grid min-w-40 gap-2 text-sm font-semibold text-[#54213a]">
          End date
          <input type="date" name="to" defaultValue={to}
            className={workspaceInput} />
        </label>
        <button type="submit" className={workspacePrimary}>Check records</button>
        <Link href="/workspace/reports/reconciliation" className={workspaceSecondary}>
          Latest 30 days
        </Link>
      </form>

      {error && (
        <WorkspaceNotice title="Financial reconciliation unavailable" tone="error">
          {error}
        </WorkspaceNotice>
      )}

      {report && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#7a6873]">
            <span className="rounded-full border border-[#ead9bd] bg-[#fff7e9] px-3 py-2 font-semibold">
              {report.from} to {report.to} · Africa/Lagos
            </span>
            <span>{report.locationId ? 'Assigned store' : 'Authorized reporting scope'}</span>
          </div>

          <section aria-label="Recorded financial evidence"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EvidenceCard title="Completed POS revenue"
              value={formatPrice(report.completedRevenueMinor)}
              description={`${number(report.completedSales)} completed sale(s), before any unrecorded refunds.`}
              icon={Receipt} />
            <EvidenceCard title="Approved expenses"
              value={formatPrice(report.approvedExpensesMinor)}
              description={`${formatPrice(report.paidRecordedExpensesMinor)} recorded as paid; not yet proof of bank settlement.`}
              icon={Wallet} />
            <EvidenceCard title="Invoice outstanding"
              value={formatPrice(report.invoiceOutstandingMinor)}
              description="Unpaid amounts on issued invoices within this report's date range. Not additional POS revenue."
              icon={ClipboardCheck} />
            <EvidenceCard title="Purchase commitments"
              value={formatPrice(report.purchaseCommitmentsMinor)}
              description="Approved purchase-order commitments; not automatically an expense."
              icon={FileWarning} />
          </section>

          <section className="grid min-w-0 gap-4 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-5 sm:p-6"
            aria-labelledby="gr-cost-reconciliation">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="gr-cost-reconciliation" className="font-serif text-2xl text-[#4d1e34]">
                Cost-of-goods-sold evidence
              </h2>
              <span className={report.costSnapshotsComplete
                ? 'rounded-full bg-[#e8f4e9] px-3 py-2 text-xs font-semibold text-[#2c6a42]'
                : 'rounded-full bg-[#fff0d7] px-3 py-2 text-xs font-semibold text-[#8d5b22]'}>
                {report.costSnapshotsComplete ? 'Snapshots complete' : 'Reconciliation required'}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <EvidenceCard icon={BadgeCheck} title="Cost snapshots verified"
                value={`${number(report.validCostSnapshots)} / ${number(report.saleLines)}`}
                description="Cost snapshots captured at the time each POS sale line was recorded." />
              <EvidenceCard icon={AlertTriangle} title="Missing cost evidence"
                value={number(report.missingCostSnapshots + report.missingUnitCosts)}
                description={`${number(report.missingCostSnapshots)} absent snapshots; ${number(report.missingUnitCosts)} snapshots without usable unit cost.`} />
              <EvidenceCard icon={FileWarning} title="Sale integrity exceptions"
                value={number(report.saleTotalMismatches + report.salesWithoutLines + report.costSnapshotMismatches)}
                description="Unexpected sale totals, missing sale lines, or mismatched cost snapshot quantities." />
            </div>

            <p className="rounded-xl border border-[#e9d9c9] bg-[#fdf9f3] p-4 text-sm leading-6 text-[#725c67]">
              <strong>Verified cost evidence:</strong>{' '}
              {formatPrice(report.knownSnapshotCostMinor)} from matching,
              nonnegative cost snapshots only. This is a partial cost-evidence
              subtotal—not necessarily complete COGS, and not a profit figure.
            </p>

            {accountingGap > 0 && (
              <WorkspaceNotice title="Historical costs need reconciliation" tone="pending">
                {number(accountingGap)} cost or sale integrity exception(s) were
                found in this reporting period. Do not backfill an old sale using
                today&apos;s catalogue cost: that would misstate historical profit.
              </WorkspaceNotice>
            )}
          </section>

          <section className="grid gap-3 lg:grid-cols-2" aria-label="Profit readiness">
            <div className="rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-5">
              <div className="flex items-center gap-3 text-[#8d5b22]">
                <AlertTriangle size={21} aria-hidden="true" />
                <h2 className="font-serif text-xl text-[#4d1e34]">Refunds and returns</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#765e6c]">
                {report.refundLedgerConnected
                  ? 'The refund ledger is connected; recorded refunds still require payment and stock reconciliation.'
                  : 'A refund and returns ledger is not integrated with this report. The current revenue total is not automatically net of customer refunds.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-5">
              <div className="flex items-center gap-3 text-[#8d5b22]">
                <ShieldCheck size={21} aria-hidden="true" />
                <h2 className="font-serif text-xl text-[#4d1e34]">Gross / net profit</h2>
              </div>
              <p className="mt-3 font-serif text-2xl text-[#4d1e34]">
                {report.profitAvailable ? 'Requires reconciliation review' : 'Unavailable'}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#765e6c]">
                Gross and net profit are deliberately withheld until historical
                COGS, refunds, payment evidence and operating costs agree.
              </p>
            </div>
          </section>

          {report.qaCodedSales > 0 && (
            <WorkspaceNotice title="QA transactions in this date range" tone="pending">
              {number(report.qaCodedSales)} completed sale(s) contain QA-labelled
              product lines. Exclude or separately identify them in any financial
              statement prepared for the real Golden Rose business.
            </WorkspaceNotice>
          )}

          <p className="text-xs leading-5 text-[#82717b]">
            This is a read-only evidence report. No stock, sales, refunds,
            historical costs or payment records are created or modified here.
          </p>
        </>
      )}
    </main>
  );
}
