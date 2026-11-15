'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { History, LockKeyhole, Mail, Plus, Search, UsersRound, X } from 'lucide-react';
import { employeeRoles, type EmployeeRole, type StaffDirectory } from '@/src/lib/golden-rose/employees';
import {
  WorkspaceNotice, WorkspacePageHeader, WorkspacePanel,
  workspaceInput, workspaceLabel, workspacePrimary, workspaceSecondary,
} from '@/src/components/workspace/page-layout';
import { manageEmployee, type EmployeeAction } from './actions';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });
const sectionTitle = 'font-serif text-xl font-normal text-[#41172a] sm:text-2xl';
const rowLayout = 'grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] lg:items-center';
const mobileLabel = 'block text-xs font-semibold text-[#6d5b64] lg:hidden';
const pillColors: Record<string, string> = {
  active: 'bg-[#e6f1e8] text-[#2d5b3c]',
  accepted: 'bg-[#e6f1e8] text-[#2d5b3c]',
  pending: 'bg-[#fff0d8] text-[#69461b]',
  suspended: 'bg-[#fff0d8] text-[#69461b]',
  revoked: 'bg-[#fae7eb] text-[#7b3045]',
  expired: 'bg-[#f3ecee] text-[#644b56]',
};
const auditLabels: Record<string, string> = {
  invited: 'Invitation created', invite_reissued: 'Invitation reissued', invite_revoked: 'Invitation revoked',
  invite_accepted: 'Invitation accepted', permissions_updated: 'Permissions changed',
  suspended: 'Access suspended', restored: 'Access restored', revoked: 'Access revoked',
};

function Status({ status }: { status: string }) {
  return <span className={'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ' + pillColors[status]}>
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{status}
  </span>;
}

