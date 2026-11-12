'use client';

import { useActionState, useState } from 'react';
import { signInWithGoogle, submitCustomerAuth, signOutCustomer } from '@/app/account/actions';
import { INITIAL_AUTH_RESULT, type AuthResult, type CustomerAuthMode } from '@/src/lib/customer/auth-policy';

const labels: Record<CustomerAuthMode, string> = {
  login: 'Sign in with email',
  register: 'Create an account with email',
  'forgot-password': 'Email me a reset link',
  'reset-password': 'Save new password',
};

function AuthMessage({ result }: { result: AuthResult }) {
  if (!result.message) return null;
  return <p className={result.error ? 'gr-auth-error' : 'gr-auth-status'} role={result.error ? 'alert' : 'status'}>{result.message}</p>;
}

export function CustomerAuthForm({ mode }: { mode: CustomerAuthMode }) {
  const [result, action, pending] = useActionState(submitCustomerAuth.bind(null, mode), INITIAL_AUTH_RESULT);
  const [googleResult, googleAction, googlePending] = useActionState(signInWithGoogle, INITIAL_AUTH_RESULT);
  const [show, setShow] = useState(false);
  const newPassword = mode === 'register' || mode === 'reset-password';
  const busy = pending || googlePending;

  return (
    <div className="gr-auth-form">
      {(mode === 'login' || mode === 'register') && <>
        <form action={googleAction} className="gr-auth-form">
          <button className="gr-auth-submit gr-auth-google" type="submit" disabled={busy}>
            <span aria-hidden="true" className="gr-auth-google-mark">G</span>
            {googlePending ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <AuthMessage result={googleResult} />
        </form>
        <p className="gr-auth-divider">or continue with email</p>
      </>}
      <form action={action} className="gr-auth-form" aria-busy={pending}>
        {mode === 'register' && <label className="gr-auth-field">Name (optional)
          <span className="gr-auth-input-wrap"><input name="name" autoComplete="name" maxLength={120} /></span>
        </label>}
        {mode !== 'reset-password' && <label className="gr-auth-field">Email address
          <span className="gr-auth-input-wrap"><input name="email" type="email" required autoComplete="email" maxLength={254} /></span>
        </label>}
        {mode !== 'forgot-password' && <div className="gr-auth-field">
          <label htmlFor="customer-password">{newPassword ? 'New password' : 'Password'}</label>
          <div className="gr-auth-input-wrap">
            <input id="customer-password" name="password" type={show ? 'text' : 'password'} required
              minLength={newPassword ? 12 : undefined} maxLength={newPassword ? 128 : 256}
              autoComplete={newPassword ? 'new-password' : 'current-password'} />
            <button type="button" className="gr-auth-reveal" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {newPassword && <small>Use at least 12 characters.</small>}
        </div>}
        {newPassword && <label className="gr-auth-field">Confirm password
          <span className="gr-auth-input-wrap"><input name="confirmPassword" type={show ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" /></span>
        </label>}
        <button type="submit" className="gr-auth-submit" disabled={busy}>
          {pending ? 'Please wait…' : labels[mode]}<span aria-hidden="true">↗</span>
        </button>
        <AuthMessage result={result} />
      </form>
    </div>
  );
}

export function CustomerSignOut() {
  const [result, action, pending] = useActionState(signOutCustomer, INITIAL_AUTH_RESULT);
  return (
    <form action={action}>
      <button type="submit" className="button button--outline" disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>
      {result.message && <p role="alert">{result.message}</p>}
    </form>
  );
}
