'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { MIN_NEW_PASSWORD_LENGTH } from '../lib/customer/auth-policy';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'staff-login' | 'accept-invite';
type Field = 'email' | 'password' | 'confirmPassword' | 'inviteCode';
export type AuthValues = Record<Field, string>;

/** UI validation only; never creates a session, submits credentials or verifies an invitation. */
export function validateAuthValues(mode: AuthMode, values: AuthValues) {
  const errors: Partial<Record<Field, string>> = {};
  const createsPassword = mode === 'register' || mode === 'accept-invite';
  const email = values.email.trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (mode !== 'forgot-password' && !values.password) errors.password = 'Enter your password.';
  if (createsPassword && (values.password.length < MIN_NEW_PASSWORD_LENGTH || values.password.length > 128)) errors.password = `Use between ${MIN_NEW_PASSWORD_LENGTH} and 128 characters.`;
  if (createsPassword && (!values.confirmPassword || values.password !== values.confirmPassword)) errors.confirmPassword = 'Your passwords must match.';
  if (mode === 'accept-invite' && (!values.inviteCode.trim() || values.inviteCode.length > 256)) errors.inviteCode = 'Enter the invitation code provided by your manager.';
  return errors;
}

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const interactive = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState('');
  const createsPassword = mode === 'register' || mode === 'accept-invite';
  const fields: { name: Field; label: string; autoComplete: string }[] = [
    { name: 'email', label: mode === 'staff-login' || mode === 'accept-invite' ? 'Work email' : 'Email address', autoComplete: 'email' },
    ...(mode === 'accept-invite' ? [{ name: 'inviteCode' as const, label: 'Invitation code', autoComplete: 'off' }] : []),
    ...(mode !== 'forgot-password' ? [{ name: 'password' as const, label: createsPassword ? 'Create a password' : 'Password', autoComplete: createsPassword ? 'new-password' : 'current-password' }] : []),
    ...(createsPassword ? [{ name: 'confirmPassword' as const, label: 'Confirm password', autoComplete: 'new-password' }] : []),
  ];
  const buttonText = { login: 'Sign in', register: 'Create customer account', 'forgot-password': 'Request reset link', 'staff-login': 'Sign in to workspace', 'accept-invite': 'Accept invitation' }[mode];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = Object.fromEntries(['email', 'password', 'confirmPassword', 'inviteCode'].map(name => [name, String(data.get(name) ?? '')])) as AuthValues;
    const nextErrors = validateAuthValues(mode, values);
    setErrors(nextErrors);
    setStatus('');
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const input = form.elements.namedItem(firstError);
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    setStatus(mode === 'forgot-password'
      ? 'Email format checked. Password recovery is not connected, so no reset email was sent.'
      : mode === 'accept-invite'
        ? 'Details checked locally. Invitation verification is not connected; no account was created.'
        : mode === 'register'
          ? 'Details checked locally. Customer registration is not connected; no account was created.'
          : 'Details checked locally. Sign-in is not connected; you have not been signed in.');
    // Do not retain passwords after validation. The future server must set roles itself.
    form.reset();
    setShowPassword(false);
  }

  return (
    <form className="gr-auth-form" onSubmit={handleSubmit} noValidate>
      <p className="gr-auth-notice">This invitation preview does not send or save your details.</p>
      {fields.map(field => {
        const id = mode + '-' + field.name;
        const passwordField = field.name === 'password' || field.name === 'confirmPassword';
        return (
          <div className="gr-auth-field" key={field.name}>
            <label htmlFor={id}>{field.label}</label>
            <div className="gr-auth-input-wrap">
              <input id={id} name={field.name} type={passwordField ? (showPassword ? 'text' : 'password') : field.name === 'email' ? 'email' : 'text'} autoComplete={field.autoComplete} disabled={!interactive} required maxLength={field.name === 'email' ? 254 : passwordField ? 128 : 256} minLength={passwordField && createsPassword ? MIN_NEW_PASSWORD_LENGTH : undefined} spellCheck={false} autoCapitalize="none" aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? id + '-error' : field.name === 'password' && createsPassword ? id + '-hint' : undefined} onChange={() => { setStatus(''); if (errors[field.name]) setErrors(previous => ({ ...previous, [field.name]: undefined })); }} />
              {field.name === 'password' && <button type="button" className="gr-auth-reveal" disabled={!interactive} onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}>{showPassword ? 'Hide' : 'Show'}</button>}
            </div>
            {field.name === 'password' && createsPassword && <small id={id + '-hint'}>Use at least {MIN_NEW_PASSWORD_LENGTH} characters. Longer passphrases are welcome.</small>}
            {errors[field.name] && <p className="gr-auth-error" id={id + '-error'} role="alert">{errors[field.name]}</p>}
          </div>
        );
      })}
      <button type="submit" className="gr-auth-submit" disabled={!interactive}>{buttonText}<span aria-hidden="true">↗</span></button>
      {status && <p className="gr-auth-status" role="status">{status}</p>}
    </form>
  );
}
