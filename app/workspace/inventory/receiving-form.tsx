
'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import {
  Barcode,
  ClipboardCheck,
  RotateCcw,
  Search,
} from 'lucide-react';

import {
  INITIAL_RESULT,
  isStockReceipt,
  type Location,
  type StockReceipt,
} from '@/src/lib/golden-rose/contracts';

import {
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import { receiveStock } from '../actions';

const RECEIPT_EVENT = 'golden-rose-pending-receipt';

type VariantOption = {
  id: string;
  label: string;
  sku?: string | null;
  barcode?: string | null;
};

function subscribe(listener: () => void) {
  window.addEventListener(RECEIPT_EVENT, listener);

  return () => {
    window.removeEventListener(RECEIPT_EVENT, listener);
  };
}

function noReceipt() {
  return null;
}

function parseReceipt(raw: string | null) {
  try {
    const value: unknown = raw
      ? JSON.parse(raw)
      : null;

    return isStockReceipt(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function ReceivingForm({
  userId,
  locations,
  variants,
}: {
  userId: string;
  locations: Location[];
  variants: VariantOption[];
}) {
  const storageKey =
    'golden-rose:receipt:' + userId;

  const read = useCallback(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);

  const stored = useSyncExternalStore(
    subscribe,
    read,
    noReceipt,
  );

  const [memory, setMemory] =
    useState<StockReceipt | null>(null);

  const [result, setResult] =
    useState(INITIAL_RESULT);

  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedVariant, setSelectedVariant] =
    useState('');

  const inFlight = useRef(false);

  const retry = memory ?? parseReceipt(stored);

  const activeLocations = locations.filter(
    location => location.active,
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const found = needle
      ? variants.filter(variant =>
          [
            variant.label,
            variant.sku ?? '',
            variant.barcode ?? '',
          ].some(value =>
            value.toLowerCase().includes(needle),
          ),
        )
      : variants;

    const first = found.slice(0, 80);

    if (
      selectedVariant &&
      !first.some(
        variant => variant.id === selectedVariant,
      )
    ) {
      const selected = variants.find(
        variant => variant.id === selectedVariant,
      );

      if (selected) {
        first.unshift(selected);
      }
    }

    return first;
  }, [search, selectedVariant, variants]);

  function save(receipt: StockReceipt | null) {
    setMemory(receipt);

    try {
      if (receipt) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify(receipt),
        );
      } else {
        sessionStorage.removeItem(storageKey);
      }

      window.dispatchEvent(
        new Event(RECEIPT_EVENT),
      );
    } catch {
      // The in-memory retry copy remains available.
    }
  }

  function matchScannedCode(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== 'Enter') return;

    // Scanners commonly finish by sending Enter.
    // Prevent Enter from prematurely submitting a receipt.
    event.preventDefault();

    const code = search.trim().toLowerCase();

    if (!code) return;

    const exact = variants.find(variant =>
      variant.barcode?.toLowerCase() === code ||
      variant.sku?.toLowerCase() === code,
    );

    if (exact) {
      setSelectedVariant(exact.id);
      setSearch(exact.barcode ?? exact.sku ?? code);
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (inFlight.current) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const existing =
      memory ?? parseReceipt(read());

    const receipt =
      existing ?? {
        variantId: String(
          data.get('variantId') ?? '',
        ),
        locationId: String(
          data.get('locationId') ?? '',
        ),
        quantity: Number(
          data.get('quantity'),
        ),
        referenceId:
          String(
            data.get('referenceId') ?? '',
          ).trim() || null,
        idempotencyKey: crypto.randomUUID(),
      };

    if (!isStockReceipt(receipt)) {
      setResult({
        status: 'error',
        message:
          'Choose a valid product, location and whole quantity between 1 and 1,000,000.',
      });
      return;
    }

    inFlight.current = true;
    setPending(true);
    setResult(INITIAL_RESULT);

    // Persist BEFORE the network request.
    // A retry must never generate a new receipt key.
    save(receipt);

    try {
      const next = await receiveStock(receipt);

      if (next.status === 'success') {
        save(null);
        form.reset();
        setSearch('');
        setSelectedVariant('');
      } else if (!existing && !next.retry) {
        save(null);
      }

      setResult(next);
    } catch {
      setResult({
        status: 'error',
        message:
          'The receipt could not be confirmed. Retry the same receipt to avoid duplicate stock.',
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function discard() {
    const confirmed = window.confirm(
      'The receipt may already have succeeded. Discarding the pending request will not reverse a recorded stock movement. Have you checked the stock balance?',
    );

    if (!confirmed) return;

    save(null);
    setResult(INITIAL_RESULT);
  }

  const canStart =
    variants.length > 0 &&
    activeLocations.length > 0;

  return (
    <form
      onSubmit={submit}
      aria-busy={pending}
      className="grid min-w-0 gap-5"
    >
      {retry ? (
        <div className="grid gap-3 rounded-xl border border-[#e9d2aa] bg-[#fff8e9] p-4">
          <div className="flex items-center gap-2 font-semibold text-[#704c26]">
            <RotateCcw
              size={18}
              aria-hidden="true"
            />
            Pending receipt
          </div>

          <p className="text-sm leading-6 text-[#725b48]">
            {variants.find(
              variant =>
                variant.id === retry.variantId,
            )?.label ?? retry.variantId}
            {' · '}
            {retry.quantity} units
            {' · '}
            {locations.find(
              location =>
                location.id === retry.locationId,
            )?.name ?? retry.locationId}
          </p>

          {retry.referenceId && (
            <p className="text-xs text-[#806852]">
              Reference: {retry.referenceId}
            </p>
          )}

          <p className="text-xs leading-5 text-[#806852]">
            The system retained the original transaction
            identifier. Retrying will use the same details
            rather than creating a new stock receipt.
          </p>
        </div>
      ) : (
        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-3">
            <label className={workspaceLabel}>
              Find product or scan barcode

              <span className="relative">
                <Search
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3.5 text-[#a57839]"
                />

                <input
                  className={workspaceInput + ' pl-10'}
                  type="search"
                  value={search}
                  onChange={event =>
                    setSearch(event.target.value)
                  }
                  onKeyDown={matchScannedCode}
                  placeholder="Type fragrance, SKU or scan barcode"
                  autoComplete="off"
                />
              </span>
            </label>

            <p className="text-xs leading-5 text-[#887480]">
              {matches.length} matching options displayed.
              For large catalogues, search to narrow
              the product list. A scanner configured
              to send Enter can select an exact
              SKU or barcode.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className={workspaceLabel}>
              Product variant

              <select
                className={workspaceInput}
                name="variantId"
                value={selectedVariant}
                onChange={event =>
                  setSelectedVariant(event.target.value)
                }
                required
              >
                <option value="" disabled>
                  Select a product variant
                </option>

                {matches.map(variant => (
                  <option
                    key={variant.id}
                    value={variant.id}
                  >
                    {variant.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={workspaceLabel}>
              Receiving location

              <select
                className={workspaceInput}
                name="locationId"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select destination
                </option>

                {activeLocations.map(location => (
                  <option
                    key={location.id}
                    value={location.id}
                  >
                    {location.name}
                    {' · '}
                    {location.code}
                  </option>
                ))}
              </select>
            </label>

            <label className={workspaceLabel}>
              Quantity received

              <input
                className={workspaceInput}
                name="quantity"
                type="number"
                min={1}
                max={1_000_000}
                step={1}
                required
                placeholder="Enter number of units"
              />
            </label>

            <label className={workspaceLabel}>
              Delivery reference (optional)

              <input
                className={workspaceInput}
                name="referenceId"
                maxLength={128}
                placeholder="Supplier invoice or delivery number"
              />
            </label>
          </div>
        </fieldset>
      )}

      {!retry && !canStart && (
        <div
          role="status"
          className="rounded-xl border border-[#e9d2aa] bg-[#fff8e9] p-4 text-sm leading-6 text-[#74542d]"
        >
          A product variant and active location
          are required before receiving stock.
          Create the physical store above if
          there is no location yet.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#eaded7] pt-4">
        <button
          type="submit"
          className={workspacePrimary}
          disabled={
            pending || (!retry && !canStart)
          }
        >
          <ClipboardCheck
            size={17}
            aria-hidden="true"
          />

          {pending
            ? 'Recording receipt…'
            : retry
              ? 'Retry same receipt'
              : 'Confirm stock receipt'}
        </button>

        {retry && !pending && (
          <button
            type="button"
            className={workspaceSecondary}
            onClick={discard}
          >
            Discard pending receipt
          </button>
        )}

        {!retry && (
          <span className="inline-flex items-center gap-2 text-xs text-[#887480]">
            <Barcode
              size={15}
              aria-hidden="true"
            />
            Barcode lookup supported
          </span>
        )}
      </div>

      {result.message && (
        <div
          role={
            result.status === 'error'
              ? 'alert'
              : 'status'
          }
          className={
            'rounded-xl border p-4 text-sm leading-6 ' +
            (result.status === 'error'
              ? 'border-[#e8c4ca] bg-[#fff1f3] text-[#8d324b]'
              : 'border-[#c9e3d0] bg-[#edf8ef] text-[#27643b]')
          }
        >
          {result.message}
        </div>
      )}
    </form>
  );
}
