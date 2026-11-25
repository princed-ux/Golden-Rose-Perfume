import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { formatPrice } from '@/src/lib/golden-rose/contracts';

import {
  WorkspaceNotice,
  WorkspacePageHeader,
  WorkspacePanel,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

export const metadata: Metadata = {
  title: 'Reports & Analytics | Golden Rose Perfume',
  description: 'Authorized financial and operational reporting.',
};

type Location = {
  id: string;
  name: string;
};

type TrendPoint = {
  period: string;
  totalMinor: number;
  transactions: number;
};

type StoreSales = {
  name: string;
  totalMinor: number;
  transactions: number;
};

type FinancialReport = {
  from: string;
  to: string;
  locationId: string | null;
  locations: Location[];
  currency: string;
  timeZone: string;
  profitAvailable: boolean;

  paymentBreakdown?: {
    cashMinor: number;
    transferMinor: number;
    cardMinor: number;
    splitTransactions: number;
    cashTenderedMinor: number;
    cashChangeMinor: number;
    totalMinor: number;
  } | null;

  sales: {
    transactions: number;
    totalMinor: number;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    qaCodedTransactions: number;
  };

  expenses: {
    approvedMinor: number;
    paidRecordedMinor: number;
    pendingMinor: number;
  };

  purchasing: {
    draftOrders: number;
    approvedOrders: number;
    commitmentsMinor: number;
    receipts: number;
    receivedUnits: number;
  };

  invoices: {
    issuedCount: number;
    issuedMinor: number;
    outstandingMinor: number;
  };

  trend: TrendPoint[];
  storeSales: StoreSales[];
};

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
  location?: string | string[];
};

type Props = {
  searchParams: Promise<SearchParams>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(value?: string | string[]): string {
  return typeof value === 'string' ? value : '';
}

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function lagosToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find(item => item.type === type)?.value ?? '';

  return [
    part('year'),
    part('month'),
    part('day'),
  ].join('-');
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof BarChart3;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#765d6b]">
          {title}
        </p>

        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f9eddf] text-[#a4773e]">
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>

      <p className="mt-3 break-words font-serif text-[clamp(1.5rem,3vw,2rem)] text-[#4d1e34]">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#8b7782]">
        {detail}
      </p>
    </article>
  );
}

function SectionHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h2 className="font-serif text-2xl text-[#512238]">
      {children}
    </h2>
  );
}

