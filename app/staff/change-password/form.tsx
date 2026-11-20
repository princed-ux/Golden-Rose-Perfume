'use client';
import { ActionButton, ActionStateForm } from '@/src/components/action-feedback';

import { useActionState } from 'react';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { MIN_NEW_PASSWORD_LENGTH, NEW_PASSWORD_HINT } from '@/src/lib/customer/auth-policy';
import { changeEmployeePassword } from './actions';

export function ChangeEmployeePasswordForm() {
  const [result, action, pending] = useActionState(changeEmployeePassword, INITIAL_RESULT);
  const input = 'rounded-lg border border-[#6f5946] bg-[#241b19] px-3 py-2.5 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ead29a]';
  return <ActionStateForm pending={pending} action={action} className="grid gap-4" aria-busy={pending}>
    <label className="grid gap-1.5 text-sm font-medium">Current password
      <input className={input} name="currentPassword" type="password" autoComplete="current-password" required />
    </label>
    <label className="grid gap-1.5 text-sm font-medium">New password
      <input className={input} name="password" type="password" autoComplete="new-password" minLength={MIN_NEW_PASSWORD_LENGTH}
        aria-describedby="employee-password-rules" required />
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Confirm new password
      <input className={input} name="passwordConfirmation" type="password" autoComplete="new-password" minLength={MIN_NEW_PASSWORD_LENGTH} required />
    </label>
    <p id="employee-password-rules" className="text-sm text-[#e3c99c]">{NEW_PASSWORD_HINT}</p>
    {result.message && <p role="alert" className="text-sm text-[#ffd5d5]">{result.message}</p>}
    <ActionButton disabled={pending} className="min-h-11 rounded-lg bg-[#e0bf7c] px-4 py-2 font-bold text-[#261519] disabled:opacity-60">
      {pending ? 'Changing password…' : 'Change password'}
    </ActionButton>
  </ActionStateForm>;
}
