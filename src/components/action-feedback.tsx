'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, useTransition, type ButtonHTMLAttributes, type SubmitEvent as ReactSubmitEvent, type FormHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { AuthToast, type AuthToastResult } from './auth-toast';

type Result = AuthToastResult & { status?: 'idle' | 'success' | 'error' };
const NOTICE_EVENT = 'golden-rose-action-notice';
const FormContext = createContext<{ pending: boolean; submitter: string | null; clickScope?: boolean } | null>(null);

export function ActionNotificationHost() {
  const [notice, setNotice] = useState<Result>({ message: '' });
  useEffect(() => {
    const receive = (event: Event) => setNotice({ ...(event as CustomEvent<Result>).detail });
    window.addEventListener(NOTICE_EVENT, receive);
    return () => window.removeEventListener(NOTICE_EVENT, receive);
  }, []);
  return <AuthToast result={notice} title={notice.status === 'success' ? 'Action completed' : 'Action needs attention'} />;
}

export function useActionNotice(result: Result) {
  useEffect(() => {
    const {message,status,error} = result;
    if (message && (status !== 'idle' || error))
      window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: {message,status,error} }));
  }, [result]);
}

export function ActionNotice({ result }: { result: Result }) {
  useActionNotice(result);
  return null;
}

export function ActionButton({ pending, pendingLabel = 'Processing…', children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean; pendingLabel?: string }) {
  const native = useFormStatus();
  const context = useContext(FormContext);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const submitting = (props.type ?? 'submit') === 'submit';
  const nativeWorking = submitting && native.pending && (!props.name || props.value == null || native.data?.get(props.name) === String(props.value));
  const working = pending ?? (context ? context.pending && (context.clickScope ? context.submitter === id : submitting && (!context.submitter || context.submitter === id)) : nativeWorking);
  return <button {...props} id={id} disabled={disabled || pending || context?.pending || native.pending} aria-busy={working || undefined}>
    {working ? <><LoaderCircle className="gr-action-spinner" size={16} aria-hidden="true" />{pendingLabel}</> : children}
  </button>;
}

export function ActionScope({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  const [submitter, setSubmitter] = useState<string | null>(null);
  return <FormContext.Provider value={{pending,submitter,clickScope:true}}><div style={{display:'contents'}} onClickCapture={event => {
    if (!pending && event.target instanceof Element) setSubmitter(event.target.closest('button')?.id ?? null);
  }}>{children}</div></FormContext.Provider>;
}

/** Explicit onSubmit avoids React clearing uncontrolled values after a failed action. */
export function ActionForm({ action, children, resetOnSuccess = false, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'> & {
  action: (data: FormData) => Promise<Result>;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, startTransition] = useTransition();
  const [submitter, setSubmitter] = useState<string | null>(null);
  const [result, setResult] = useState<Result>({message:'', status:'idle'});
  useActionNotice(result);
  function submit(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(form, button);
    lock.current = true;
    setSubmitter(button?.id ?? null);
    setResult({message:'',status:'idle'});
    startTransition(async () => {
      try {
        const next = await action(data);
        setResult(next);
        if (next.status === 'success') {
          if (resetOnSuccess) form.reset();
          router.refresh();
        }
      } catch (error) {
        unstable_rethrow(error);
        setResult({status:'error',message:'The server could not confirm this action. Your entries have been kept. Check the latest records before retrying.'});
      } finally { lock.current = false; }
    });
  }
  return <FormContext.Provider value={{pending,submitter}}><form {...props} onSubmit={submit} aria-busy={pending}>
    <fieldset disabled={pending} className="gr-action-fields">{children}</fieldset>
    {result.message && <p className="gr-action-result" data-status={result.status} role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
  </form></FormContext.Provider>;
}

/** Keeps React action-state forms in place on validation/network errors. */
export function ActionStateForm({ action, pending, onSubmit, children, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> & {
  action: (data: FormData) => void; pending: boolean;
}) {
  const [transition, startTransition] = useTransition();
  const locked = useRef(false);
  const [submitter, setSubmitter] = useState<string | null>(null);
  const busy = pending || transition;
  useEffect(() => { if (!busy) locked.current = false; }, [busy]);
  function submit(event: ReactSubmitEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (locked.current) return;
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, button);
    locked.current = true;
    setSubmitter(button?.id ?? null);
    startTransition(() => action(data));
  }
  return <FormContext.Provider value={{pending:busy,submitter}}><form {...props} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy} className="gr-action-fields">{children}</fieldset>
  </form></FormContext.Provider>;
}
