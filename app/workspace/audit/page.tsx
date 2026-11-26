import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import {
  Activity,
  ShieldCheck,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';

import {
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

export const metadata: Metadata = {
  title: 'Audit Log | Golden Rose Perfume',
};

/* =========================================================
   GOLDEN ROSE — AUDIT LOG CONTRACTS
   ========================================================= */

type AuditEvent = {
  id: string;
  module: string;
  action: string;
  actorId: string | null;
  subject: string | null;
  occurredAt: string;
};

type StaffActor = {
  id: string;
  name: string;
  role: string;
};

type AuditResponse = {
  events: AuditEvent[];
  actors: StaffActor[];
  total: number;
  limit: number;
  offset: number;
  from: string;
  to: string;
};

type Params = {
  module?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<Params>;
};

/* =========================================================
   SUPPORTED AUDIT MODULES
   ========================================================= */

const modules = [
  {
    value: '',
    label: 'All modules',
  },
  {
    value: 'owner',
    label: 'Owner access',
  },
  {
    value: 'staff',
    label: 'Staff management',
  },
  {
    value: 'purchasing',
    label: 'Purchasing & expenses',
  },
  {
    value: 'billing',
    label: 'Billing & invoices',
  },
  {
    value: 'customers',
    label: 'Customers',
  },
  {
    value: 'imports',
    label: 'Catalogue imports',
  },
  {
    value: 'historical_sales',
    label: 'Historical sales imports',
  },
] as const;

const UUID =
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

/* =========================================================
   INPUT VALIDATION AND FORMATTING
   ========================================================= */

function validDate(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

  return (
    !Number.isNaN(
      date.getTime(),
    ) &&
    date.toISOString().slice(0, 10) ===
      value
  );
}

function labelFor(
  moduleName: string,
): string {
  return (
    modules.find(
      item => item.value === moduleName,
    )?.label ??
    moduleName
  );
}

function actionFor(
  action: string,
): string {
  return action
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ');
}

function formatTime(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(
    'en-NG',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    },
  ).format(date);
}

/* =========================================================
   PAGINATION URL BUILDER
   ========================================================= */

function buildHref(filters: {
  from: string;
  to: string;
  module: string;
  actor: string;
  page: number;
}): string {
  const params =
    new URLSearchParams({
      from: filters.from,
      to: filters.to,
      page: String(filters.page),
    });

  if (filters.module) {
    params.set(
      'module',
      filters.module,
    );
  }

  if (filters.actor) {
    params.set(
      'actor',
      filters.actor,
    );
  }

  return `/workspace/audit?${params.toString()}`;
}

/* =========================================================
   AUDIT PAGE ENTRY POINT
   ========================================================= */

export default function AuditPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-6 text-sm text-gr-muted"
        >
          Loading the audit log…
        </p>
      }
    >
      <AuditContent
        searchParams={searchParams}
      />
    </Suspense>
  );
}

/* =========================================================
   AUTHORIZED AUDIT CONTENT
   ========================================================= */