function RoleSelect({ role }: { role?: EmployeeRole }) {
  return <label className={workspaceLabel}>Role<select className={workspaceInput} name="role" defaultValue={role ?? ''} required>
    <option value="" disabled>Choose a role</option>
    {Object.entries(employeeRoles).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
  </select></label>;
}

function StoreSelect({ locations, locationId }: { locations: StaffDirectory['locations']; locationId?: string | null }) {
  return <label className={workspaceLabel}>Assigned store<select className={workspaceInput} name="locationId" defaultValue={locationId ?? ''} required>
    <option value="" disabled>Choose an active store</option>
    {locations.filter(store => store.active || store.id === locationId).map(store =>
      <option key={store.id} value={store.id} disabled={!store.active}>{store.name}{store.active ? '' : ' (inactive)'}</option>)}
  </select></label>;
}

export function StaffSectionLinks() {
  return <nav aria-label="Staff sections" className="flex flex-wrap gap-2">
    <a href="#staff-employees" className={workspaceSecondary}><UsersRound size={16} aria-hidden="true" />Employees</a>
    <a href="#staff-owners" className={workspaceSecondary}><LockKeyhole size={16} aria-hidden="true" />Business Owners</a>
  </nav>;
}

export function StaffManagement({ directory, unavailable }: {
  directory: StaffDirectory | null; unavailable?: 'pending' | 'error';
}) {
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [result, action, pending] = useActionState(async (previous: EmployeeAction & { operation: string }, form: FormData) => {
    setCopyStatus('');
    const operation = String(form.get('operation') ?? '');
    const next = await manageEmployee(previous, form);
    if (operation === 'invite' && next.status === 'success') inviteDialog.current?.close();
    return { ...next, operation };
  }, { status: 'idle', message: '', operation: '' });
  const storeName = (id: string | null) => directory?.locations.find(store => store.id === id)?.name ?? 'Unassigned';
  const activeStore = directory?.locations.some(store => store.active) ?? false;
  const q = query.trim().toLowerCase();
  const employees = directory?.employees ?? [];
  const filtered = employees.filter(employee => (statusFilter === 'all' || employee.status === statusFilter) &&
    [employee.fullName, employee.email, employee.username, employeeRoles[employee.role], storeName(employee.locationId)]
      .some(value => value?.toLowerCase().includes(q)));
  const invitationError = result.operation === 'invite' && result.status === 'error';

  return <div className="grid min-w-0 gap-5">
    <WorkspacePageHeader title="Staff & Permissions" kicker="Team & access"
      description="Manage employee access, store assignments and business ownership."
      actions={activeStore && <button type="button" className={workspacePrimary} aria-haspopup="dialog"
        disabled={pending} onClick={() => inviteDialog.current?.showModal()}><Plus size={17} aria-hidden="true" />Add Employee</button>} />
    <StaffSectionLinks />

    <div id="staff-employees" className="grid min-w-0 scroll-mt-24 gap-5">
      {!directory ? <WorkspacePanel label="employee-directory-title" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="employee-directory-title" className={sectionTitle}>Employee directory</h2>
          {unavailable === 'pending' && <span className="rounded-full bg-[#fff0d8] px-3 py-1 text-xs font-semibold text-[#69461b]">Deployment pending</span>}
        </div>
        <WorkspaceNotice title={unavailable === 'pending' ? 'Employee management awaits deployment' : 'Employee directory could not load'}
          tone={unavailable === 'pending' ? 'pending' : 'error'}
          action={unavailable !== 'pending' && <Link className={workspaceSecondary} href="/workspace/staff">Reload staff</Link>}>
          {unavailable === 'pending'
            ? 'Invitations, employee roles and store assignments will be available after the staff migration is deployed. Business owner access is managed below.'
            : 'Refresh the page to try again.'}
        </WorkspaceNotice>
      </WorkspacePanel> : <>
        {result.message && !invitationError && <WorkspaceNotice title={result.status === 'error' ? 'Action could not be completed' : 'Staff access updated'}
          tone={result.status === 'error' ? 'error' : 'neutral'}>
          <p>{result.message}</p>
          {result.inviteUrl && <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className={workspaceInput + ' flex-[1_1_15rem]'} type="url" aria-label="Private invitation link"
              readOnly value={result.inviteUrl} onFocus={event => event.target.select()} />
            <button type="button" className={workspaceSecondary} onClick={async () => {
              try { await navigator.clipboard.writeText(result.inviteUrl!); setCopyStatus('Invitation link copied.'); }
              catch { setCopyStatus('Select the link to copy it manually.'); }
            }}>Copy link</button>
            <span aria-live="polite">{copyStatus}</span>
          </div>}
        </WorkspaceNotice>}

        <WorkspacePanel label="employee-directory-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="employee-directory-title" className={sectionTitle}>Employee directory</h2>
            <p className="text-sm text-[#6d5b64]">{employees.length} {employees.length === 1 ? 'employee account' : 'employee accounts'}</p>
          </div>
          {!activeStore && <WorkspaceNotice tone="pending" title="Set up a store to invite employees"
            action={<Link className={workspaceSecondary} href="/workspace/inventory">Open inventory</Link>}>
            An employee needs an active store before you can send an invitation.
          </WorkspaceNotice>}
          {employees.length > 0 && <div className="grid gap-3 border-b border-[#e8dcd7] pb-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className={workspaceLabel}>Search employees
              <span className="relative">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 text-[#8a5b2d]" />
                <input className={workspaceInput + ' pl-9'} type="search" value={query}
                  onChange={event => setQuery(event.target.value)} placeholder="Name, email, role or store" />
              </span>
            </label>
            <label className={workspaceLabel}>Access status<select className={workspaceInput} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="active">Active</option>
              <option value="suspended">Suspended</option><option value="revoked">Revoked</option>
            </select></label>
          </div>}
          {!filtered.length ? <WorkspaceNotice title={employees.length ? 'No employees match' : 'No employees yet'}>
            {employees.length ? 'Change the search or status filter to see more results.' : 'Use Add Employee to send the first invitation once a store is active.'}
          </WorkspaceNotice> : <ul className="grid gap-3">
            <li className={rowLayout + ' hidden bg-[#f7eee8] px-4 py-2 text-xs font-semibold text-[#684b56] lg:grid'} aria-hidden="true">
              <span>Employee</span><span>Role</span><span>Assigned store</span><span>Status</span>
            </li>
            {filtered.map(employee => <li key={employee.id} className="grid gap-3 rounded-lg border border-[#ebded8] bg-white p-4">
              <div className={rowLayout}>
                <div className="grid min-w-0 gap-0.5 break-words">
                  <strong className="text-[#3f2632]">{employee.fullName}</strong>
                  <span className="text-xs text-[#6d5b64]">{employee.email}{employee.username ? ' · @' + employee.username : ''}</span>
                </div>
                <span className="text-sm text-[#523a46]"><span className={mobileLabel}>Role</span>{employeeRoles[employee.role]}</span>
                <span className="text-sm text-[#523a46]"><span className={mobileLabel}>Assigned store</span>{storeName(employee.locationId)}</span>
                <Status status={employee.status} />
              </div>
              {employee.status !== 'revoked' && <details className="border-t border-[#f0e6e1] pt-3">
                <summary className="w-fit cursor-pointer rounded-sm text-sm font-semibold text-[#54213a] focus-visible:outline-2 focus-visible:outline-offset-2">Manage access for {employee.fullName}</summary>
                <form action={action} key={employee.role + ':' + (employee.locationId ?? '')} className="mt-4" onSubmit={event => {
                  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                  if (submitter?.value === 'revoke' && !window.confirm('Revoke this employee’s access? A new invitation will be required.')) event.preventDefault();
                }}>
                  <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={pending}>
                    <input type="hidden" name="id" value={employee.id} />
                    <RoleSelect role={employee.role} />
                    <StoreSelect locations={directory.locations} locationId={employee.locationId} />
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button className={workspacePrimary} name="operation" value="update" disabled={!activeStore}>Save role and store</button>
                      <button className={workspaceSecondary} name="operation" value={employee.status === 'active' ? 'suspend' : 'restore'} formNoValidate>
                        {employee.status === 'active' ? 'Suspend' : 'Restore'}
                      </button>
                      <button className={workspaceSecondary} name="operation" value="revoke" formNoValidate>Revoke access</button>
                    </div>
                  </fieldset>
                </form>
              </details>}
            </li>)}
          </ul>}
        </WorkspacePanel>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <WorkspacePanel label="staff-invitations-title" className="grid content-start gap-4">
            <h2 id="staff-invitations-title" className={sectionTitle}>Invitations</h2>
            {!directory.invitations.length ? <p className="text-sm text-[#6d5b64]">No employee invitations yet.</p> : <ul className="divide-y divide-[#ebe0db]">
              {directory.invitations.map(invite => <li key={invite.id} className="grid min-w-0 gap-2 py-3 first:pt-0">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-1 break-words">
                    <strong>{invite.fullName}</strong><span className="text-xs text-[#6d5b64]">{invite.email}</span>
                  </div><Status status={invite.status} />
                </div>
                <p className="text-sm text-[#6d5b64]">{employeeRoles[invite.role]} · {storeName(invite.locationId)}
                  {invite.status === 'pending' && ' · Expires ' + date.format(new Date(invite.expiresAt))}</p>
                {(invite.status === 'pending' || invite.status === 'expired') && <form action={action} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={invite.id} />
                  <button className={workspaceSecondary} name="operation" value="reissue" disabled={pending}>Reissue invitation</button>
                  {invite.status === 'pending' && <button className={workspaceSecondary} name="operation" value="cancel_invite" disabled={pending}>Revoke invitation</button>}
                </form>}
              </li>)}
            </ul>}
          </WorkspacePanel>

          <WorkspacePanel label="staff-audit-title" className="grid content-start gap-4">
            <div className="flex items-center gap-2 text-[#8a5b2d]"><History size={19} aria-hidden="true" />
              <h2 id="staff-audit-title" className={sectionTitle}>Staff audit history</h2></div>
            {!directory.audit.length ? <p className="text-sm text-[#6d5b64]">No employee access changes yet.</p> : <ul className="divide-y divide-[#ebe0db]">
              {directory.audit.map(event => <li key={event.id} className="grid min-w-0 gap-1 py-3 break-words first:pt-0">
                <strong>{auditLabels[event.action] ?? event.action} · {event.subject}</strong>
                <span className="text-xs text-[#6d5b64]">{event.actor} · {date.format(new Date(event.createdAt))}</span>
                {event.detail.role && <span className="text-sm">{event.detail.fromRole ? employeeRoles[event.detail.fromRole] + ' → ' : ''}
                  {employeeRoles[event.detail.role]}{event.detail.store ? ' · ' + storeName(event.detail.store) : ''}</span>}
              </li>)}
            </ul>}
          </WorkspacePanel>
        </div>

        <dialog ref={inviteDialog} aria-labelledby="invite-employee-title"
          className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl overflow-auto rounded-2xl border border-[#e9d8cf] bg-[#fffdf9] p-5 text-[#38252f] shadow-xl backdrop:bg-[#2b0b15]/65 sm:p-7">
          <header className="mb-5 flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <h2 id="invite-employee-title" className={sectionTitle}>Invite an employee</h2>
              <p className="text-sm text-[#6d5b64]">They’ll use their work email to set their own password.</p>
            </div>
            <button type="button" aria-label="Close employee invitation" className="rounded-lg p-2 text-[#54213a] hover:bg-[#f7eee8]"
              onClick={() => inviteDialog.current?.close()}><X size={20} aria-hidden="true" /></button>
          </header>
          <form action={action} aria-busy={pending}>
            <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" disabled={pending || !activeStore}>
              <input type="hidden" name="operation" value="invite" />
              <label className={workspaceLabel + ' sm:col-span-2'}>Full name<input className={workspaceInput} name="fullName"
                autoComplete="off" required minLength={2} maxLength={120} /></label>
              <label className={workspaceLabel}>Work email<input className={workspaceInput} name="email" type="email"
                autoComplete="off" required maxLength={254} /></label>
              <label className={workspaceLabel}>Username (optional)<input className={workspaceInput} name="username"
                autoComplete="off" maxLength={32} /></label>
              <RoleSelect /><StoreSelect locations={directory.locations} />
              {invitationError && <p className="text-sm text-[#74263e] sm:col-span-2" role="alert">{result.message}</p>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-[#e9d8cf] pt-4 sm:col-span-2">
                <button className={workspacePrimary} type="submit"><Mail size={16} aria-hidden="true" />{pending ? 'Saving…' : 'Send invitation'}</button>
              </div>
            </fieldset>
          </form>
        </dialog>
      </>}
    </div>
  </div>;
}
