'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import './auth-toast.css';

export interface AuthToastResult {
  message: string;
  error?: boolean;
  status?: 'idle' | 'error' | 'success';
}

/** Accessible, dismissible, auto-expiring authentication notice. Never exposes credentials. */
export function AuthToast({ result, title }: { result: AuthToastResult; title?: string }) {
  const [dismissed, setDismissed] = useState<AuthToastResult | null>(null);
  const visible = Boolean(result.message) && dismissed !== result;

  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(() => setDismissed(result), 6500);
    return () => window.clearTimeout(timeout);
  }, [result, visible]);

  if (!visible) return null;
  const kind = result.error || result.status === 'error' ? 'error'
    : result.status === 'success' ? 'success' : 'info';
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info;

  return (
    <div className={`gr-auth-toast gr-auth-toast--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true">
      <span className="gr-auth-toast__symbol"><Icon size={21} aria-hidden="true" /></span>
      <div className="gr-auth-toast__copy">
        <strong>{title ?? (kind === 'error' ? 'Action needs attention' : kind === 'success' ? 'Action completed' : 'Golden Rose')}</strong>
        <p>{result.message}</p>
      </div>
      <button className="gr-auth-toast__close" type="button" onClick={() => setDismissed(result)}
        aria-label="Dismiss notification" title="Dismiss notification"><X size={17} aria-hidden="true" /></button>
    </div>
  );
}

/** Used only after a successful redirect, not for an unverified form submission. */
export function SignedInToast({ destination }: { destination: 'workspace' | 'customer' }) {
  const search = useSearchParams();
  const [signedIn] = useState(() => search.get('notice') === 'signed-in');
  const message = signedIn
    ? destination === 'workspace' ? 'Welcome to your Golden Rose business workspace.' : 'Welcome back to your Golden Rose account.'
    : '';

  const result = useMemo<AuthToastResult>(() => ({
    message, status: message ? 'success' : 'idle',
  }), [message]);

  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [signedIn]);

  return <AuthToast result={result} title="Signed in successfully" />;
}
