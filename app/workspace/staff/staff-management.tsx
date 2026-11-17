
'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CircleAlert,
  ClipboardCopy,
  History,
  LockKeyhole,
  Mail,
  Plus,
  Search,
  UsersRound,
  X,
} from 'lucide-react';

import {
  employeeRoles,
  type EmployeeAccountSetupIssue,
  type EmployeeAccountState,
  type EmployeeRole,
  type StaffDirectory,
} from '@/src/lib/golden-rose/employees';

import {
  WorkspaceNotice,
  WorkspacePageHeader,
  WorkspacePanel,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import { manageEmployee, type EmployeeAction } from './actions';
import { manageEmployeeAccount } from './account-actions';
import { employeePasswordHint } from '@/src/lib/golden-rose/employee-passwords';

const date = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

const sectionTitle =
  'font-serif text-xl font-normal text-[#41172a] sm:text-2xl';

const tableColumns =
  'grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_7rem] lg:items-center';

const fieldHint = 'text-xs leading-5 text-[#806d75]';

const accountSetupMessage: Record<EmployeeAccountSetupIssue, string> = {
  'server-key': 'The staff admin key is missing from the web server environment.',
  migration: 'The employee account migration has not been released to the connected database.',
  connection: 'The web server could not verify staff administration access. Check its Supabase connection and reload this page.',
  'email-confirmation': 'The connected Auth project must require work email confirmation.',
  'auth-settings': 'The web server could not verify email confirmation settings.',
};

const pillColors: Record<string, string> = {
  active: 'bg-[#e6f1e8] text-[#2d5b3c]',
  accepted: 'bg-[#e6f1e8] text-[#2d5b3c]',
  pending: 'bg-[#fff0d8] text-[#69461b]',
  suspended: 'bg-[#fff0d8] text-[#69461b]',
  revoked: 'bg-[#fae7eb] text-[#7b3045]',
  expired: 'bg-[#f3ecee] text-[#644b56]',
};

const auditLabels: Record<string, string> = {
  invited: 'Invitation created',
  invite_reissued: 'Invitation reissued',
  invite_revoked: 'Invitation revoked',
  invite_accepted: 'Invitation accepted',
  permissions_updated: 'Permissions changed',
  suspended: 'Access suspended',
  restored: 'Access restored',
  revoked: 'Access revoked',
  account_created: 'Employee account created',
  password_replacement_started: 'Password replacement started',
  temporary_password_replaced: 'Temporary password replaced',
  password_changed: 'Employee set their own password',
};

function TemporaryPasswordFields({ initial = false }: { initial?: boolean }) {
  const label = initial ? 'Initial password' : 'Temporary password';
  return <>
    <label className={workspaceLabel}>{label}
      <input type="password" name="password" className={workspaceInput} minLength={12} maxLength={72} autoComplete="new-password" required />
    </label>
    <label className={workspaceLabel}>Confirm {label.toLowerCase()}
      <input type="password" name="passwordConfirmation" className={workspaceInput} minLength={12} maxLength={72} autoComplete="new-password" required />
    </label>
    <p className={fieldHint + ' sm:col-span-2'}>{employeePasswordHint} Share it privately. An employee must replace it before using the workspace.</p>
  </>;
}

function Status({ status }: { status: string }) {
  return (
    <span
      className={
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ' +
        (pillColors[status] ?? 'bg-[#f3ecee] text-[#644b56]')
      }
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current"
      />
      {status}
    </span>
  );
}

function RoleSelect({ role }: { role?: EmployeeRole }) {
  return (
    <label className={workspaceLabel}>
      Role
      <select
        className={workspaceInput}
        name="role"
        defaultValue={role ?? ''}
        required
      >
        <option value="" disabled>
          Choose a role
        </option>

        {Object.entries(employeeRoles).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StoreSelect({
  locations,
  locationId,
}: {
  locations: StaffDirectory['locations'];
  locationId?: string | null;
}) {
  return (
    <label className={workspaceLabel}>
      Assigned store
      <select
        className={workspaceInput}
        name="locationId"
        defaultValue={locationId ?? ''}
        required
      >
        <option value="" disabled>
          Choose an active store
        </option>

        {locations
          .filter(store => store.active || store.id === locationId)
          .map(store => (
            <option
              key={store.id}
              value={store.id}
              disabled={!store.active}
            >
              {store.name}
              {store.active ? '' : ' (inactive)'}
            </option>
          ))}
      </select>
    </label>
  );
}

export function StaffSectionLinks() {
  return (
    <nav
      aria-label="Staff sections"
      className="flex flex-wrap gap-2"
    >
      <a
        href="#staff-employees"
        className={workspaceSecondary}
      >
        <UsersRound size={16} aria-hidden="true" />
        Employees
      </a>

      <a
        href="#staff-owners"
        className={workspaceSecondary}
      >
        <LockKeyhole size={16} aria-hidden="true" />
        Business Owners
      </a>
    </nav>
  );
}

export function StaffManagement({
  directory,
  unavailable,
  accountStates,
  accountSetupIssues,
}: {
  directory: StaffDirectory | null;
  unavailable?: 'pending' | 'error';
  accountStates: Partial<Record<string, EmployeeAccountState>> | null;
  accountSetupIssues: EmployeeAccountSetupIssue[];
}) {
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const [onboarding, setOnboarding] = useState<'invite' | 'create_account'>('invite');
  const accountsReady = accountStates !== null && accountSetupIssues.length === 0;
  const directSetupPending = onboarding === 'create_account' && !accountsReady;

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copyStatus, setCopyStatus] = useState('');

  const [result, action, pending] = useActionState(
    async (
      previous: EmployeeAction & { operation: string },
      form: FormData,
    ) => {
      setCopyStatus('');

      const operation = String(form.get('operation') ?? '');
      const next: EmployeeAction = ['create_account', 'replace_password', 'resend_confirmation'].includes(operation)
        ? await manageEmployeeAccount(previous, form) : await manageEmployee(previous, form);

      if (
        (operation === 'invite' || operation === 'create_account') &&
        next.status === 'success'
      ) {
        inviteDialog.current?.close();
      }

      return { ...next, operation };
    },
    {
      status: 'idle',
      message: '',
      operation: '',
    },
  );

  // Keep Add Employee visible at every setup stage.
  const backendReady = directory !== null;

  const activeStore =
    directory?.locations.some(store => store.active) ?? false;

  const employees = directory?.employees ?? [];

  const invitationError =
    (result.operation === 'invite' || result.operation === 'create_account') &&
    result.status === 'error';

  const storeName = (id: string | null) =>
    directory?.locations.find(store => store.id === id)?.name ??
    'Unassigned';

  const needle = query.trim().toLowerCase();

  const filtered = employees.filter(
    employee =>
      (statusFilter === 'all' ||
        employee.status === statusFilter) &&
      [
        employee.fullName,
        employee.email,
        employee.username,
        employeeRoles[employee.role],
        storeName(employee.locationId),
      ].some(value => value?.toLowerCase().includes(needle)),
  );

  return (
    <div className="grid min-w-0 gap-5">
      <WorkspacePageHeader
        title="Staff & Permissions"
        kicker="Team & access"
        description="Invite employees, assign store access, manage roles and review security activity."
        actions={
          <button
            type="button"
            className={workspacePrimary}
            aria-haspopup="dialog"
            aria-controls="golden-rose-add-employee"
            onClick={() => inviteDialog.current?.showModal()}
          >
            <Plus size={17} aria-hidden="true" />
            Add Employee
          </button>
        }
      />

      <StaffSectionLinks />

      <section
        id="staff-employees"
        className="grid min-w-0 scroll-mt-24 gap-5"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#e8dcd7] bg-[#fffdf9] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#806574]">
              <UsersRound size={16} aria-hidden="true" />
              Employees
            </div>

            <p className="mt-2 font-serif text-3xl text-[#41172a]">
              {backendReady ? employees.length : '—'}
            </p>

            <p className={fieldHint}>
              {backendReady
                ? 'Registered team members'
                : 'Directory not connected'}
            </p>
          </div>

          <div className="rounded-xl border border-[#e8dcd7] bg-[#fffdf9] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#806574]">
              <Mail size={16} aria-hidden="true" />
              Pending invitations
            </div>

            <p className="mt-2 font-serif text-3xl text-[#41172a]">
              {backendReady
                ? directory.invitations.filter(
                    item => item.status === 'pending',
                  ).length
                : '—'}
            </p>

            <p className={fieldHint}>
              Invitations not yet accepted
            </p>
          </div>

          <div className="rounded-xl border border-[#e8dcd7] bg-[#fffdf9] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#806574]">
              <Building2 size={16} aria-hidden="true" />
              Active stores
            </div>

            <p className="mt-2 font-serif text-3xl text-[#41172a]">
              {backendReady
                ? directory.locations.filter(
                    item => item.active,
                  ).length
                : '—'}
            </p>

            <p className={fieldHint}>
              Stores available for assignments
            </p>
          </div>
        </div>

        {!backendReady ? (
          <WorkspacePanel
            label="employee-directory-title"
            className="grid gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="employee-directory-title"
                className={sectionTitle}
              >
                Employee directory
              </h2>

              <Status
                status={
                  unavailable === 'pending'
                    ? 'pending'
                    : 'unavailable'
                }
              />
            </div>

            <WorkspaceNotice
              tone={
                unavailable === 'pending'
                  ? 'pending'
                  : 'error'
              }
              title={
                unavailable === 'pending'
                  ? 'Staff backend not deployed yet'
                  : 'Employee directory unavailable'
              }
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={workspacePrimary}
                    onClick={() =>
                      inviteDialog.current?.showModal()
                    }
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add Employee
                  </button>

                  <Link
                    href="/workspace/staff"
                    className={workspaceSecondary}
                  >
                    Retry connection
                  </Link>
                </div>
              }
            >
              {unavailable === 'pending'
                ? 'The employee invitation and access forms are in the app, but the required staff database functions are not yet installed. Use Add Employee to view what must be completed before invitations can be sent.'
                : 'The system cannot read employee records right now. No employee accounts have been changed.'}
            </WorkspaceNotice>
          </WorkspacePanel>
        ) : (
          <>
            {result.message && !invitationError && (
              <WorkspaceNotice
                title={
                  result.status === 'error'
                    ? 'Employee action failed'
                    : 'Employee access updated'
                }
                tone={
                  result.status === 'error'
                    ? 'error'
                    : 'neutral'
                }
              >
                <p>{result.message}</p>

                {result.inviteUrl && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      className={workspaceInput}
                      type="url"
                      aria-label="Private employee invitation link"
                      readOnly
                      value={result.inviteUrl}
                      onFocus={event =>
                        event.currentTarget.select()
                      }
                    />

                    <button
                      type="button"
                      className={workspaceSecondary}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            result.inviteUrl!,
                          );

                          setCopyStatus(
                            'Invitation link copied.',
                          );
                        } catch {
                          setCopyStatus(
                            'Select and copy the link manually.',
                          );
                        }
                      }}
                    >
                      <ClipboardCopy
                        size={15}
                        aria-hidden="true"
                      />
                      Copy link
                    </button>

                    <span
                      role="status"
                      className="text-xs text-[#634858] sm:col-span-2"
                    >
                      {copyStatus}
                    </span>
                    {/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(result.inviteUrl) && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 sm:col-span-2">
                        Local testing link only: it will not open on another employee's device.
                        After your website is publicly deployed, set NEXT_PUBLIC_SITE_URL to its
                        HTTPS address and reissue the invitation before sharing it.
                      </p>
                    )}
                  </div>
                )}
              </WorkspaceNotice>
            )}

            <WorkspacePanel
              label="employee-directory-title"
              className="grid gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2
                    id="employee-directory-title"
                    className={sectionTitle}
                  >
                    Employee directory
                  </h2>

                  <p className="mt-1 text-sm text-[#806d75]">
                    {employees.length}{' '}
                    {employees.length === 1
                      ? 'employee'
                      : 'employees'}
                  </p>
                </div>

                <button
                  type="button"
                  className={workspaceSecondary}
                  onClick={() =>
                    inviteDialog.current?.showModal()
                  }
                >
                  <Plus size={16} aria-hidden="true" />
                  Add Employee
                </button>
              </div>

              {!activeStore && (
                <WorkspaceNotice
                  title="A store is required before inviting employees"
                  tone="pending"
                  action={
                    <Link
                      href="/workspace/inventory"
                      className={workspaceSecondary}
                    >
                      <Building2
                        size={16}
                        aria-hidden="true"
                      />
                      Create a store
                      <ArrowRight
                        size={16}
                        aria-hidden="true"
                      />
                    </Link>
                  }
                >
                  Open Inventory & Stock, create a real
                  location with type Store, and return here.
                  The Add Employee button remains available
                  to explain the next step.
                </WorkspaceNotice>
              )}

              {employees.length > 0 && (
                <div className="grid gap-3 border-b border-[#e8dcd7] pb-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <label className={workspaceLabel}>
                    Search employees

                    <span className="relative">
                      <Search
                        size={16}
                        aria-hidden="true"
                        className="pointer-events-none absolute top-3.5 left-3 text-[#8a5b2d]"
                      />

                      <input
                        className={workspaceInput + ' pl-9'}
                        type="search"
                        value={query}
                        onChange={event =>
                          setQuery(event.target.value)
                        }
                        placeholder="Name, email, role or store"
                      />
                    </span>
                  </label>

                  <label className={workspaceLabel}>
                    Access status

                    <select
                      className={workspaceInput}
                      value={statusFilter}
                      onChange={event =>
                        setStatusFilter(event.target.value)
                      }
                    >
                      <option value="all">
                        All statuses
                      </option>
                      <option value="active">
                        Active
                      </option>
                      <option value="suspended">
                        Suspended
                      </option>
                      <option value="revoked">
                        Revoked
                      </option>
                    </select>
                  </label>
                </div>
              )}

              {filtered.length === 0 ? (
                <WorkspaceNotice
                  title={
                    employees.length
                      ? 'No employees match this view'
                      : 'No employees yet'
                  }
                >
                  {employees.length
                    ? 'Try another search or status filter.'
                    : 'Use Add Employee to invite your first team member when an active store is configured.'}
                </WorkspaceNotice>
              ) : (
                <ul className="grid gap-3">
                  <li
                    className={
                      tableColumns +
                      ' hidden rounded-lg bg-[#f7eee8] px-4 py-2 text-xs font-semibold text-[#684b56] lg:grid'
                    }
                    aria-hidden="true"
                  >
                    <span>Employee</span>
                    <span>Role</span>
                    <span>Assigned store</span>
                    <span>Status</span>
                  </li>

                  {filtered.map(employee => (
                    <li
                      key={employee.id}
                      className="grid gap-3 rounded-xl border border-[#ebded8] bg-white p-4"
                    >
                      <div className={tableColumns}>
                        <div className="grid min-w-0 gap-0.5 break-words">
                          <strong className="text-sm text-[#3f2632]">
                            {employee.fullName}
                          </strong>

                          <span className="text-xs text-[#6d5b64]">
                            {employee.email}
                            {employee.username
                              ? ' · @' + employee.username
                              : ''}
                          </span>
                        </div>

                        <span className="text-sm text-[#523a46]">
                          <span className="block text-xs font-semibold text-[#806d75] lg:hidden">
                            Role
                          </span>
                          {employeeRoles[employee.role]}
                        </span>

                        <span className="text-sm text-[#523a46]">
                          <span className="block text-xs font-semibold text-[#806d75] lg:hidden">
                            Store
                          </span>
                          {storeName(employee.locationId)}
                        </span>

                        <Status status={accountStates?.[employee.id] === 'awaiting_verification' ? 'Email confirmation required'
                          : accountStates?.[employee.id] === 'change_required' ? 'Password change required'
                          : accountStates?.[employee.id] === 'replacing' ? 'Replacement pending'
                          : accountStates?.[employee.id] === 'expired' ? 'Temporary password expired' : employee.status} />
                      </div>

                      {employee.status !== 'revoked' && (
                        <details className="border-t border-[#f0e6e1] pt-3">
                          <summary className="w-fit cursor-pointer text-sm font-semibold text-[#54213a] focus-visible:outline-2 focus-visible:outline-offset-2">
                            Manage access for{' '}
                            {employee.fullName}
                          </summary>

                          <form
                            action={action}
                            key={
                              employee.role +
                              ':' +
                              (employee.locationId ?? '')
                            }
                            className="mt-4"
                            onSubmit={event => {
                              const submitter = (
                                event.nativeEvent as SubmitEvent
                              ).submitter as HTMLButtonElement | null;

                              if (
                                submitter?.value ===
                                  'revoke' &&
                                !window.confirm(
                                  'Revoke this employee’s access? A new invitation will be required.',
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <fieldset
                              disabled={pending}
                              className="grid gap-3 sm:grid-cols-2"
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={employee.id}
                              />

                              <RoleSelect
                                role={employee.role}
                              />

                              <StoreSelect
                                locations={directory.locations}
                                locationId={
                                  employee.locationId
                                }
                              />

                              <div className="flex flex-wrap gap-2 sm:col-span-2">
                                <button
                                  className={workspacePrimary}
                                  name="operation"
                                  value="update"
                                  disabled={!activeStore}
                                >
                                  Save role and store
                                </button>

                                {(!accountStates?.[employee.id] || accountStates[employee.id] === 'ready') && <button
                                  className={workspaceSecondary}
                                  name="operation"
                                  value={
                                    employee.status ===
                                    'active'
                                      ? 'suspend'
                                      : 'restore'
                                  }
                                  formNoValidate
                                >
                                  {employee.status ===
                                  'active'
                                    ? 'Suspend'
                                    : 'Restore'}
                                </button>}

                                <button
                                  className={workspaceSecondary}
                                  name="operation"
                                  value="revoke"
                                  formNoValidate
                                >
                                  Revoke access
                                </button>
                              </div>
                            </fieldset>
                          </form>
                          {accountsReady && accountStates?.[employee.id] && (employee.status === 'active' || accountStates[employee.id] !== 'ready') && (
                            <details className="mt-4 border-t border-[#f0e6e1] pt-3">
                              <summary className="w-fit cursor-pointer text-sm font-semibold text-[#54213a]">Replace temporary password</summary>
                              <form action={action} className="mt-3" aria-busy={pending}>
                                <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
                                  <input type="hidden" name="id" value={employee.id} />
                                  <input type="hidden" name="operation" value="replace_password" />
                                  <TemporaryPasswordFields />
                                  <button className={workspaceSecondary + ' w-fit sm:col-span-2'} type="submit">Replace password</button>
                                </fieldset>
                              </form>
                            </details>
                          )}
                          {accountsReady && accountStates?.[employee.id] === 'awaiting_verification' && <form action={action} className="mt-3">
                            <input type="hidden" name="id" value={employee.id} />
                            <button name="operation" value="resend_confirmation" type="submit" disabled={pending} className={workspaceSecondary}>Resend email confirmation</button>
                          </form>}
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </WorkspacePanel>

            <div className="grid gap-5 xl:grid-cols-2">
              <WorkspacePanel
                label="staff-invitations-title"
                className="grid content-start gap-4"
              >
                <h2
                  id="staff-invitations-title"
                  className={sectionTitle}
                >
                  Employee invitations
                </h2>

                {directory.invitations.length === 0 ? (
                  <p className="text-sm text-[#6d5b64]">
                    No invitations have been issued.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#ebe0db]">
                    {directory.invitations.map(invite => (
                      <li
                        key={invite.id}
                        className="grid gap-2 py-3 first:pt-0"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="grid min-w-0 gap-1 break-words">
                            <strong>
                              {invite.fullName}
                            </strong>

                            <span className="text-xs text-[#6d5b64]">
                              {invite.email}
                            </span>
                          </div>

                          <Status status={invite.status} />
                        </div>

                        <p className="text-sm text-[#6d5b64]">
                          {employeeRoles[invite.role]}
                          {' · '}
                          {storeName(invite.locationId)}

                          {invite.status === 'pending' &&
                            ' · Expires ' +
                              date.format(
                                new Date(invite.expiresAt),
                              )}
                        </p>

                        {(invite.status === 'pending' ||
                          invite.status === 'expired') && (
                          <form
                            action={action}
                            className="flex flex-wrap gap-2"
                          >
                            <input
                              type="hidden"
                              name="id"
                              value={invite.id}
                            />

                            <button
                              className={workspaceSecondary}
                              name="operation"
                              value="reissue"
                              disabled={pending}
                            >
                              Reissue invitation
                            </button>

                            {invite.status ===
                              'pending' && (
                              <button
                                className={workspaceSecondary}
                                name="operation"
                                value="cancel_invite"
                                disabled={pending}
                              >
                                Revoke invitation
                              </button>
                            )}
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </WorkspacePanel>

              <WorkspacePanel
                label="staff-audit-title"
                className="grid content-start gap-4"
              >
                <div className="flex items-center gap-2 text-[#8a5b2d]">
                  <History size={19} aria-hidden="true" />

                  <h2
                    id="staff-audit-title"
                    className={sectionTitle}
                  >
                    Staff audit history
                  </h2>
                </div>

                {directory.audit.length === 0 ? (
                  <p className="text-sm text-[#6d5b64]">
                    No employee access changes yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#ebe0db]">
                    {directory.audit.map(entry => (
                      <li
                        key={entry.id}
                        className="grid gap-1 py-3 break-words first:pt-0"
                      >
                        <strong>
                          {auditLabels[entry.action] ??
                            entry.action}
                          {' · '}
                          {entry.subject}
                        </strong>

                        <span className="text-xs text-[#6d5b64]">
                          {entry.actor}
                          {' · '}
                          {date.format(
                            new Date(entry.createdAt),
                          )}
                        </span>

                        {entry.detail.role && (
                          <span className="text-sm">
                            {entry.detail.fromRole
                              ? employeeRoles[
                                  entry.detail.fromRole
                                ] + ' → '
                              : ''}

                            {employeeRoles[
                              entry.detail.role
                            ]}

                            {entry.detail.store
                              ? ' · ' +
                                storeName(
                                  entry.detail.store,
                                )
                              : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </WorkspacePanel>
            </div>
          </>
        )}
      </section>

      {/* Shared onboarding dialog for ready and pending states. */}
      <dialog
        id="golden-rose-add-employee"
        ref={inviteDialog}
        aria-labelledby="invite-employee-title"
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl overflow-auto rounded-2xl border border-[#e9d8cf] bg-[#fffdf9] p-5 text-[#38252f] shadow-2xl backdrop:bg-[#2b0b15]/65 sm:p-7"
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-[0.67rem] font-bold uppercase tracking-[0.17em] text-[#8a5b2d]">
              Team onboarding
            </p>

            <h2
              id="invite-employee-title"
              className={sectionTitle}
            >
              Add an employee
            </h2>

            <p className="text-sm leading-6 text-[#6d5b64]">
              Each employee gets an individual account
              and access to their assigned store.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close employee dialog"
            className="rounded-lg p-2 text-[#54213a] hover:bg-[#f7eee8]"
            onClick={() => inviteDialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {!backendReady ? (
          <div className="grid gap-4">
            <WorkspaceNotice
              tone={
                unavailable === 'pending'
                  ? 'pending'
                  : 'error'
              }
              title="Step 1 — Enable Staff Management"
            >
              Employee invitations cannot be created
              yet because the staff database service is
              unavailable. The reviewed POS authorization
              migration and Staff Management migration
              must be released in order. This page does
              not deploy or change those functions.
            </WorkspaceNotice>

            <div className="rounded-xl border border-[#e8dcd7] bg-white p-4">
              <p className="flex items-center gap-2 font-semibold text-[#41172a]">
                <CircleAlert
                  size={18}
                  aria-hidden="true"
                />
                Step 2 — Set up the physical store
              </p>

              <p className="mt-2 text-sm leading-6 text-[#6d5b64]">
                Employees are assigned to an active store.
                Once the backend is deployed, create
                the real store under Inventory & Stock
                if one does not already exist.
              </p>

              <Link
                className={workspaceSecondary + ' mt-3'}
                href="/workspace/inventory"
              >
                <Building2
                  size={16}
                  aria-hidden="true"
                />
                Open Inventory & Stock
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>
        ) : !activeStore ? (
          <div className="grid gap-4">
            <WorkspaceNotice
              title="Create an active store first"
              tone="pending"
            >
              The employee invitation service is
              connected, but no active store is available
              for assignment. Go to Inventory & Stock,
              create the actual shop with location type
              Store, then return to this page.
            </WorkspaceNotice>

            <Link
              className={workspacePrimary}
              href="/workspace/inventory"
            >
              <Building2
                size={16}
                aria-hidden="true"
              />
              Create store
              <ArrowRight
                size={16}
                aria-hidden="true"
              />
            </Link>
          </div>
        ) : (
          <form action={action} aria-busy={pending}>
            <fieldset
              disabled={pending}
              className="grid gap-4 sm:grid-cols-2"
            >
              <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
                <legend className="mb-2 font-semibold">Onboarding method</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="onboardingMethod" checked={onboarding === 'invite'} onChange={() => setOnboarding('invite')} />
                  Send invitation
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="onboardingMethod" checked={onboarding === 'create_account'} onChange={() => setOnboarding('create_account')} />
                  Create account with initial password
                </label>
              </fieldset>
              {directSetupPending ? (
                <div className="sm:col-span-2">
                  <WorkspaceNotice tone="pending" title="Account creation needs setup">
                    <ul className="list-disc pl-5">
                      {accountSetupIssues.map(issue => <li key={issue}>{accountSetupMessage[issue]}</li>)}
                    </ul>
                    <p className="mt-2">You can send an invitation now.</p>
                  </WorkspaceNotice>
                </div>
              ) : <>
              <input
                type="hidden"
                name="operation"
                value={onboarding}
              />

              <label
                className={
                  workspaceLabel + ' sm:col-span-2'
                }
              >
                Full name
                <input
                  className={workspaceInput}
                  name="fullName"
                  autoComplete="off"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>

              <label className={workspaceLabel}>
                Work email
                <input
                  className={workspaceInput}
                  type="email"
                  name="email"
                  autoComplete="off"
                  required
                  maxLength={254}
                />
              </label>

              <label className={workspaceLabel}>
                Username (optional)
                <input
                  className={workspaceInput}
                  name="username"
                  autoComplete="off"
                  maxLength={32}
                />
              </label>

              <RoleSelect />

              <StoreSelect
                locations={directory.locations}
              />

              {onboarding === 'create_account' ? <TemporaryPasswordFields initial /> : <p className="text-xs leading-5 text-[#806d75] sm:col-span-2">
                Employees set their own passwords.
                An invitation is sent using the configured
                email service; otherwise a private link
                is provided to the owner.
              </p>}

              {invitationError && result.operation === onboarding && (
                <p
                  role="alert"
                  className="text-sm text-[#74263e] sm:col-span-2"
                >
                  {result.message}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-[#e9d8cf] pt-4 sm:col-span-2">
                <button
                  type="button"
                  className={workspaceSecondary}
                  onClick={() =>
                    inviteDialog.current?.close()
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={workspacePrimary}
                >
                  <Mail
                    size={16}
                    aria-hidden="true"
                  />

                  {pending
                    ? 'Creating…'
                    : onboarding === 'create_account' ? 'Create employee account' : 'Send invitation'}
                </button>
              </div>
              </>}
            </fieldset>
          </form>
        )}
      </dialog>
    </div>
  );
}
