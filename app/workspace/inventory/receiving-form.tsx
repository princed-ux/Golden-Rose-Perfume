'use client';

import { useCallback, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { INITIAL_RESULT, isStockReceipt, type Location, type StockReceipt } from '@/src/lib/golden-rose/contracts';
import { receiveStock } from '../actions';

const RECEIPT_EVENT = 'golden-rose-pending-receipt';
const noReceipt = () => null;

function subscribe(listener: () => void) {
  window.addEventListener(RECEIPT_EVENT, listener);
  return () => window.removeEventListener(RECEIPT_EVENT, listener);
}

function parseReceipt(raw: string | null) {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStockReceipt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function ReceivingForm({ userId, locations, variants }: {
  userId: string;
  locations: Location[];
  variants: { id: string; label: string }[];
}) {
  const storageKey = 'golden-rose:receipt:' + userId;
  const read = useCallback(() => {
    try { return sessionStorage.getItem(storageKey); } catch { return null; }
  }, [storageKey]);
  const stored = useSyncExternalStore(subscribe, read, noReceipt);
  const [memory, setMemory] = useState<StockReceipt | null>(null);
  const [result, setResult] = useState(INITIAL_RESULT);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const retry = memory ?? parseReceipt(stored);
  const activeLocations = locations.filter(location => location.active);

  function save(receipt: StockReceipt | null) {
    setMemory(receipt);
    try {
      if (receipt) sessionStorage.setItem(storageKey, JSON.stringify(receipt));
      else sessionStorage.removeItem(storageKey);
      window.dispatchEvent(new Event(RECEIPT_EVENT));
    } catch {
      // The current form still retains its retry details if storage is unavailable.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const existing = memory ?? parseReceipt(read());
    const receipt = existing ?? {
      variantId: String(data.get('variantId') ?? ''),
      locationId: String(data.get('locationId') ?? ''),
      quantity: Number(data.get('quantity')),
      referenceId: String(data.get('referenceId') ?? '').trim() || null,
      idempotencyKey: crypto.randomUUID(),
    };

    if (!isStockReceipt(receipt)) {
      setResult({ status: 'error', message: 'Enter a product, location and a whole quantity from 1 to 1,000,000.' });
      return;
    }

    inFlight.current = true;
    setPending(true);
    setResult(INITIAL_RESULT);
    save(receipt);
    try {
      const next = await receiveStock(receipt);
      if (next.status === 'success') {
        save(null);
        form.reset();
      } else if (!existing && !next.retry) {
        save(null);
      }
      setResult(next);
    } catch {
      setResult({ status: 'error', message: 'Could not confirm the receipt. Retry the same receipt to avoid receiving it twice.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function discard() {
    if (window.confirm('If the receipt already succeeded, discarding it will not undo the movement. Have you checked the balance?')) {
      save(null);
      setResult(INITIAL_RESULT);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending}>
      {retry ? (
        <div className="gr-live-note">
          <p><strong>Pending receipt</strong></p>
          <p>{variants.find(variant => variant.id === retry.variantId)?.label ?? retry.variantId} · {retry.quantity} units · {locations.find(location => location.id === retry.locationId)?.name ?? retry.locationId}</p>
          {retry.referenceId && <p>Reference {retry.referenceId}</p>}
          <p>Retry uses the original details and receipt key.</p>
        </div>
      ) : (
        <fieldset className="gr-live-fields" disabled={pending}>
          <label>Product variant<select name="variantId" required defaultValue="">
            <option value="" disabled>Select a variant</option>
            {variants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
          </select></label>
          <label>Location<select name="locationId" required defaultValue="">
            <option value="" disabled>Select a location</option>
            {activeLocations.map(location => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select></label>
          <label>Quantity<input name="quantity" type="number" min={1} max={1_000_000} step={1} required /></label>
          <label>Delivery reference (optional)<input name="referenceId" maxLength={128} /></label>
        </fieldset>
      )}
      {!retry && (!variants.length || !activeLocations.length) && <p>Add an active product variant and location before receiving stock.</p>}
      <div className="gr-live-buttons">
        <button type="submit" className="gr-live-primary" disabled={pending || (!retry && (!variants.length || !activeLocations.length))}>
          {pending ? 'Recording receipt…' : retry ? 'Retry same receipt' : 'Receive stock'}
        </button>
        {retry && !pending && <button type="button" className="gr-live-secondary" onClick={discard}>Discard pending receipt</button>}
      </div>
      {result.message && <p className="gr-live-result" data-status={result.status} role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
    </form>
  );
}
