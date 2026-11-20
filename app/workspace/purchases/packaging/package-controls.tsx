
'use client';

import {
  useActionState,
  useEffect,
  useState,
} from 'react';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import {
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
} from 'lucide-react';

import {
  savePackage,
  deactivatePackage,
} from './actions';

const inputClass =
  'min-h-11 w-full rounded-xl border border-[#e2d2ca] ' +
  'bg-white px-3 py-2 text-sm text-[#452237] ' +
  'focus-visible:outline-2 focus-visible:outline-[#b68a51]';

const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 ' +
  'rounded-xl bg-[#54213a] px-4 py-2.5 text-sm font-semibold ' +
  'text-white hover:bg-[#42182d] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const idle = {
  status: 'idle' as const,
  message: '',
};

function SubmitButton({
  text,
  pendingText,
}: {
  text: string;
  pendingText: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass}
    >
      {pending && (
        <LoaderCircle
          size={16}
          className="animate-spin"
          aria-hidden="true"
        />
      )}

      {pending ? pendingText : text}
    </button>
  );
}

function Feedback({
  status,
  message,
}: {
  status: 'idle' | 'success' | 'error';
  message: string;
}) {
  if (!message || status === 'idle') {
    return null;
  }

  const success = status === 'success';

  return (
    <div
      role={success ? 'status' : 'alert'}
      aria-live={success ? 'polite' : 'assertive'}
      className={
        'flex items-start gap-2 rounded-xl border p-3 text-sm ' +
        (success
          ? 'border-[#b6dec0] bg-[#f1fff4] text-[#28673a]'
          : 'border-[#e8c1cc] bg-[#fff3f4] text-[#91364c]')
      }
    >
      {success ? (
        <CheckCircle2
          size={18}
          className="shrink-0"
          aria-hidden="true"
        />
      ) : (
        <AlertCircle
          size={18}
          className="shrink-0"
          aria-hidden="true"
        />
      )}

      <span>{message}</span>
    </div>
  );
}

export function PackageEditor({
  variantId,
}: {
  variantId: string;
}) {
  const router = useRouter();
  const [status, action] = useActionState(
    savePackage,
    idle,
  );

  const [unitName, setUnitName] = useState('');
  const [units, setUnits] = useState('12');

  useEffect(() => {
    if (status.status === 'success') {
      router.refresh();
    }
  }, [status, router]);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-[#eaded5] bg-[#fffaf5] p-4"
    >
      <input
        type="hidden"
        name="variantId"
        value={variantId}
      />

      <p className="text-sm font-semibold text-[#54213a]">
        Add or update a package
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm text-[#634353]">
          Package name

          <input
            name="unitName"
            className={inputClass}
            placeholder="carton"
            value={unitName}
            onChange={(event) =>
              setUnitName(event.target.value)
            }
            minLength={2}
            maxLength={32}
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm text-[#634353]">
          Number of individual units

          <input
            name="unitsPerPackage"
            type="number"
            className={inputClass}
            min={2}
            max={100000}
            step={1}
            value={units}
            onChange={(event) =>
              setUnits(event.target.value)
            }
            required
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          text="Save package conversion"
          pendingText="Saving conversion…"
        />

        <p className="text-xs text-[#896e7c]">
          Existing stock quantities are not changed.
        </p>
      </div>

      <Feedback
        status={status.status}
        message={status.message}
      />
    </form>
  );
}

export function PackageDeactivate({
  id,
}: {
  id: string;
}) {
  const router = useRouter();

  const [status, action] = useActionState(
    deactivatePackage,
    idle,
  );

  useEffect(() => {
    if (status.status === 'success') {
      router.refresh();
    }
  }, [status, router]);

  return (
    <form
      action={action}
      className="grid justify-items-end gap-2"
    >
      <input type="hidden" name="id" value={id} />

      <SubmitButton
        text="Deactivate"
        pendingText="Deactivating…"
      />

      <Feedback
        status={status.status}
        message={status.message}
      />
    </form>
  );
}
