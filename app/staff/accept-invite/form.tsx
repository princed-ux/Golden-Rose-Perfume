'use client';

import { useActionState, useState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { acceptOwnerInvitation } from './actions';

export function OwnerInvitationForm() {
  const [result, action, pending] = useActionState(acceptOwnerInvitation, INITIAL_RESULT);
  const [visible, setVisible] = useState(false);

  return <form className="gr-auth-form" action={action} aria-busy={pending}>
    <label className="gr-auth-field">Invited email
      <span className="gr-auth-input-wrap"><input name="email" type="email" autoComplete="username" maxLength={254} required /></span>
    </label>
    <div className="gr-auth-field">
      <label htmlFor="owner-invite-password">Account password</label>
      <div className="gr-auth-input-wrap">
        <input id="owner-invite-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" maxLength={256} required />
        <button type="button" className="gr-auth-reveal" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
      </div>
    </div>
    <label className="gr-auth-field">Invitation code
      <span className="gr-auth-input-wrap"><input name="code" autoComplete="off" spellCheck={false} maxLength={60} required /></span>
    </label>
    <button type="submit" className="gr-auth-submit" disabled={pending}>{pending ? 'Checking invitation…' : 'Accept owner invitation'}</button>
    {result.message && <p role="alert" className="gr-auth-error">{result.message}</p>}
  </form>;
}
