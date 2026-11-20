'use client';
import { ActionButton, ActionStateForm } from '@/src/components/action-feedback';

import { useActionState, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { MIN_NEW_PASSWORD_LENGTH, NEW_PASSWORD_HINT } from '@/src/lib/customer/auth-policy';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import { acceptEmployeeInvitation } from './actions';

type Mode = 'register' | 'login';

export function EmployeeInvitationForm({ invite, confirmed }: { invite: string; confirmed: boolean }) {
  const [result, action, pending] = useActionState(acceptEmployeeInvitation, INITIAL_RESULT);
  const [mode, setMode] = useState<Mode>(confirmed ? 'login' : 'register');
  const [showPassword, setShowPassword] = useState(false);
  const creating = mode === 'register';

  return (
    <div className="gr-invite-form-shell">
      {confirmed && (
        <ActionStateForm pending={pending} className="gr-invite-confirmed" action={action}>
          <input type="hidden" name="invite" value={invite} />
          <input type="hidden" name="mode" value="current" />
          <div className="gr-invite-confirmed-title"><CheckCircle2 size={18} aria-hidden="true" /> Email confirmed?</div>
          <p>If you have already signed in with your confirmed work email, you can accept this invitation immediately.</p>
          <ActionButton type="submit" disabled={pending} className="gr-invite-confirmed-button">
            Accept with signed-in account <ArrowRight size={16} aria-hidden="true" />
          </ActionButton>
        </ActionStateForm>
      )}

      <div className="gr-invite-mode" role="group" aria-label="Choose how to use your invitation">
        <ActionButton
          type="button"
          aria-pressed={creating}
          className={creating ? 'is-selected' : ''}
          disabled={pending}
          onClick={() => setMode('register')}
        >
          New work account
        </ActionButton>
        <ActionButton
          type="button"
          aria-pressed={!creating}
          className={!creating ? 'is-selected' : ''}
          disabled={pending}
          onClick={() => setMode('login')}
        >
          Existing account
        </ActionButton>
      </div>

      <ActionStateForm pending={pending} className="gr-auth-form gr-invite-form" action={action}>
        <input type="hidden" name="invite" value={invite} />
        <input type="hidden" name="mode" value={mode} />

        <div className="gr-auth-field gr-invite-field">
          <label htmlFor="gr-invite-email">Work email</label>
          <div className="gr-auth-input-wrap gr-invite-input-wrap">
            <Mail size={18} className="gr-invite-field-icon" aria-hidden="true" />
            <input
              id="gr-invite-email"
              name="email"
              type="email"
              placeholder="name@company.com"
              autoComplete="username"
              inputMode="email"
              required
              maxLength={254}
              disabled={pending}
            />
          </div>
        </div>

        <div className="gr-auth-field gr-invite-field">
          <label htmlFor="gr-invite-password">{creating ? 'Create password' : 'Password'}</label>
          <div className="gr-auth-input-wrap gr-invite-input-wrap">
            <LockKeyhole size={18} className="gr-invite-field-icon" aria-hidden="true" />
            <input
              id="gr-invite-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={creating ? `At least ${MIN_NEW_PASSWORD_LENGTH} characters` : 'Enter your password'}
              autoComplete={creating ? 'new-password' : 'current-password'}
              minLength={creating ? MIN_NEW_PASSWORD_LENGTH : undefined}
              maxLength={creating ? undefined : 256}
              required
              disabled={pending}
            />
            <ActionButton
              type="button"
              className="gr-invite-reveal"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              disabled={pending}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </ActionButton>
          </div>
          {creating && <small>{NEW_PASSWORD_HINT}</small>}
        </div>

        {creating && (
          <div className="gr-auth-field gr-invite-field">
            <label htmlFor="gr-invite-confirm">Confirm password</label>
            <div className="gr-auth-input-wrap gr-invite-input-wrap">
              <LockKeyhole size={18} className="gr-invite-field-icon" aria-hidden="true" />
              <input
                id="gr-invite-confirm"
                name="confirmation"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password again"
                autoComplete="new-password"
                minLength={MIN_NEW_PASSWORD_LENGTH}
                required
                disabled={pending}
              />
            </div>
          </div>
        )}

        {result.message && (
          <div
            key={result.message}
            className={result.status === 'error' ? 'gr-invite-message is-error' : 'gr-invite-message is-success'}
            role={result.status === 'error' ? 'alert' : 'status'}
          >
            {result.message}
          </div>
        )}

        <ActionButton className="gr-auth-submit gr-invite-submit" type="submit" disabled={pending}>
          <span>{pending ? 'Please wait…' : creating ? 'Create work account' : 'Sign in and accept invitation'}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </ActionButton>
      </ActionStateForm>

      <p className="gr-invite-switch-note">
        {creating ? 'Already have a confirmed work account?' : 'New employee without an account?'}
        {' '}
        <ActionButton type="button" disabled={pending} onClick={() => setMode(creating ? 'login' : 'register')}>
          {creating ? 'Sign in instead' : 'Create an account'}
        </ActionButton>
      </p>
    </div>
  );
}
