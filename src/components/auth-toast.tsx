'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import styles from './auth-toast.module.css';

export interface AuthToastResult {
  message: string;
  error?: boolean;
  status?: 'idle' | 'error' | 'success';
}

/** Accessible, dismissible, auto-expiring authentication notice. Never exposes credentials. */
export function AuthToast({ result }: { result: AuthToastResult }) {
  const [active, setActive] = useState<{ message: string; kind: 'error' | 'success' | 'info' } | null>(null);

  useEffect(() => {
    if (!result.message) {
      setActive(null);
      return;
    }
    const kind = result.error || result.status === 'error' ? 'error'
      : result.status === 'success' ? 'success' : 'info';
    setActive({ message: result.message, kind });
    const timeout = window.setTimeout(() => setActive(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [result]);

  if (!active) return null;
  const Icon = active.kind === 'error' ? AlertCircle : active.kind === 'success' ? CheckCircle2 : Info;

  return (
    <div className={`${styles.toast} ${styles[active.kind]}`}
      role={active.kind === 'error' ? 'alert' : 'status'}
      aria-live={active.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true">
      <span className={styles.symbol}><Icon size={21} aria-hidden="true" /></span>
      <div className={styles.copy}>
        <strong>{active.kind === 'error' ? 'Sign-in needs attention' : active.kind === 'success' ? 'Signed in successfully' : 'Golden Rose'}</strong>
        <p>{active.message}</p>
      </div>
      <button className={styles.close} type="button" onClick={() => setActive(null)}
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

  return <AuthToast result={result} />;
}
