'use client';

import { useActionState, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AuthToast } from '@/src/components/auth-toast';
import { signInWithGoogle, submitCustomerAuth, signOutCustomer } from '@/app/account/actions';
import { INITIAL_AUTH_RESULT, MIN_NEW_PASSWORD_LENGTH, type CustomerAuthMode } from '@/src/lib/customer/auth-policy';

const labels: Record<CustomerAuthMode, string> = {
  login: 'Sign in with email',
  register: 'Create an account with email',
  'forgot-password': 'Email me a reset link',
  'reset-password': 'Save new password',
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" focusable="false" className="gr-auth-google-mark" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.65-.34-3.91H24v7.4h11a9.4 9.4 0 0 1-4.08 6.16v5.13h6.6c3.86-3.56 6.09-8.8 6.09-14.78Z" />
      <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.52-4.76l-6.6-5.13c-1.83 1.22-4.17 1.95-6.92 1.95-5.33 0-9.86-3.6-11.48-8.44H5.71v5.29A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.52 27.62a12 12 0 0 1 0-7.24v-5.29H5.71a20 20 0 0 0 0 17.82l6.81-5.29Z" />
      <path fill="#EA4335" d="M24 11.94c3.01 0 5.69 1.04 7.82 3.08l5.87-5.86C34.13 5.84 29.5 4 24 4A20 20 0 0 0 5.71 15.09l6.81 5.29c1.62-4.84 6.15-8.44 11.48-8.44Z" />
    </svg>
  );
}

export function CustomerAuthForm({ mode }: { mode: CustomerAuthMode }) {
  const [result, action, pending] = useActionState(submitCustomerAuth.bind(null, mode), INITIAL_AUTH_RESULT);
  const [googleResult, googleAction, googlePending] = useActionState(signInWithGoogle, INITIAL_AUTH_RESULT);
  const [show, setShow] = useState(false);
  const [lastAction, setLastAction] = useState<'email' | 'google'>('email');
  const [edited, setEdited] = useState(false);
  const notice = lastAction === 'google' ? googleResult : result;
  const credentialError = !edited && lastAction === 'email' && result.error && /email|password/i.test(result.message);
  const newPassword = mode === 'register' || mode === 'reset-password';
  const busy = pending || googlePending;

  return (
    <div className="gr-auth-form">
      <AuthToast result={notice} />
      {(mode === 'login' || mode === 'register') && <>
        <form action={googleAction} className="gr-auth-form" onSubmit={() => setLastAction('google')}>
          <button className="gr-auth-submit gr-auth-google" type="submit" disabled={busy}>
            <GoogleMark />
            {googlePending ? 'Opening Google…' : 'Continue with Google'}
          </button>
        </form>
        <p className="gr-auth-divider">or continue with email</p>
      </>}
      <form action={action} className="gr-auth-form" aria-busy={pending}
        onSubmit={() => { setLastAction('email'); setEdited(false); }} onChange={() => setEdited(true)}>
        {mode === 'register' && <label className="gr-auth-field">Name (optional)
          <span className="gr-auth-input-wrap"><input name="name" autoComplete="name" maxLength={120} /></span>
        </label>}
        {mode !== 'reset-password' && <label className="gr-auth-field">Email address
          <span className="gr-auth-input-wrap"><input name="email" type="email" required autoComplete="email" maxLength={254} aria-invalid={credentialError} /></span>
        </label>}
        {mode !== 'forgot-password' && <div className="gr-auth-field">
          <label htmlFor="customer-password">{mode === 'reset-password' ? 'New password' : 'Password'}</label>
          <div className="gr-auth-input-wrap">
            <input id="customer-password" name="password" type={show ? 'text' : 'password'} required
              minLength={newPassword ? MIN_NEW_PASSWORD_LENGTH : undefined} maxLength={newPassword ? 128 : 256}
              autoComplete={newPassword ? 'new-password' : 'current-password'} aria-invalid={credentialError} />
            <button type="button" className="gr-auth-reveal" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {newPassword && <small>Use at least {MIN_NEW_PASSWORD_LENGTH} characters.</small>}
        </div>}
        {newPassword && <label className="gr-auth-field">Confirm password
          <span className="gr-auth-input-wrap"><input name="confirmPassword" type={show ? 'text' : 'password'} required minLength={MIN_NEW_PASSWORD_LENGTH} maxLength={128} autoComplete="new-password" /></span>
        </label>}
        <button type="submit" className="gr-auth-submit" disabled={busy}>
          {pending ? 'Please wait…' : labels[mode]}<ArrowUpRight className="gr-auth-submit-arrow" size={17} aria-hidden="true" />
        </button>
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