async function AuditContent({
  searchParams,
}: Props) {
  const staff =
    await requireStaff();

  if (
    !canViewModule(
      staff.role,
      'audit',
    )
  ) {
    notFound();
  }

  const params =
    await searchParams;

  /*
   * Do not declare a local variable named "module".
   * Next.js reserves that identifier for module internals.
   *
   * Keep the external URL and RPC contracts unchanged.
   */

  const selectedModule =
    params.module ?? '';

  const actor =
    params.actor ?? '';

  const from =
    params.from ?? '';

  const to =
    params.to ?? '';

  const pageText =
    params.page ?? '1';

  /* Validate filters before querying the database. */

  const validModule =
    modules.some(
      item =>
        item.value === selectedModule,
    );

  const validPage =
    /^[1-9]\d{0,2}$/.test(pageText);

  const page =
    validPage
      ? Number(pageText)
      : 1;

  const invalid =
    !validModule ||

    (
      actor !== '' &&
      !UUID.test(actor)
    ) ||

    (
      from !== '' &&
      !validDate(from)
    ) ||

    (
      to !== '' &&
      !validDate(to)
    ) ||

    (
      from !== '' &&
      to !== '' &&
      from > to
    ) ||

    !validPage ||

    page > 101;

  let report:
    | AuditResponse
    | null = null;

  let errorMessage = '';

  /* =======================================================
     AUTHENTICATED AUDIT HISTORY QUERY
     ======================================================= */

  if (invalid) {
    errorMessage =
      'The audit log filters are invalid. Reset them and retry.';

  } else {
    try {
      const client =
        await createClient();

      const {
        data,
        error,
      } = await client.rpc(
        'gr_audit_history',
        {
          p_limit:
            50,

          p_offset:
            (page - 1) * 50,

          p_module:
            selectedModule || null,

          p_from:
            from || null,

          p_to:
            to || null,

          p_actor:
            actor || null,
        },
      );

      if (error) {
        console.error(
          '[Golden Rose audit history]',
          {
            code: error.code,
          },
        );

        errorMessage =
          error.code === '42501'
            ? 'The owner session could not be verified.'
            : 'Audit records could not be loaded. Confirm the database migration and retry.';

      } else if (
        data &&
        typeof data.total === 'number' &&

        Number.isSafeInteger(
          data.total,
        ) &&

        data.total >= 0 &&

        Array.isArray(
          data.events,
        ) &&

        Array.isArray(
          data.actors,
        ) &&

        typeof data.from === 'string' &&
        typeof data.to === 'string'
      ) {
        report =
          data as AuditResponse;

      } else {
        errorMessage =
          'The audit service returned an invalid response.';
      }

    } catch {
      errorMessage =
        'The audit service is temporarily unavailable.';
    }
  }

  /*
   * All JSX is constructed outside the data-fetching
   * try/catch block.
   */

  const actorNames =
    new Map(
      (report?.actors ?? []).map(
        item => [
          item.id,
          item.name,
        ],
      ),
    );

  const activeFrom =
    report?.from ?? from;

  const activeTo =
    report?.to ?? to;

  const totalPages =
    report
      ? Math.max(
          1,
          Math.ceil(
            report.total / 50,
          ),
        )
      : 1;

  /* =======================================================
     AUDIT WORKSPACE INTERFACE
     ======================================================= */

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Administration / Accountability"
        title="Audit Log"
        description="Review recorded activity across purchasing, staff administration, imports, billing, customers and owner access. Events are read-only."
        actions={
          <Link
            href="/workspace/audit"
            className={workspaceSecondary}
          >
            Reset filters
          </Link>
        }
      />

      <WorkspaceNotice title="Historical coverage">
        This page consolidates the module-specific
        events already recorded by Golden Rose.
        It is not a guarantee that every older
        action was logged. Source records are not
        changed by viewing them.
      </WorkspaceNotice>

      {/* =================================================
          AUDIT FILTERS
          ================================================= */}

      <WorkspacePanel className="grid gap-4">
        <h2 className="flex items-center gap-2 font-serif text-xl text-gr-text">
          <ShieldCheck
            size={20}
            aria-hidden="true"
          />

          Filter activity
        </h2>

        <form
          method="get"
          action="/workspace/audit"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
        >
          <label className="grid gap-1.5 text-sm font-semibold text-gr-text">
            Module

            <select
              name="module"
              className={workspaceInput}
              defaultValue={selectedModule}
            >
              {modules.map(item => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-gr-text">
            Staff member

            <select
              name="actor"
              className={workspaceInput}
              defaultValue={actor}
            >
              <option value="">
                All staff
              </option>

              {report?.actors.map(item => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                  {' '}
                  ({item.role})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-gr-text">
            From

            <input
              name="from"
              type="date"
              className={workspaceInput}
              defaultValue={activeFrom}
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-gr-text">
            To

            <input
              name="to"
              type="date"
              className={workspaceInput}
              defaultValue={activeTo}
              required
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className={
                workspacePrimary +
                ' w-full'
              }
            >
              Apply filters
            </button>
          </div>
        </form>
      </WorkspacePanel>

      {/* =================================================
          ERROR STATE
          ================================================= */}

      {errorMessage && (
        <WorkspaceNotice
          title="Audit history unavailable"
          tone="error"
        >
          {errorMessage}
        </WorkspaceNotice>
      )}

      {/* =================================================
          RECORDED AUDIT EVENTS
          ================================================= */}

      {report && (
        <WorkspacePanel className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-gr-text">
              <Activity
                size={20}
                aria-hidden="true"
              />

              Activity history
            </h2>

            <span className="text-sm text-gr-muted">
              {report.total.toLocaleString(
                'en-NG',
              )}
              {' '}events
            </span>
          </div>

          {report.events.length === 0 && (
            <p className="rounded-xl bg-gr-surface-alt p-4 text-sm text-gr-muted">
              No recorded events match the
              selected filters.
            </p>
          )}

          <div className="grid gap-2">
            {report.events.map(event => (
              <article
                key={event.id}
                className="grid gap-2 rounded-xl border border-gr-border bg-gr-surface p-4 sm:grid-cols-[170px_minmax(0,1fr)]"
              >
                <p className="text-xs tabular-nums text-gr-muted">
                  {formatTime(
                    event.occurredAt,
                  )}
                </p>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm capitalize text-gr-text">
                      {actionFor(
                        event.action,
                      )}
                    </strong>

                    <span className="rounded-md bg-gr-surface-alt px-2 py-1 text-xs font-medium text-gr-gold">
                      {labelFor(
                        event.module,
                      )}
                    </span>
                  </div>

                  <p className="mt-1 break-words text-sm text-gr-muted">
                    Actor:{' '}

                    {event.actorId
                      ? (
                          actorNames.get(
                            event.actorId,
                          ) ??
                          event.actorId
                        )
                      : 'System / unknown'}
                  </p>

                  {event.subject && (
                    <p className="mt-1 break-all text-xs text-gr-muted">
                      Record:{' '}

                      {event.subject}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* =============================================
              AUDIT HISTORY PAGINATION
              ============================================= */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gr-border pt-4">
            <span className="text-sm text-gr-muted">
              Page {page} of {totalPages}
            </span>

            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  className={workspaceSecondary}
                  href={buildHref({
                    from:
                      activeFrom,

                    to:
                      activeTo,

                    module:
                      selectedModule,

                    actor,

                    page:
                      page - 1,
                  })}
                >
                  Previous
                </Link>
              )}

              {page < totalPages &&
                page < 101 && (
                  <Link
                    className={workspaceSecondary}
                    href={buildHref({
                      from:
                        activeFrom,

                      to:
                        activeTo,

                      module:
                        selectedModule,

                      actor,

                      page:
                        page + 1,
                    })}
                  >
                    Next
                  </Link>
                )}
            </div>
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}