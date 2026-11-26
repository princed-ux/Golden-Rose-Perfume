'use client';
import { ActionButton, ActionStateForm, useActionNotice } from '@/src/components/action-feedback';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CheckCircle2, Pencil, Plus, RotateCcw } from 'lucide-react';
import { submitCrmCustomer, type CrmActionState } from './actions';
import type { CrmCustomer, CrmLocation } from './data';
import {
  workspaceInput, workspaceLabel, workspacePrimary, workspaceSecondary,
} from '@/src/components/workspace/page-layout';

const initial: CrmActionState = { status: 'idle', message: '' };

function Result({ state }: { state: CrmActionState }) {
  useActionNotice(state);
  if (!state.message) return null;
  return <p role={state.status === 'error' ? 'alert' : 'status'}
    className={'rounded-xl border p-3 text-sm leading-5 ' +
      (state.status === 'success'
        ? 'border-gr-border bg-gr-success-bg text-gr-success'
        : 'border-gr-border bg-gr-surface-alt text-gr-danger')}>
    {state.status === 'success' && <CheckCircle2 size={16} className="mr-2 inline" />}
    {state.message}
  </p>;
}

function useCrmAction() {
  const [state, action, pending] = useActionState(submitCrmCustomer, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [router, state]);
  return { state, action, pending };
}

function Fields({
  customer,
  locations,
}: {
  customer?: CrmCustomer;
  locations: CrmLocation[];
}) {
  return <div className="grid gap-4 md:grid-cols-2">
    <label className={workspaceLabel}>Full name <span className="text-gr-danger">*</span>
      <input className={workspaceInput} name="fullName"
        minLength={2} maxLength={120} defaultValue={customer?.fullName ?? ''}
        placeholder="Customer's full name" autoComplete="name" required />
    </label>
    <label className={workspaceLabel}>Retail store
      <select name="locationId" className={workspaceInput}
        defaultValue={customer?.locationId || (locations.length === 1 ? locations[0].id : '')}
        disabled={Boolean(customer)} required>
        <option value="" disabled>Select a store</option>
        {locations.map(store => <option key={store.id} value={store.id}>
          {store.name} · {store.code}
        </option>)}
      </select>
      {customer && <input type="hidden" name="locationId" value={customer.locationId} />}
    </label>
    <label className={workspaceLabel}>Work/contact email
      <input className={workspaceInput} name="email" type="email"
        maxLength={254} defaultValue={customer?.email ?? ''}
        placeholder="customer@example.com" autoComplete="email" />
    </label>
    <label className={workspaceLabel}>Telephone / WhatsApp
      <input className={workspaceInput} name="phone" type="tel"
        maxLength={25} defaultValue={customer?.phone ?? ''}
        placeholder="+234..." autoComplete="tel" />
    </label>
    <label className={workspaceLabel + ' md:col-span-2'}>Internal customer notes
      <textarea name="notes" rows={3} maxLength={2000}
        className={workspaceInput + ' min-h-24 resize-y'}
        defaultValue={customer?.notes ?? ''}
        placeholder="Preferences, follow-up notes or service context. Don't enter card details or passwords." />
    </label>
    <p className="text-xs leading-5 text-gr-muted md:col-span-2">
      Provide at least an email or telephone. Staff can only access customers
      for stores their role permits. Customer data is never sent to a public directory.
    </p>
  </div>;
}

export function CreateCustomer({ locations }: { locations: CrmLocation[] }) {
  const { state, action, pending } = useCrmAction();
  return <details className="group rounded-2xl border border-gr-border bg-gr-surface p-4 sm:p-5">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3
      text-gr-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-gold">
      <span className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold">
          <Plus size={20} aria-hidden="true" />
        </span>
        <span className="grid gap-1">
          <strong className="font-serif text-xl font-normal">Add customer</strong>
          <small className="text-xs text-gr-muted">
            Save a real customer profile to Golden Rose CRM
          </small>
        </span>
      </span>
      <span className="text-xs font-semibold text-gr-gold">Open form</span>
    </summary>
    <ActionStateForm pending={pending} action={action} className="mt-5 grid gap-5 border-t border-gr-border pt-5">
      <input type="hidden" name="mode" value="create" />
      <Fields locations={locations} />
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton type="submit" className={workspacePrimary} disabled={pending || locations.length === 0}>
          <Plus size={17} aria-hidden="true" />
          {pending ? 'Saving customer…' : 'Create customer'}
        </ActionButton>
        {locations.length === 0 && <span className="text-xs text-gr-gold">
          Create an active retail store in Inventory first.
        </span>}
      </div>
      <Result state={state} />
    </ActionStateForm>
  </details>;
}

export function EditCustomer({
  customer,
  locations,
  canArchive,
}: {
  customer: CrmCustomer;
  locations: CrmLocation[];
  canArchive: boolean;
}) {
  const edit = useCrmAction();
  const statusChange = useCrmAction();
  return <details className="rounded-xl border border-gr-border bg-gr-surface p-3">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gr-muted">
      <Pencil size={15} aria-hidden="true" />
      View & manage
    </summary>
    <div className="mt-4 grid gap-4 border-t border-gr-border pt-4">
      {customer.status === 'active' && <ActionStateForm pending={edit.pending} action={edit.action} className="grid gap-4">
        <input type="hidden" name="mode" value="update" />
        <input type="hidden" name="id" value={customer.id} />
        <input type="hidden" name="updatedAt" value={customer.updatedAt} />
        <Fields customer={customer} locations={locations} />
        <ActionButton className={workspacePrimary + ' w-fit'} type="submit" disabled={edit.pending}>
          {edit.pending ? 'Saving changes…' : 'Save customer changes'}
        </ActionButton>
        <Result state={edit.state} />
      </ActionStateForm>}
      {customer.status === 'archived' && <p className="text-sm text-gr-muted">
        This customer is archived. Restore the profile before editing.
      </p>}
      {canArchive && <ActionStateForm pending={statusChange.pending} action={statusChange.action}
        className="grid gap-3 border-t border-gr-border pt-4">
        <input type="hidden" name="id" value={customer.id} />
        <input type="hidden" name="updatedAt" value={customer.updatedAt} />
        <input type="hidden" name="mode" value={customer.status === 'active' ? 'archive' : 'restore'} />
        <ActionButton type="submit" disabled={statusChange.pending}
          className={workspaceSecondary + ' w-fit'}>
          {customer.status === 'active' ? <Archive size={16} /> : <RotateCcw size={16} />}
          {statusChange.pending ? 'Updating…' : customer.status === 'active'
            ? 'Archive customer' : 'Restore customer'}
        </ActionButton>
        <Result state={statusChange.state} />
      </ActionStateForm>}
    </div>
  </details>;
}
