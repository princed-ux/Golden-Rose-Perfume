
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

export function StaffAccessUnavailable({
  retry,
}: {
  retry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(() => {
      if (retry) {
        retry();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <main className="grid min-h-[65vh] place-items-center bg-[#faf7f5] px-4 py-10">
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-[#eadbd6] bg-white p-6 text-[#4b2438] shadow-lg sm:p-8"
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-[#fff2df] text-[#99632b]">
          <AlertCircle
            size={25}
            aria-hidden="true"
          />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#aa7b43]">
          Golden Rose · Workspace
        </p>

        <h1 className="mt-2 font-serif text-3xl">
          Unable to verify access
        </h1>

        <p className="mt-4 text-sm leading-7 text-[#765f6c]">
          The system could not complete its security
          verification. This may be a temporary connection
          or database-service issue.
        </p>

        <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#fff7e9] p-4 text-sm leading-6 text-[#79532e]">
          <ShieldCheck
            size={20}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />

          <p>
            Access is paused until verification succeeds.
            The application has not intentionally signed
            you out because of this temporary error.
          </p>
        </div>

        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={handleRetry}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#54213a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#713450] disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw
            size={18}
            className={
              pending ? 'animate-spin' : ''
            }
            aria-hidden="true"
          />

          {pending
            ? 'Verifying access…'
            : 'Retry verification'}
        </button>

        <p className="mt-4 text-center text-xs text-[#8c7781]">
          If verification repeatedly fails, check the
          server logs before attempting another sign-in.
        </p>
      </section>
    </main>
  );
}