export default function ReportsPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-sm text-[#765d6b]">
          Loading financial reports…
        </p>
      }
    >
      <AuthorizedReports searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizedReports({
  searchParams,
}: Props) {
  const staff = await requireStaff();

  if (!canViewModule(staff.role, 'reports')) {
    notFound();
  }

  const params = await searchParams;

  const rawFrom = first(params.from);
  const rawTo = first(params.to);
  const locationId = first(params.location);

  const invalidInput =
    (rawFrom !== '' && !validDate(rawFrom)) ||
    (rawTo !== '' && !validDate(rawTo)) ||
    (
      locationId !== '' &&
      !/^[0-9a-f-]{36}$/i.test(locationId)
    );

  let report: FinancialReport | null = null;
  let errorMessage = '';

  if (invalidInput) {
    errorMessage =
      'Choose valid calendar dates and an authorized location.';
  } else {
    try {
      const client = await createClient();

      const response = await client.rpc(
        'gr_financial_overview',
        {
          p_from: rawFrom || null,
          p_to: rawTo || null,
          p_location_id: locationId || null,
        },
      );

      if (response.error) {
        console.error(
          '[Golden Rose financial reporting]',
          {
            code: response.error.code,
            message: response.error.message,
          },
        );

        errorMessage =
          response.error.code === '42501'
            ? 'Your staff account cannot access this report or location.'
            : response.error.code === '22023'
              ? 'The selected report filters are invalid.'
              : 'Financial records could not be loaded. Check the database connection and retry.';
      } else {
        const result =
          response.data as FinancialReport | null;

        if (
          result &&
          typeof result === 'object' &&
          typeof result.sales?.totalMinor === 'number' &&
          typeof result.sales?.transactions === 'number' &&
          typeof result.expenses?.approvedMinor === 'number' &&
          typeof result.purchasing?.commitmentsMinor === 'number' &&
          typeof result.invoices?.outstandingMinor === 'number' &&
          Array.isArray(result.trend) &&
          Array.isArray(result.locations) &&
          Array.isArray(result.storeSales)
        ) {
          report = result;
        } else {
          errorMessage =
            'The reporting service returned incomplete information.';
        }
      }
    } catch {
      errorMessage =
        'The reporting service could not be reached.';
    }
  }

  const today = lagosToday();
  const currentYear = today.slice(0, 4);
  const lastYear = String(Number(currentYear) - 1);

  const presets = [
    {
      label: 'Today',
      from: today,
      to: today,
    },
    {
      label: 'Last 7 days',
      from: shiftDate(today, -6),
      to: today,
    },
    {
      label: 'Last 30 days',
      from: shiftDate(today, -29),
      to: today,
    },
    {
      label: 'This month',
      from: `${today.slice(0, 7)}-01`,
      to: today,
    },
    {
      label: 'This year',
      from: `${currentYear}-01-01`,
      to: today,
    },
    {
      label: 'Last year',
      from: `${lastYear}-01-01`,
      to: `${lastYear}-12-31`,
    },
  ];

  const largestSale = Math.max(
    0,
    ...(report?.trend.map(item => item.totalMinor) ?? []),
  );

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Management / Financial intelligence"
        title="Reports & Analytics"
        description="Recorded sales, purchasing, operating expenses and outstanding invoices. Figures use authorized business records in the Africa/Lagos time zone."
        actions={
          <Link
            href="/workspace/orders"
            className={workspaceSecondary}
          >
            View sales register
          </Link>
        }
      />

      <WorkspacePanel className="grid gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays
            size={20}
            className="text-[#a4773e]"
          />

          <SectionHeading>
            Reporting period
          </SectionHeading>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map(preset => {
            const query = new URLSearchParams({
              from: preset.from,
              to: preset.to,
            });

            if (report?.locationId) {
              query.set('location', report.locationId);
            }

            return (
              <Link
                key={preset.label}
                href={`/workspace/reports?${query.toString()}`}
                className={workspaceSecondary}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>

        <form
          action="/workspace/reports"
          method="get"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="grid gap-2 text-sm font-semibold text-[#54213a]">
            From date

            <input
              type="date"
              name="from"
              required
              defaultValue={
                report?.from ??
                (
                  validDate(rawFrom)
                    ? rawFrom
                    : shiftDate(today, -29)
                )
              }
              className={workspaceInput}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#54213a]">
            To date

            <input
              type="date"
              name="to"
              required
              defaultValue={
                report?.to ??
                (validDate(rawTo) ? rawTo : today)
              }
              className={workspaceInput}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#54213a]">
            Location

            <select
              name="location"
              className={workspaceInput}
              defaultValue={report?.locationId ?? ''}
            >
              {staff.role === 'owner' && (
                <option value="">
                  All locations
                </option>
              )}

              {report?.locations.map(location => (
                <option
                  key={location.id}
                  value={location.id}
                >
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className={workspacePrimary + ' w-full'}
            >
              Apply filters
            </button>
          </div>
        </form>
      </WorkspacePanel>

      {errorMessage && (
        <WorkspaceNotice
          title="Reports unavailable"
          tone="error"
          action={
            <Link
              href="/workspace/reports"
              className={workspaceSecondary}
            >
              Retry default period
            </Link>
          }
        >
          {errorMessage}
        </WorkspaceNotice>
      )}

      {report && (
        <>
          <WorkspaceNotice title="Financial data integrity">
            These reports include recorded transactions,
            including any QA records. They do not
            establish the business&apos;s complete
            historical revenue until Odoo data and
            other applicable sales channels are imported.
            Purchase commitments are not supplier
            payments. Issued invoice totals are not
            automatically additional revenue.
          </WorkspaceNotice>

          {report.sales.qaCodedTransactions > 0 && (
            <WorkspaceNotice
              title="QA transactions are present"
              tone="pending"
            >
              {report.sales.qaCodedTransactions}{' '}
              completed POS transaction(s) in this
              period contain QA-labelled products.
              Their amounts are included in the
              recorded POS total, so do not treat
              that total as verified commercial revenue.
            </WorkspaceNotice>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Recorded POS sales"
              value={formatPrice(report.sales.totalMinor)}
              detail="Completed in-store POS transactions before any separately recorded refunds."
              icon={WalletCards}
            />

            <MetricCard
              title="POS transactions"
              value={
                report.sales.transactions.toLocaleString('en-NG')
              }
              detail="Completed POS receipts in the selected period."
              icon={ShoppingBag}
            />

            <MetricCard
              title="Approved operating expenses"
              value={
                formatPrice(report.expenses.approvedMinor)
              }
              detail="Approved and manually recorded-paid expenses. Pending expenses excluded."
              icon={ReceiptText}
            />

            <MetricCard
              title="Approved purchase commitments"
              value={
                formatPrice(
                  report.purchasing.commitmentsMinor,
                )
              }
              detail="Approved purchase orders, including partially or fully received orders. Not supplier payments."
              icon={ClipboardList}
            />

            <MetricCard
              title="Outstanding invoice balances"
              value={
                formatPrice(
                  report.invoices.outstandingMinor,
                )
              }
              detail="Current unpaid balances on invoices issued within the selected period."
              icon={FileText}
            />

            <MetricCard
              title="Issued invoices"
              value={
                report.invoices.issuedCount.toLocaleString(
                  'en-NG',
                )
              }
              detail="Official issued invoice records. Not counted again as POS revenue."
              icon={FileText}
            />

            <MetricCard
              title="Goods received"
              value={
                report.purchasing.receivedUnits.toLocaleString(
                  'en-NG',
                )
              }
              detail={`${report.purchasing.receipts} recorded purchase delivery event(s), counted in individual inventory units.`}
              icon={PackageCheck}
            />

            <MetricCard
              title="Gross / net profit"
              value="Unavailable"
              detail="Historical cost of goods sold, refunds and full financial reconciliation are not yet complete."
              icon={BarChart3}
            />
          </div>

          {staff.role === 'owner' && (
            report.paymentBreakdown &&
            [
              report.paymentBreakdown.cashMinor,
              report.paymentBreakdown.transferMinor,
              report.paymentBreakdown.cardMinor,
              report.paymentBreakdown.cashTenderedMinor,
              report.paymentBreakdown.cashChangeMinor,
              report.paymentBreakdown.splitTransactions,
              report.paymentBreakdown.totalMinor,
            ].every(
              value =>
                Number.isSafeInteger(value) &&
                value >= 0,
            ) &&
            report.paymentBreakdown.cashMinor +
              report.paymentBreakdown.transferMinor +
              report.paymentBreakdown.cardMinor ===
              report.sales.totalMinor &&
            report.paymentBreakdown.totalMinor ===
              report.sales.totalMinor &&
            report.paymentBreakdown.cashTenderedMinor -
              report.paymentBreakdown.cashChangeMinor ===
              report.paymentBreakdown.cashMinor
              ? (
                <WorkspacePanel className="grid gap-4">
                  <SectionHeading>
                    Payment method breakdown
                  </SectionHeading>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      title="Net cash from sales"
                      value={
                        formatPrice(
                          report.paymentBreakdown.cashMinor,
                        )
                      }
                      detail="Cash received less change given."
                      icon={WalletCards}
                    />

                    <MetricCard
                      title="Bank transfers"
                      value={
                        formatPrice(
                          report.paymentBreakdown.transferMinor,
                        )
                      }
                      detail="Manually confirmed recorded transfers; not bank settlement evidence."
                      icon={ReceiptText}
                    />

                    <MetricCard
                      title="Physical card / POS terminal"
                      value={
                        formatPrice(
                          report.paymentBreakdown.cardMinor,
                        )
                      }
                      detail="Manually confirmed terminal payments; not settlement evidence."
                      icon={ReceiptText}
                    />

                    <MetricCard
                      title="Split transactions"
                      value={
                        report.paymentBreakdown.splitTransactions.toLocaleString(
                          'en-NG',
                        )
                      }
                      detail="Already included in the payment methods; do not add again."
                      icon={ShoppingBag}
                    />
                  </div>

                  <p className="text-sm">
                    Cash tendered:{' '}
                    {formatPrice(
                      report.paymentBreakdown.cashTenderedMinor,
                    )}

                    {' · '}

                    Change given:{' '}
                    {formatPrice(
                      report.paymentBreakdown.cashChangeMinor,
                    )}

                    {' · '}

                    Net cash sales:{' '}
                    {formatPrice(
                      report.paymentBreakdown.cashMinor,
                    )}
                  </p>

                  <p className="text-xs">
                    This is a transaction ledger, not a physical till
                    count or bank settlement reconciliation.
                    Refunds are not deducted.
                  </p>
                </WorkspacePanel>
              ) : (
                <WorkspaceNotice
                  title="Payment breakdown unavailable"
                  tone="pending"
                >
                  The payment reporting migration must be installed
                  and the allocation totals must reconcile with recorded sales.
                </WorkspaceNotice>
              )
          )}

          <WorkspacePanel className="grid gap-5">
            <div>
              <SectionHeading>
                Recorded POS sales trend
              </SectionHeading>

              <p className="mt-1 text-sm text-[#806d78]">
                Daily intervals for shorter periods;
                monthly intervals for longer periods.
                Only completed POS transactions are included.
              </p>
            </div>

            <div className="grid gap-2">
              {report.trend.map(point => {
                const percentage =
                  largestSale > 0
                    ? Math.min(
                        100,
                        (point.totalMinor / largestSale) * 100,
                      )
                    : 0;

                return (
                  <div
                    key={point.period}
                    className="grid grid-cols-[90px_minmax(0,1fr)_105px] items-center gap-3"
                  >
                    <span className="text-xs tabular-nums text-[#795f6e]">
                      {point.period}
                    </span>

                    <div
                      className="h-5 overflow-hidden rounded-md bg-[#f3e9e1]"
                      role="img"
                      aria-label={`${point.period}: ${formatPrice(point.totalMinor)}, ${point.transactions} transactions`}
                    >
                      <div
                        className="h-full rounded-md bg-[#864c68]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <span className="text-right text-xs font-semibold tabular-nums text-[#552b41]">
                      {formatPrice(point.totalMinor)}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[#897680]">
              Display values are based on stored POS records;
              no illustrative chart points have been generated.
            </p>
          </WorkspacePanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkspacePanel className="grid content-start gap-4">
              <SectionHeading>
                Purchasing and deliveries
              </SectionHeading>

              <dl className="grid gap-3">
                {[
                  [
                    'Draft purchase orders',
                    report.purchasing.draftOrders,
                  ],
                  [
                    'Approved / receiving orders',
                    report.purchasing.approvedOrders,
                  ],
                  [
                    'Delivery receipt events',
                    report.purchasing.receipts,
                  ],
                  [
                    'Individual units received',
                    report.purchasing.receivedUnits,
                  ],
                ].map(([name, value]) => (
                  <div
                    key={String(name)}
                    className="flex justify-between gap-3 border-b border-[#efe4df] pb-3 text-sm"
                  >
                    <dt className="text-[#786370]">
                      {name}
                    </dt>

                    <dd className="font-semibold tabular-nums text-[#54213a]">
                      {Number(value).toLocaleString('en-NG')}
                    </dd>
                  </div>
                ))}
              </dl>

              <Link
                href="/workspace/purchases"
                className={workspaceSecondary}
              >
                Open purchase orders
              </Link>
            </WorkspacePanel>

            <WorkspacePanel className="grid content-start gap-4">
              <SectionHeading>
                Operating expenses
              </SectionHeading>

              <dl className="grid gap-3">
                {[
                  [
                    'Approved commitments',
                    report.expenses.approvedMinor,
                  ],
                  [
                    'Payments manually recorded',
                    report.expenses.paidRecordedMinor,
                  ],
                  [
                    'Pending expense requests',
                    report.expenses.pendingMinor,
                  ],
                ].map(([name, value]) => (
                  <div
                    key={String(name)}
                    className="flex justify-between gap-3 border-b border-[#efe4df] pb-3 text-sm"
                  >
                    <dt className="text-[#786370]">
                      {name}
                    </dt>

                    <dd className="font-semibold tabular-nums text-[#54213a]">
                      {formatPrice(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>

              <Link
                href="/workspace/expenses"
                className={workspaceSecondary}
              >
                Open expense ledger
              </Link>
            </WorkspacePanel>
          </div>

          <WorkspacePanel className="grid gap-4">
            <SectionHeading>
              Sales by location
            </SectionHeading>

            {report.storeSales.length === 0 ? (
              <p className="text-sm text-[#806d78]">
                No completed POS transactions were recorded
                in the selected locations and period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#eaded8] text-[#7d6874]">
                      <th className="py-3 font-semibold">
                        Location
                      </th>

                      <th className="py-3 text-right font-semibold">
                        Sales
                      </th>

                      <th className="py-3 text-right font-semibold">
                        Transactions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {report.storeSales.map(store => (
                      <tr
                        key={store.name}
                        className="border-b border-[#f0e6e1]"
                      >
                        <td className="py-3 text-[#54213a]">
                          {store.name}
                        </td>

                        <td className="py-3 text-right tabular-nums text-[#54213a]">
                          {formatPrice(store.totalMinor)}
                        </td>

                        <td className="py-3 text-right tabular-nums text-[#54213a]">
                          {store.transactions.toLocaleString(
                            'en-NG',
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspacePanel>

          <WorkspaceNotice
            title="Next financial-reporting integration"
            tone="pending"
          >
            To calculate reliable gross and net profit,
            the system must capture the immutable
            acquisition cost of each item when it is
            sold, reconcile refunds and other payment
            channels, and import relevant historical
            Odoo transactions. Current catalogue costs
            cannot safely replace historical sale costs.
          </WorkspaceNotice>
        </>
      )}
    </div>
  );
}