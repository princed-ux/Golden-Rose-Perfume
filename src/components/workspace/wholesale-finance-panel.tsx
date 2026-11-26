'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  usePathname,
} from 'next/navigation';

import {
  ArrowRight,
  Banknote,
  Building2,
  CircleAlert,
  ClipboardList,
  CreditCard,
  PackageCheck,
  RefreshCw,
  Truck,
  Wallet,
} from 'lucide-react';

import {
  loadWholesaleFinance,
  type WholesaleFinanceReport,
  type WholesaleFinanceResult,
  type WholesaleReportDays,
} from '@/app/workspace/wholesale/finance-actions';

import {
  WorkspaceNotice,
  WorkspacePanel,
  workspaceSecondary,
} from './page-layout';

/* =========================================================
   GOLDEN ROSE PERFUME
   WHOLESALE FINANCIAL OVERVIEW
   ========================================================= */

const periods: readonly {
  days: WholesaleReportDays;
  label: string;
}[] = [
  {
    days: 1,
    label: 'Today',
  },
  {
    days: 7,
    label: '7 days',
  },
  {
    days: 30,
    label: '30 days',
  },
  {
    days: 90,
    label: '90 days',
  },
];

const currency =
  new Intl.NumberFormat(
    'en-NG',

    {
      style: 'currency',

      currency: 'NGN',

      minimumFractionDigits: 2,

      maximumFractionDigits: 2,
    },
  );

function money(
  value: number,
): string {
  return currency.format(
    value / 100,
  );
}

function count(
  value: number,
): string {
  return value.toLocaleString('en-NG');
}

function formatTimestamp(
  value: string,
): string {
  return new Intl.DateTimeFormat(
    'en-NG',

    {
      timeZone: 'Africa/Lagos',

      dateStyle: 'medium',

      timeStyle: 'short',
    },
  ).format(new Date(value));
}

/* =========================================================
   DASHBOARD METRIC CARD
   ========================================================= */

function FinancialMetric({
  title,
  value,
  description,
  icon: Icon,
  attention = false,
}: {
  title: string;

  value: string;

  description: string;

  icon: typeof Wallet;

  attention?: boolean;
}) {
  return (
    <article className="grid min-w-0 content-start gap-3 rounded-xl border border-gr-border bg-gr-surface p-4">
      <div
        className={
          'grid size-10 place-items-center rounded-xl ' +

          (
            attention

              ? 'bg-gr-surface-alt text-gr-gold'

              : 'bg-gr-surface-alt text-gr-gold'
          )
        }
      >
        <Icon
          size={21}
          strokeWidth={1.7}
          aria-hidden="true"
        />
      </div>

      <div className="grid min-w-0 gap-2">
        <p className="text-xs font-semibold text-gr-muted">
          {title}
        </p>

        <strong className="break-words font-serif text-[clamp(1.25rem,2vw,1.9rem)] font-normal leading-tight tabular-nums text-gr-text">
          {value}
        </strong>

        <p className="text-xs leading-5 text-gr-muted">
          {description}
        </p>
      </div>
    </article>
  );
}

/* =========================================================
   PAYMENT METHOD BREAKDOWN
   ========================================================= */

