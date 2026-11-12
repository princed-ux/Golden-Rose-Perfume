'use client';

import { useActionState, useState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { signInStaff } from './actions';

export function StaffLoginForm() {
  const [result, action, pending] = useActionState(signInStaff, INITIAL_RESULT);
  const [show, setShow] = useState(false);

  return (
    <form className="gr-auth-form" action={action}>
      <div className="gr-auth-field">
        <label htmlFor="staff-email">Work email</label>
        <div className="gr-auth-input-wrap">
          <input id="staff-email" name="email" type="email" required maxLength={254} autoComplete="username" />
        </div>
      </div>
      <div className="gr-auth-field">
        <label htmlFor="staff-password">Password</label>
        <div className="gr-auth-input-wrap">
          <input id="staff-password" name="password" type={show ? 'text' : 'password'} required maxLength={256} autoComplete="current-password" />
          <button type="button" className="gr-auth-reveal" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      {result.message && <p className="gr-auth-error" role="alert">{result.message}</p>}
      <button type="submit" className="gr-auth-submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in to workspace'} <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}
