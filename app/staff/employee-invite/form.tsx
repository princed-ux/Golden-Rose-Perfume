'use client';

import { useActionState, useState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { acceptEmployeeInvitation } from './actions';

export function EmployeeInvitationForm({ invite, confirmed }: { invite: string; confirmed: boolean }) {
  const [result, action, pending] = useActionState(acceptEmployeeInvitation, INITIAL_RESULT);
  const [mode, setMode] = useState<'register' | 'login'>(confirmed ? 'login' : 'register');
  const [showPassword, setShowPassword] = useState(false);
  return <>
    {confirmed && <form className="gr-auth-form" action={action}>
      <input type="hidden" name="invite" value={invite} />
      <input type="hidden" name="mode" value="current" />
      <button className="gr-auth-submit" disabled={pending}>Accept with signed-in account</button>
    </form>}
    <form className="gr-auth-form" action={action}>
      <input type="hidden" name="invite" value={invite} />
      <input type="hidden" name="mode" value={mode} />
      <label>Work email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
      <label>Password<input name="password" type={showPassword ? 'text' : 'password'} required maxLength={mode === 'register' ? 128 : 256}
        minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
      {mode === 'register' && <label>Confirm password<input name="confirmation" type={showPassword ? 'text' : 'password'}
        required minLength={8} maxLength={128} autoComplete="new-password" /></label>}
      <label className="gr-auth-password-toggle"><input type="checkbox" checked={showPassword}
        onChange={event => setShowPassword(event.target.checked)} /> Show password</label>
      <button className="gr-auth-submit" disabled={pending}>{pending ? 'Working…' :
        mode === 'register' ? 'Create work account' : 'Sign in and accept'}</button>
      <button type="button" className="gr-auth-submit gr-auth-secondary" disabled={pending}
        onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
        {mode === 'register' ? 'Use an existing account' : 'Create a new account'}
      </button>
      {result.message && <p role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
    </form>
  </>;
}
