'use client';

import { useActionState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { manageOwnerAccess, type OwnerActionResult } from './actions';

export function OwnerInviteForm() {
  const [result, action, pending] = useActionState<OwnerActionResult, FormData>(manageOwnerAccess, INITIAL_RESULT);
  return <form action={action} className="gr-live-fields" aria-busy={pending}>
    <input type="hidden" name="operation" value="invite" />
    <label>Confirmed recipient email<input type="email" name="email" autoComplete="off" maxLength={254} required /></label>
    <button type="submit" className="gr-live-primary" disabled={pending}>{pending ? 'Creating invitation…' : 'Create owner invitation'}</button>
    {result.message && <p className="gr-live-wide gr-live-result" data-status={result.status} role="status">{result.message}</p>}
    {result.code && <label className="gr-live-wide">Invitation code<input readOnly value={result.code} onFocus={event => event.currentTarget.select()} /></label>}
  </form>;
}

export function OwnerAccessButton({ operation, id, label }: { operation: 'revoke' | 'suspend' | 'restore' | 'remove'; id: string; label: string }) {
  const [result, action, pending] = useActionState(manageOwnerAccess, INITIAL_RESULT);
  return <form action={action} className="gr-live-inline-form" onSubmit={event => {
    if (operation === 'remove' && !window.confirm('Revoke this suspended owner’s workspace access? A new invitation is required to grant it again.')) event.preventDefault();
  }}>
    <input type="hidden" name="operation" value={operation} /><input type="hidden" name="id" value={id} />
    <button type="submit" className="gr-live-secondary" disabled={pending}>{pending ? 'Updating…' : label}</button>
    {result.status === 'error' && <p className="gr-live-result" data-status="error" role="alert">{result.message}</p>}
  </form>;
}
