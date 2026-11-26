'use client';
import { ActionButton, ActionStateForm, ActionNotice } from '@/src/components/action-feedback';

import { useActionState } from 'react';
import { workspaceInput, workspaceLabel, workspacePrimary, workspaceSecondary } from '@/src/components/workspace/page-layout';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { manageOwnerAccess, type OwnerActionResult } from './actions';

export function OwnerInviteForm() {
  const [result, action, pending] = useActionState<OwnerActionResult, FormData>(manageOwnerAccess, INITIAL_RESULT);
  return <ActionStateForm pending={pending} action={action} className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" aria-busy={pending}>
    <input type="hidden" name="operation" value="invite" />
    <label className={workspaceLabel}>Confirmed recipient email<input className={workspaceInput} type="email" name="email" autoComplete="off" maxLength={254} required /></label>
    <ActionButton type="submit" className={workspacePrimary} disabled={pending}>{pending ? 'Creating invitation…' : 'Create owner invitation'}</ActionButton>
    <ActionNotice result={result} />
    {result.message && <p className={'text-sm sm:col-span-2 ' + (result.status === 'error' ? 'text-gr-danger' : 'text-gr-success')} role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
    {result.code && <label className={workspaceLabel + ' sm:col-span-2'}>Invitation code<input className={workspaceInput} readOnly value={result.code} onFocus={event => event.currentTarget.select()} /></label>}
  </ActionStateForm>;
}

export function OwnerAccessButton({ operation, id, label }: { operation: 'revoke' | 'suspend' | 'restore' | 'remove'; id: string; label: string }) {
  const [result, action, pending] = useActionState(manageOwnerAccess, INITIAL_RESULT);
  return <ActionStateForm pending={pending} action={action} className="grid min-w-0 items-start gap-2" onSubmit={event => {
    if (operation === 'remove' && !window.confirm('Revoke this suspended owner’s workspace access? A new invitation is required to grant it again.')) event.preventDefault();
  }}>
    <input type="hidden" name="operation" value={operation} /><input type="hidden" name="id" value={id} />
    <ActionButton type="submit" className={workspaceSecondary} disabled={pending}>{pending ? 'Updating…' : label}</ActionButton>
    {result.status === 'error' && <p className="text-sm break-words text-gr-danger" role="alert">{result.message}</p>}
  </ActionStateForm>;
}
