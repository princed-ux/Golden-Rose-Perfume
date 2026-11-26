
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSearch,
  Package,
  ShieldCheck,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

import {
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspacePrimary,
} from '@/src/components/workspace/page-layout';

export const metadata: Metadata = {
  title: 'Cost Integrity | Golden Rose Perfume',
};

type CostCoverage = {
  from: string;
  to: string;
  locationId: string | null;
  currency: string;
  saleLineCount: number;
  coveredLineCount: number;
  missingLineCount: number;
  provisionalCatalogueCostMinor: number;
  qaCodedTransactions: number;
  provisionalGrossMarginMinor: number | null;
  isAccountingProfit: boolean;
  costBasis: string;
  historicalBackfillApplied: boolean;
};

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function todayInLagos(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function daysBefore(date: string, days: number): string {
  const current = new Date(`${date}T00:00:00.000Z`);

  current.setUTCDate(current.getUTCDate() - days);

  return current.toISOString().slice(0, 10);
}

function Metric({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-gr-border bg-gr-surface p-5">
      <p className="text-sm font-semibold text-gr-muted">
        {title}
      </p>

      <p className="mt-3 break-words font-serif text-3xl text-gr-text">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gr-muted">
        {description}
      </p>
    </article>
  );
}

export default function CostIntegrityPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-5 text-sm text-gr-muted">
          Loading cost integrity records…
        </p>
      }
    >
      <CostIntegrityContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CostIntegrityContent({
  searchParams,
}: PageProps) {
  const staff = await requireStaff();

  if (!canViewModule(staff.role, 'reports')) {
    notFound();
  }

  const params = await searchParams;
  const today = todayInLagos();

  const from = params.from || daysBefore(today, 29);
  const to = params.to || today;

  let report: CostCoverage | null = null;
  let errorMessage = '';

  if (!validDate(from) || !validDate(to) || from > to) {
    errorMessage = 'Select a valid reporting date range.';
  } else {
    try {
      const supabase = await createClient();

      const response = await supabase.rpc(
        'gr_pos_cost_coverage',
        {
          p_from: from,
          p_to: to,
          p_location_id: null,
        },
      );

      if (response.error) {
        console.error(
          '[Golden Rose cost coverage]',
          {
            code: response.error.code,
          },
        );

        errorMessage =
          response.error.code === '42501'
            ? 'Your current staff role or session cannot access financial cost information.'
            : 'The cost reporting service is unavailable. Verify the database migration and connection.';
      } else {
        const value = response.data as CostCoverage | null;

        if (
          value &&
          typeof value.saleLineCount === 'number' &&
          typeof value.coveredLineCount === 'number' &&
          typeof value.missingLineCount === 'number' &&
          typeof value.provisionalCatalogueCostMinor ===
            'number' &&
          typeof value.qaCodedTransactions === 'number'
        ) {
          report = value;
        } else {
          errorMessage =
            'The cost reporting service returned incomplete data.';
        }
      }
    } catch {
      errorMessage =
        'Unable to connect to the cost reporting service.';
    }
  }

  const coverage =
    report && report.saleLineCount > 0
      ? Math.min(
          100,
          (report.coveredLineCount /
            report.saleLineCount) *
            100,
        )
      : null;

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Financial intelligence / Cost controls"
        title="Cost Integrity"
        description="Check whether recorded POS sales have historical product-cost evidence before interpreting profitability."
        actions={
          <Link
            href="/workspace/reports"
            className="inline-flex min-h-11 items-center rounded-xl border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text"
          >
            Back to financial reports
          </Link>
        }
      />

      <WorkspacePanel className="grid gap-4">
        <div className="flex items-center gap-2">
          <FileSearch
            size={19}
            className="text-gr-gold"
          />

          <h2 className="font-serif text-xl text-gr-text">
            Reporting period
          </h2>
        </div>

        <form
          method="get"
          action="/workspace/reports/costs"
          className="grid gap-3 sm:grid-cols-3"
        >
          <label className="grid gap-2 text-sm font-semibold text-gr-text">
            From

            <input
              type="date"
              name="from"
              defaultValue={from}
              className={workspaceInput}
              required
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-gr-text">
            To

            <input
              type="date"
              name="to"
              defaultValue={to}
              className={workspaceInput}
              required
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className={workspacePrimary + ' w-full'}
            >
              View cost coverage
            </button>
          </div>
        </form>
      </WorkspacePanel>

      {errorMessage && (
        <WorkspaceNotice
          title="Cost information unavailable"
          tone="error"
        >
          {errorMessage}
        </WorkspaceNotice>
      )}

      {report && (
        <>
          <WorkspaceNotice title="What the figures mean">
            These are catalogue-cost snapshots captured
            when POS sale lines are inserted. They are
            provisional evidence, not a verified
            FIFO or weighted-average cost-of-goods-sold
            calculation. Existing historical receipts
            are not automatically backfilled.
          </WorkspaceNotice>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="POS sale lines"
              value={report.saleLineCount.toLocaleString(
                'en-NG',
              )}
              description="All recorded product lines in the selected period."
            />

            <Metric
              title="Lines with cost snapshots"
              value={report.coveredLineCount.toLocaleString(
                'en-NG',
              )}
              description="Lines whose catalogue costs were captured when inserted."
            />

            <Metric
              title="Missing cost evidence"
              value={report.missingLineCount.toLocaleString(
                'en-NG',
              )}
              description="Historical or incomplete lines without usable cost snapshots."
            />

            <Metric
              title="Captured catalogue costs"
              value={formatPrice(
                report.provisionalCatalogueCostMinor,
              )}
              description="Combined provisional cost of covered lines only. Incomplete coverage excludes missing costs."
            />
          </div>

          <WorkspacePanel className="grid gap-4">
            <div className="flex items-center gap-3">
              {coverage === 100 ? (
                <CheckCircle2
                  size={22}
                  className="text-gr-success"
                />
              ) : (
                <AlertTriangle
                  size={22}
                  className="text-gr-gold"
                />
              )}

              <h2 className="font-serif text-2xl text-gr-text">
                Cost snapshot coverage
              </h2>
            </div>

            <p className="font-serif text-3xl text-gr-text">
              {coverage === null
                ? 'No sale lines'
                : `${coverage.toFixed(1)}%`}
            </p>

            <div
              className="h-3 overflow-hidden rounded-full bg-gr-surface-alt"
              role="progressbar"
              aria-label="Cost snapshot coverage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={coverage ?? 0}
            >
              <div
                className="h-full rounded-full bg-gr-strong"
                style={{
                  width: `${coverage ?? 0}%`,
                }}
              />
            </div>

            <p className="text-sm leading-6 text-gr-muted">
              A complete snapshot set only confirms
              that the catalogue costs were preserved.
              Actual acquisition-cost accuracy still
              requires supplier purchasing and stock
              valuation reconciliation.
            </p>
          </WorkspacePanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkspacePanel className="grid gap-3">
              <div className="flex items-center gap-2">
                <BarChart3
                  size={20}
                  className="text-gr-gold"
                />
                <h2 className="font-serif text-xl text-gr-text">
                  Provisional margin
                </h2>
              </div>

              <p className="font-serif text-3xl text-gr-text">
                {report.provisionalGrossMarginMinor !== null
                  ? formatPrice(
                      report.provisionalGrossMarginMinor,
                    )
                  : 'Unavailable'}
              </p>

              <p className="text-sm leading-6 text-gr-muted">
                Displayed only when every selected
                sale line has a cost snapshot and
                there are no QA-labelled transactions.
                This is not certified gross or net profit.
              </p>
            </WorkspacePanel>

            <WorkspacePanel className="grid gap-3">
              <div className="flex items-center gap-2">
                <Package
                  size={20}
                  className="text-gr-gold"
                />
                <h2 className="font-serif text-xl text-gr-text">
                  Historical import readiness
                </h2>
              </div>

              <p className="text-sm text-gr-muted">
                {report.historicalBackfillApplied
                  ? 'Historical import metadata is present.'
                  : 'Historical sale-cost import has not been applied.'}
              </p>

              <p className="text-sm leading-6 text-gr-muted">
                Importing Odoo sale, purchase and
                inventory valuation records will
                require reconciled product identifiers,
                transaction dates, currencies and costs.
              </p>
            </WorkspacePanel>
          </div>

          {report.qaCodedTransactions > 0 && (
            <WorkspaceNotice
              title="Testing transactions included"
              tone="pending"
            >
              {report.qaCodedTransactions} completed
              POS transaction(s) contain QA-labelled
              products in this period. Do not interpret
              their values as genuine business revenue
              or profit.
            </WorkspaceNotice>
          )}

          <WorkspaceNotice title="Financial reporting safeguards">
            <div className="flex items-start gap-2">
              <ShieldCheck
                size={19}
                className="mt-0.5 shrink-0"
              />

              <span>
                Cost snapshots are preserved separately
                from mutable product catalogue prices.
                Financial correction and historical
                import workflows must be audited before
                they affect official reports.
              </span>
            </div>
          </WorkspaceNotice>
        </>
      )}
    </div>
  );
}
