'use client';

import { useActionState, useState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { AuthToast } from '@/src/components/auth-toast';
import { signInStaff } from './actions';

export function StaffLoginForm() {
  const [result, action, pending] = useActionState(signInStaff, INITIAL_RESULT);
  const [show, setShow] = useState(false);
  const [edited, setEdited] = useState(false);
  const invalidCredentials = !edited && result.status === 'error' && /email|password/i.test(result.message);

  return (
    <>
    <AuthToast result={result} />
    <form className="gr-auth-form" action={action} onChange={() => setEdited(true)} onSubmit={() => setEdited(false)}>
      <div className="gr-auth-field">
        <label htmlFor="staff-email">Work email</label>
        <div className="gr-auth-input-wrap">
          <input id="staff-email" name="email" type="email" required maxLength={254} autoComplete="username" aria-invalid={invalidCredentials} />
        </div>
      </div>
      <div className="gr-auth-field">
        <label htmlFor="staff-password">Password</label>
        <div className="gr-auth-input-wrap">
          <input id="staff-password" name="password" type={show ? 'text' : 'password'} required maxLength={256} autoComplete="current-password" aria-invalid={invalidCredentials} />
          <button type="button" className="gr-auth-reveal" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      <button type="submit" className="gr-auth-submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in to workspace'} <span aria-hidden="true">↗</span>
      </button>
    </form>
    </>
  );
}