function PaymentBreakdown({
  report,
}: {
  report: WholesaleFinanceReport;
}) {
  const methods = [
    {
      name: 'Cash',

      amount:
        report.payments.cashMinor,

      icon: Banknote,

      color: '#a77b41',
    },

    {
      name: 'Bank transfer',

      amount:
        report.payments.transferMinor,

      icon: Building2,

      color: '#87576f',
    },

    {
      name: 'Card / POS terminal',

      amount:
        report.payments.cardMinor,

      icon: CreditCard,

      color: '#778977',
    },
  ];

  return (
    <section className="grid min-w-0 gap-4 rounded-xl border border-gr-border bg-gr-surface p-4 sm:p-5">
      <div>
        <h3 className="font-serif text-xl text-gr-text">
          Wholesale payments received
        </h3>

        <p className="mt-1 text-xs leading-5 text-gr-muted">
          Confirmed payment records within
          the selected reporting period.
        </p>
      </div>

      <strong className="break-words font-serif text-2xl tabular-nums text-gr-text">
        {money(
          report.payments.totalMinor,
        )}
      </strong>

      {report.payments.totalMinor > 0 ? (
        <div
          className="flex h-3 overflow-hidden rounded-full bg-gr-surface-alt"
          aria-hidden="true"
        >
          {methods.map(method => (
            <div
              key={method.name}

              style={{
                width:
                  (
                    method.amount /
                    report.payments.totalMinor *
                    100
                  ) + '%',

                backgroundColor:
                  method.color,
              }}
            />
          ))}
        </div>

      ) : (
        <p className="rounded-lg bg-gr-surface p-3 text-xs text-gr-muted">
          No wholesale payments recorded during
          the selected period.
        </p>
      )}

      <div className="grid gap-3">
        {methods.map(method => {
          const Icon = method.icon;

          const percentage =
            report.payments.totalMinor > 0

              ? method.amount /
                report.payments.totalMinor *
                100

              : 0;

          return (
            <div
              key={method.name}

              className="flex min-w-0 items-center justify-between gap-3 border-b border-gr-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gr-surface-alt text-gr-gold">
                  <Icon
                    size={18}
                    aria-hidden="true"
                  />
                </span>

                <div className="min-w-0">
                  <strong className="text-sm text-gr-text">
                    {method.name}
                  </strong>

                  <p className="text-xs text-gr-muted">
                    {percentage.toFixed(1)}
                    %
                  </p>
                </div>
              </div>

              <strong className="break-all text-right text-sm tabular-nums text-gr-text">
                {money(method.amount)}
              </strong>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-gr-muted">
        These are recorded receipts of payment,
        not independent confirmation of bank settlement.
      </p>
    </section>
  );
}

/* =========================================================
   OUTSTANDING WHOLESALE BALANCES

   This is a current all-time position.
   It does not change with the activity period filter.
   ========================================================= */

function OutstandingSummary({
  report,
}: {
  report: WholesaleFinanceReport;
}) {
  const data =
    report.outstanding;

  const allOrders =
    data.unpaidCount +
    data.partiallyPaidCount +
    data.paidCount;

  const rows = [
    {
      label: 'Unpaid orders',

      value: data.unpaidCount,

      style: 'bg-gr-strong',
    },

    {
      label: 'Partially paid orders',

      value: data.partiallyPaidCount,

      style: 'bg-gr-button',
    },

    {
      label: 'Fully paid orders',

      value: data.paidCount,

      style: 'bg-gr-strong',
    },
  ];

  return (
    <section className="grid min-w-0 gap-4 rounded-xl border border-gr-border bg-gr-surface p-4 sm:p-5">
      <div>
        <h3 className="font-serif text-xl text-gr-text">
          Customer balances
        </h3>

        <p className="mt-1 text-xs leading-5 text-gr-muted">
          Current outstanding wholesale balances
          across all recorded orders.
        </p>
      </div>

      <strong className="break-words font-serif text-2xl tabular-nums text-gr-gold">
        {money(data.totalMinor)}
      </strong>

      {allOrders > 0 && (
        <div
          className="flex h-3 overflow-hidden rounded-full bg-gr-surface-alt"
          aria-hidden="true"
        >
          {rows.map(row => (
            <div
              key={row.label}

              className={row.style}

              style={{
                width:
                  (
                    row.value /
                    allOrders *
                    100
                  ) + '%',
              }}
            />
          ))}
        </div>
      )}

      <dl className="grid gap-3 text-sm">
        {rows.map(row => (
          <div
            key={row.label}

            className="flex justify-between gap-3 border-b border-gr-border pb-3"
          >
            <dt className="flex items-center gap-2 text-gr-muted">
              <span
                className={
                  'size-2.5 shrink-0 rounded-full ' +
                  row.style
                }

                aria-hidden="true"
              />

              {row.label}
            </dt>

            <dd className="font-semibold tabular-nums text-gr-text">
              {count(row.value)}
            </dd>
          </div>
        ))}

        <div className="flex justify-between gap-3">
          <dt className="text-gr-muted">
            Outstanding on dispatched goods
          </dt>

          <dd className="break-all text-right font-semibold tabular-nums text-gr-text">
            {money(
              data.dispatchedOutstandingMinor,
            )}
          </dd>
        </div>
      </dl>

      <Link
        href="/workspace/wholesale"

        className={workspaceSecondary}
      >
        Review customer balances

        <ArrowRight
          size={16}
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}

/* =========================================================
   SELLING LOCATION PERFORMANCE
   ========================================================= */

function LocationReport({
  report,
}: {
  report: WholesaleFinanceReport;
}) {
  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <h3 className="font-serif text-xl text-gr-text">
          Wholesale performance by location
        </h3>

        <p className="mt-1 text-xs leading-5 text-gr-muted">
          Activity follows the selected reporting
          period. Outstanding balances are current
          across all recorded transactions.
        </p>
      </div>

      {report.locations.length === 0 ? (
        <WorkspaceNotice
          title="No reporting locations"
        >
          No selling locations were returned
          by the wholesale reporting service.
        </WorkspaceNotice>

      ) : (
        <div className="overflow-x-auto rounded-xl border border-gr-border">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-gr-surface-alt text-gr-text">
              <tr>
                <th className="p-3">
                  Location
                </th>

                <th className="p-3 text-right">
                  Orders
                </th>

                <th className="p-3 text-right">
                  Order value
                </th>

                <th className="p-3 text-right">
                  Dispatched value
                </th>

                <th className="p-3 text-right">
                  Payments received
                </th>

                <th className="p-3 text-right">
                  Outstanding
                </th>
              </tr>
            </thead>

            <tbody>
              {report.locations.map(location => (
                <tr
                  key={location.id}

                  className="border-t border-gr-border bg-gr-surface"
                >
                  <td className="p-3">
                    <strong className="text-gr-text">
                      {location.name}
                    </strong>

                    <p className="text-xs text-gr-muted">
                      {location.active
                        ? 'Active location'
                        : 'Inactive location'}
                    </p>
                  </td>

                  <td className="p-3 text-right tabular-nums">
                    {count(
                      location.orderCount,
                    )}
                  </td>

                  <td className="p-3 text-right tabular-nums">
                    {money(
                      location.orderMinor,
                    )}
                  </td>

                  <td className="p-3 text-right tabular-nums">
                    {money(
                      location.dispatchMinor,
                    )}
                  </td>

                  <td className="p-3 text-right tabular-nums">
                    {money(
                      location.receivedMinor,
                    )}
                  </td>

                  <td className="p-3 text-right font-semibold tabular-nums text-gr-gold">
                    {money(
                      location.outstandingMinor,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot className="border-t border-gr-border bg-gr-surface font-semibold text-gr-text">
              <tr>
                <th className="p-3">
                  Business total
                </th>

                <td className="p-3 text-right tabular-nums">
                  {count(report.orders.count)}
                </td>

                <td className="p-3 text-right tabular-nums">
                  {money(
                    report.orders.totalMinor,
                  )}
                </td>

                <td className="p-3 text-right tabular-nums">
                  {money(
                    report.dispatches.valueMinor,
                  )}
                </td>

                <td className="p-3 text-right tabular-nums">
                  {money(
                    report.payments.totalMinor,
                  )}
                </td>

                <td className="p-3 text-right tabular-nums">
                  {money(
                    report.outstanding.totalMinor,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   VERIFIED REPORT PRESENTATION
   ========================================================= */

function ReportContent({
  report,
}: {
  report: WholesaleFinanceReport;
}) {
  /*
   * A discrepancy between the payment event ledger
   * and stored balances requires investigation.
   *
   * Do not present unreconciled financial figures
   * as verified business performance.
   */

  if (
    report.outstanding.paymentMismatchCount > 0
  ) {
    return (
      <WorkspaceNotice
        tone="error"

        title="Wholesale payment reconciliation required"
      >
        {count(
          report.outstanding.paymentMismatchCount,
        )}
        {' '}wholesale order(s) contain a difference
        between their stored payment balance and
        payment-event history.

        Financial figures are withheld until the
        discrepancy has been investigated.
      </WorkspaceNotice>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-xs leading-5 text-gr-muted">
        Reporting period: {report.from} to {report.to}
        {' · '}
        Africa/Lagos
        {' · '}
        Report generated at{' '}
        {formatTimestamp(report.asOf)}.
      </p>

      {/* Primary wholesale metrics */}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialMetric
          title="Wholesale order value"

          value={money(
            report.orders.totalMinor,
          )}

          description={
            `${count(report.orders.count)} orders recorded during the selected period.`
          }

          icon={ClipboardList}
        />

        <FinancialMetric
          title="Dispatched goods value"

          value={money(
            report.dispatches.valueMinor,
          )}

          description={
            `${count(report.dispatches.count)} completed dispatches · ${count(report.dispatches.bottles)} individual bottles.`
          }

          icon={PackageCheck}
        />

        <FinancialMetric
          title="Payments received"

          value={money(
            report.payments.totalMinor,
          )}

          description={
            `${count(report.payments.count)} recorded payment events during this period.`
          }

          icon={Wallet}
        />

        <FinancialMetric
          title="Current outstanding balance"

          value={money(
            report.outstanding.totalMinor,
          )}

          description="All-time unpaid wholesale balances, regardless of the reporting period."

          icon={CircleAlert}

          attention={
            report.outstanding.totalMinor > 0
          }
        />
      </div>

      {/* Operational dispatch overview */}

      <section className="grid gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gr-surface text-gr-gold">
            <Truck
              size={22}
              aria-hidden="true"
            />
          </span>

          <div>
            <h3 className="font-semibold text-gr-text">
              {count(
                report.outstanding.pendingDispatchCount,
              )}
              {' '}orders awaiting dispatch
            </h3>

            <p className="mt-1 text-xs leading-5 text-gr-muted">
              All outstanding dispatches, including
              orders from earlier reporting periods.
            </p>
          </div>
        </div>

        <Link
          href="/workspace/dispatch"

          className={workspaceSecondary}
        >
          Review dispatches

          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <PaymentBreakdown
          report={report}
        />

        <OutstandingSummary
          report={report}
        />
      </div>

      <LocationReport
        report={report}
      />

      {/* Accounting limitations */}

      <WorkspaceNotice
        title="Wholesale reporting scope"
      >
        <div className="grid gap-2">
          <p>
            Wholesale orders, dispatched goods and
            payments received are separate measures.
            Do not add them together to calculate
            business revenue.
          </p>

          <p>
            Wholesale profit, refunds, returns and
            invoice reconciliation are not connected
            to this report.
          </p>

          <p>
            Test transactions may be included in
            these totals. Use isolated testing data
            before relying on the report commercially.
          </p>
        </div>
      </WorkspaceNotice>
    </div>
  );
}

/* =========================================================
   ASYNCHRONOUS REPORT STATE
   ========================================================= */

interface LoadedReport {
  days: WholesaleReportDays;
  revision: number;
  result: WholesaleFinanceResult;
}

function WholesaleFinancePanel() {
  const [days, setDays] =
    useState<WholesaleReportDays>(30);

  const [revision, setRevision] =
    useState(0);

  const [loaded, setLoaded] =
    useState<LoadedReport | null>(null);

  /*
   * A changed filter or refresh creates a new request.
   * Earlier responses must not overwrite newer reports.
   */

  useEffect(() => {
    let cancelled = false;

    void loadWholesaleFinance(days)
      .then(result => {
        if (cancelled) {
          return;
        }

        setLoaded({
          days,

          revision,

          result,
        });
      })

      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoaded({
          days,

          revision,

          result: {
            ok: false,

            message:
              'Wholesale financial reporting could not be loaded. Please retry.',
          },
        });
      });

    return () => {
      cancelled = true;
    };

  }, [
    days,
    revision,
  ]);

  const current =
    loaded?.days === days &&
    loaded.revision === revision

      ? loaded.result

      : null;

  const loading =
    current === null;

  function refresh() {
    setRevision(
      value => value + 1,
    );
  }

  /* =======================================================
     FINANCIAL REPORT PANEL
     ======================================================= */

  return (
    <WorkspacePanel className="mt-6 grid min-w-0 gap-5">
      <section
        id="wholesale-financial-overview"

        aria-labelledby="gr-wholesale-finance-title"

        aria-busy={loading}

        className="grid min-w-0 gap-5"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gr-border pb-4">
          <div className="grid min-w-0 gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gr-gold">
              Executive finance / wholesale
            </p>

            <h2
              id="gr-wholesale-finance-title"

              className="font-serif text-[clamp(1.5rem,3vw,2.1rem)] font-normal text-gr-text"
            >
              Wholesale &amp; Distribution
            </h2>

            <p className="max-w-3xl text-sm leading-6 text-gr-muted">
              Business customer sales, goods dispatched,
              payment collections and outstanding balances.
            </p>
          </div>

          <Link
            href="/workspace/wholesale"

            className={workspaceSecondary}
          >
            Open wholesale sales

            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </header>

        {/* Reporting period controls */}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"

            aria-label="Wholesale reporting period"

            className="flex flex-wrap gap-2"
          >
            {periods.map(period => {
              const active =
                period.days === days;

              return (
                <button
                  key={period.days}

                  type="button"

                  aria-pressed={active}

                  className={
                    'min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gr-gold ' +

                    (
                      active

                        ? 'border-gr-border bg-gr-strong text-gr-on-strong'

                        : 'border-gr-border bg-gr-surface text-gr-text hover:bg-gr-surface-alt'
                    )
                  }

                  onClick={() =>
                    setDays(period.days)
                  }
                >
                  {period.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"

            className={workspaceSecondary}

            disabled={loading}

            onClick={refresh}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
            />

            Refresh report
          </button>
        </div>

        {/* Request status */}

        {loading ? (
          <WorkspaceNotice
            title="Loading wholesale figures"
          >
            Retrieving the current authorized
            wholesale financial report.
          </WorkspaceNotice>

        ) : !current.ok ? (
          <WorkspaceNotice
            tone="error"

            title="Wholesale report unavailable"

            action={
              <button
                type="button"

                className={workspaceSecondary}

                onClick={refresh}
              >
                Retry
              </button>
            }
          >
            {current.message}
          </WorkspaceNotice>

        ) : (
          <ReportContent
            report={current.data}
          />
        )}
      </section>
    </WorkspacePanel>
  );
}

/* =========================================================
   ROUTE-SCOPED OWNER DASHBOARD INTEGRATION

   The authenticated workspace layout mounts this
   component only for the business owner.

   The server action and database independently
   verify owner authorization on every report request.
   ========================================================= */

export function OwnerWholesaleFinancePanel() {
  const pathname =
    usePathname();

  if (
    pathname !== '/workspace' &&

    pathname !== '/workspace/overview' &&

    pathname !== '/workspace/reports'
  ) {
    return null;
  }

  return (
    <WholesaleFinancePanel
      key={pathname}
    />
  );
}