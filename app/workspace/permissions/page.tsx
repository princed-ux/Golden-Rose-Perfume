import type { Metadata } from 'next';

import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import {
  Building2,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';

import {
  ROLE_MODULES,
} from '@/src/domain/permissions';

import {
  WORKSPACE_MODULES,
} from '@/src/domain/modules';

import {
  requireStaff,
} from '@/src/lib/golden-rose/staff';

import {
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import {
  loadPermissionDirectory,
  saveStaffPermissions,
  type EditableModule,
  type EmployeePermissionRecord,
  type EmployeePermissionOverrides,
} from './actions';

export const metadata: Metadata = {
  title: 'Staff Permissions | Golden Rose Perfume',
  description:
    'Manage individual employee access to Golden Rose business operations.',
};

type Props = {
  searchParams: Promise<{
    search?: string;
    result?: string;
  }>;
};

const permissionOptions = [
  {
    id: 'invoices',
    title: 'Invoices & Quotes',
    description:
      'Prepare invoices, issue quotations and manage authorized customer billing records.',
  },
  {
    id: 'wholesale',
    title: 'Wholesale Sales',
    description:
      'Record bulk fragrance sales, negotiated prices and customer payments.',
  },
  {
    id: 'dispatch',
    title: 'Dispatch Management',
    description:
      'Review pending goods and confirm dispatch with inventory deductions.',
  },
] as const;

const roleLabels = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  inventory_staff: 'Inventory Staff',
  sales_staff: 'Sales Staff',
  accountant: 'Accountant',
  customer: 'Customer',
} as const;

/* =========================================================
   EFFECTIVE EMPLOYEE ACCESS
   ========================================================= */

function roleDefault(
  employee: EmployeePermissionRecord,
  moduleId: EditableModule,
): boolean {
  if (moduleId === 'invoices') {
    return (
      employee.role === 'manager' ||
      employee.role === 'accountant'
    );
  }

  return false;
}

function effectiveAccess(
  employee: EmployeePermissionRecord,
  moduleId: EditableModule,
): boolean {
  if (employee.status !== 'active') {
    return false;
  }

  const decision = employee.overrides[moduleId];

  if (decision === 'allow') return true;
  if (decision === 'deny') return false;

  return roleDefault(employee, moduleId);
}

/* =========================================================
   OWNER-ONLY SAVE HANDLER
   ========================================================= */

async function saveEmployeeAccess(formData: FormData) {
  'use server';

  const staff = await requireStaff();

  if (staff.role !== 'owner') {
    notFound();
  }

  const employeeId = String(
    formData.get('employeeId') ?? '',
  );

  const revision = String(
    formData.get('expectedRevision') ?? '',
  );

  if (!/^[0-9]{1,9}$/.test(revision)) {
    redirect('/workspace/permissions?result=invalid');
  }

  const overrides: EmployeePermissionOverrides = {};

  const reset =
    formData.get('reset') === 'true';

  /*
   * Every checkbox produces an explicit access decision.
   * Restoring defaults clears the individual overrides.
   *
   * The database independently verifies which modules
   * may be modified and who may modify them.
   */

  if (!reset) {
    for (const option of permissionOptions) {
      const values = formData.getAll(option.id);

      if (
        values.length > 1 ||
        (
          values.length === 1 &&
          values[0] !== 'allow'
        )
      ) {
        redirect('/workspace/permissions?result=invalid');
      }

      overrides[option.id] =
        values.length === 1 ? 'allow' : 'deny';
    }
  }

  const result = await saveStaffPermissions({
    employeeId,
    expectedRevision: Number(revision),
    overrides,
  });

  redirect(
    result.ok
      ? '/workspace/permissions?result=saved'
      : '/workspace/permissions?result=failed',
  );
}

/* =========================================================
   ACCESS SWITCH
   ========================================================= */

function AccessSwitch({
  employee,
  option,
  enabled,
}: {
  employee: EmployeePermissionRecord;
  option: typeof permissionOptions[number];
  enabled: boolean;
}) {
  const checked = effectiveAccess(
    employee,
    option.id,
  );

  const disabled =
    !enabled || employee.status !== 'active';

  const custom =
    employee.overrides[option.id] !== undefined;

  return (
    <label
      className={
        'flex min-w-0 items-start justify-between gap-4 ' +
        'rounded-xl border border-gr-border bg-gr-surface p-4 ' +
        (
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-gr-surface-alt'
        )
      }
    >
      <div className="min-w-0 flex-1">
        <strong className="text-sm text-gr-text">
          {option.title}
        </strong>

        <p className="mt-1 text-xs leading-5 text-gr-muted">
          {option.description}
        </p>

        <p className="mt-2 text-[11px] font-medium text-gr-gold">
          {custom
            ? 'Individual permission'
            : 'Role default'}
        </p>
      </div>

      <div className="grid shrink-0 justify-items-end gap-2">
        <input
          type="checkbox"
          role="switch"
          name={option.id}
          value="allow"
          defaultChecked={checked}
          disabled={disabled}
          className="peer sr-only"
          aria-label={`Allow ${option.title}`}
        />

        <span
          aria-hidden="true"
          className="
            relative block h-7 w-12 rounded-full
            bg-gr-surface-alt transition-colors
            after:absolute after:left-1 after:top-1
            after:size-5 after:rounded-full after:bg-gr-surface
            after:shadow-sm after:transition-transform
            peer-checked:bg-gr-strong
            peer-checked:after:translate-x-5
            peer-focus-visible:ring-2
            peer-focus-visible:ring-gr-gold
            peer-focus-visible:ring-offset-2
          "
        />

        <span className="text-xs text-gr-muted peer-checked:hidden">
          Off
        </span>

        <span className="hidden text-xs font-semibold text-gr-text peer-checked:block">
          On
        </span>
      </div>
    </label>
  );
}

/* =========================================================
   MODULES STILL USING ROLE-BASED ACCESS
   ========================================================= */

function CurrentRoleAccess({
  employee,
}: {
  employee: EmployeePermissionRecord;
}) {
  const defaults = new Set<string>(
    ROLE_MODULES[employee.role] ?? [],
  );

  const operational = WORKSPACE_MODULES.filter(
    item =>
      ![
        'invoices',
        'assistant',
        'staff',
        'settings',
        'overview',
      ].includes(item.id),
  );

  return (
    <details className="rounded-xl border border-gr-border bg-gr-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gr-text">
        Other operational modules
      </summary>

      <p className="mt-3 text-xs leading-5 text-gr-muted">
        These modules still use their existing role
        permissions. Their individual access controls
        are not connected yet.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {operational.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gr-border bg-gr-surface p-3 text-xs"
          >
            <span className="font-medium text-gr-text">
              {item.label}
            </span>

            {employee.status === 'active' &&
            defaults.has(item.id) ? (
              <span className="flex items-center gap-1 text-gr-success">
                <CheckCircle2 size={14} />
                Active
              </span>
            ) : (
              <span className="text-gr-muted">
                Not assigned
              </span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

/* =========================================================
   EMPLOYEE ACCESS CARD
   ========================================================= */

function EmployeeCard({
  employee,
  availableModules,
}: {
  employee: EmployeePermissionRecord;
  availableModules: readonly EditableModule[];
}) {
  const active = employee.status === 'active';

  const grantedCount = permissionOptions.filter(
    option => effectiveAccess(employee, option.id),
  ).length;

  const ready = permissionOptions.every(
    option => availableModules.includes(option.id),
  );

  return (
    <WorkspacePanel className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-gr-border bg-gr-surface-alt text-gr-gold">
            <UserRound size={24} />
          </span>

          <div className="min-w-0">
            <h2 className="break-words font-serif text-xl text-gr-text">
              {employee.displayName}
            </h2>

            <p className="break-all text-sm text-gr-muted">
              {employee.email || 'Email unavailable'}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-gr-surface-alt px-2 py-1 text-xs font-semibold text-gr-gold">
                {roleLabels[employee.role]}
              </span>

              <span
                className={
                  'rounded-md px-2 py-1 text-xs font-semibold ' +
                  (
                    active
                      ? 'bg-gr-success-bg text-gr-success'
                      : 'bg-gr-danger-bg text-gr-danger'
                  )
                }
              >
                {active ? 'Active' : 'Suspended'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gr-muted">
          {grantedCount} individually configurable
          modules enabled
        </p>
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-gr-border bg-gr-surface p-3 text-sm text-gr-muted">
        <Building2 size={17} className="shrink-0" />

        {employee.locationName ||
          'No selling location assigned'}
      </div>

      <form
        action={saveEmployeeAccess}
        className="grid min-w-0 gap-4"
        key={`${employee.userId}:${employee.revision}`}
      >
        <input
          type="hidden"
          name="employeeId"
          value={employee.userId}
        />

        <input
          type="hidden"
          name="expectedRevision"
          value={employee.revision}
        />

        <div>
          <h3 className="font-semibold text-gr-text">
            Individual permissions
          </h3>

          <p className="mt-1 text-sm text-gr-muted">
            Turn on the responsibilities this employee
            should have. Their assigned role will remain
            unchanged.
          </p>
        </div>

        <div className="grid gap-3">
          {permissionOptions.map(option => (
            <AccessSwitch
              key={option.id}
              employee={employee}
              option={option}
              enabled={
                availableModules.includes(option.id)
              }
            />
          ))}
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl border border-gr-border bg-gr-surface p-4">
          <div className="flex min-w-0 items-start gap-3">
            <Sparkles
              size={21}
              className="mt-0.5 shrink-0 text-gr-gold"
            />

            <div>
              <h3 className="text-sm font-semibold text-gr-text">
                Amara Assistant
              </h3>

              <p className="mt-1 text-xs leading-5 text-gr-muted">
                Guided operational assistance for
                every active employee.
              </p>
            </div>
          </div>

          <span className="shrink-0 text-xs font-semibold text-gr-text">
            {active ? 'Enabled' : 'Suspended'}
          </span>
        </div>

        <CurrentRoleAccess employee={employee} />

        <div className="flex items-start gap-2 rounded-xl bg-gr-surface p-4 text-xs leading-5 text-gr-gold">
          <LockKeyhole
            size={17}
            className="mt-0.5 shrink-0"
          />

          <p>
            Business Settings and permission
            administration remain owner-controlled.
            Access to a module does not grant ownership,
            bank account configuration or unrestricted
            financial approval authority.
          </p>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gr-border pt-4">
          <button
            type="submit"
            name="reset"
            value="true"
            className={workspaceSecondary}
            disabled={!active || !ready}
          >
            <RotateCcw size={16} />
            Restore role defaults
          </button>

          <button
            type="submit"
            className={workspacePrimary}
            disabled={!active || !ready}
          >
            <Save size={17} />
            Save changes
          </button>
        </footer>
      </form>
    </WorkspacePanel>
  );
}

/* =========================================================
   PAGE ENTRY
   ========================================================= */

export default function PermissionsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-sm text-gr-muted">
          Verifying owner access…
        </p>
      }
    >
      <AuthorizedPermissions {...props} />
    </Suspense>
  );
}

/* =========================================================
   OWNER DIRECTORY
   ========================================================= */

async function AuthorizedPermissions({
  searchParams,
}: Props) {
  const staff = await requireStaff();

  if (staff.role !== 'owner') {
    notFound();
  }

  const params = await searchParams;

  const query =
    typeof params.search === 'string'
      ? params.search.trim().slice(0, 100)
      : '';

  const directory = await loadPermissionDirectory();

  const employees =
    directory.ok ? directory.data.items : [];

  const normalized = query.toLowerCase();

  const filtered = employees.filter(employee =>
    [
      employee.displayName,
      employee.email ?? '',
      employee.locationName ?? '',
      employee.role,
      roleLabels[employee.role],
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  );

  const activeEmployees = employees.filter(
    employee => employee.status === 'active',
  );

  const metrics = [
    {
      title: 'Employees',
      value: employees.length,
    },
    {
      title: 'Active employees',
      value: activeEmployees.length,
    },
    {
      title: 'Invoice access',
      value: employees.filter(
        employee => effectiveAccess(employee, 'invoices'),
      ).length,
    },
    {
      title: 'Wholesale access',
      value: employees.filter(
        employee => effectiveAccess(employee, 'wholesale'),
      ).length,
    },
    {
      title: 'Dispatch access',
      value: employees.filter(
        employee => effectiveAccess(employee, 'dispatch'),
      ).length,
    },
  ];

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Administration / Employee access"
        title="Staff Permissions"
        description="Manage the responsibilities of each employee independently, without changing their assigned role."
        actions={
          <>
            <Link
              href="/workspace/staff"
              className={workspaceSecondary}
            >
              <Users size={17} />
              Staff management
            </Link>

            <Link
              href="/workspace"
              className={workspaceSecondary}
            >
              Workspace
            </Link>
          </>
        }
      />

      {params.result === 'saved' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-gr-success-border bg-gr-success-bg p-4 text-sm text-gr-success"
        >
          <CheckCircle2 size={20} className="shrink-0" />

          <p>
            Employee permissions saved successfully.
            The employee should refresh their workspace
            to update their navigation.
          </p>
        </div>
      )}

      {['failed', 'invalid'].includes(params.result ?? '') && (
        <WorkspaceNotice
          tone="error"
          title="Permission changes not confirmed"
        >
          Reload the employee configuration and try
          again. Another session may have changed
          the permission settings.
        </WorkspaceNotice>
      )}

      <WorkspaceNotice title="How permissions work">
        <div className="flex items-start gap-3">
          <ShieldCheck size={23} className="shrink-0" />

          <p>
            Switch on the modules an employee needs,
            then save their changes. Access is checked
            against their authenticated account and
            selling location. Suspending an employee
            blocks access regardless of their switches.
          </p>
        </div>
      </WorkspaceNotice>

      {directory.ok && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map(metric => (
            <article
              key={metric.title}
              className="rounded-2xl border border-gr-border bg-gr-surface p-4"
            >
              <p className="text-xs font-semibold text-gr-muted">
                {metric.title}
              </p>

              <strong className="mt-2 block font-serif text-3xl tabular-nums text-gr-text">
                {metric.value}
              </strong>
            </article>
          ))}
        </section>
      )}

      <WorkspacePanel className="grid gap-4">
        <form
          method="get"
          action="/workspace/permissions"
          className="flex flex-wrap items-end gap-3"
        >
          <label className={`${workspaceLabel} min-w-0 flex-1`}>
            Find an employee

            <input
              type="search"
              className={workspaceInput}
              name="search"
              defaultValue={query}
              maxLength={100}
              placeholder="Search name, email or role"
            />
          </label>

          <button type="submit" className={workspacePrimary}>
            <Search size={17} />
            Search
          </button>

          <Link
            href="/workspace/permissions"
            className={workspaceSecondary}
          >
            Clear
          </Link>
        </form>

        {directory.ok && (
          <p className="text-xs text-gr-muted">
            Showing {filtered.length} of {employees.length} employees
          </p>
        )}
      </WorkspacePanel>

      {!directory.ok ? (
        <WorkspaceNotice
          tone="error"
          title="Employee permissions unavailable"
        >
          {directory.message}
        </WorkspaceNotice>
      ) : filtered.length === 0 ? (
        <WorkspaceNotice
          title={
            query
              ? 'No matching employees'
              : 'No employees added'
          }
          action={
            <Link
              href="/workspace/staff"
              className={workspaceSecondary}
            >
              Staff management
            </Link>
          }
        >
          {query
            ? 'Try searching with another name or email.'
            : 'Create an employee account before configuring its access.'}
        </WorkspaceNotice>
      ) : (
        <div className="grid gap-5">
          {filtered.map(employee => (
            <EmployeeCard
              key={`${employee.userId}:${employee.revision}`}
              employee={employee}
              availableModules={directory.data.editableModules}
            />
          ))}
        </div>
      )}
    </div>
  );
}