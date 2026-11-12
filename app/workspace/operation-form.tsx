'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { INITIAL_RESULT, type OperationResult } from '@/src/lib/golden-rose/contracts';

export function OperationForm({
  runAction, children, label, inline = false,
}: {
  runAction: (form: FormData) => Promise<OperationResult>;
  children: ReactNode;
  label: string;
  inline?: boolean;
}) {
  const [result, setResult] = useState(INITIAL_RESULT);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    inFlight.current = true;
    setPending(true);
    setResult(INITIAL_RESULT);
    try {
      const next = await runAction(data);
      if (next.status === 'success' && !inline) form.reset();
      setResult(next);
    } catch {
      setResult({ status: 'error', message: 'The request could not be confirmed. Refresh the list before retrying.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending}>
      <fieldset className={inline ? 'gr-live-inline-form' : 'gr-live-fields'} disabled={pending}>
        {children}
        <button type="submit" className={inline ? 'gr-live-secondary' : 'gr-live-primary'}>
          {pending ? 'Saving…' : label}
        </button>
      </fieldset>
      {result.message && <p className="gr-live-result" data-status={result.status} role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
    </form>
  );
}
