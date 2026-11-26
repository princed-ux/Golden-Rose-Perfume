'use client';

import Link from 'next/link';

import {
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';

import {
  useState,
  type FormEvent,
} from 'react';

import {
  formatPrice,
  UUID,
  type CatalogVariant,
} from '@/src/lib/golden-rose/contracts';

import {
  MAX_QUANTITY,
  setBagQuantity,
} from '@/src/lib/customer/bag';

import {
  useShoppingBag,
} from '@/src/components/use-shopping-bag';

interface AddToBagProps {
  variants: CatalogVariant[];
  account?: boolean;
}

export function AddToBag({
  variants,
  account = false,
}: AddToBagProps) {
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const collectionHref = account
    ? '/account/shop'
    : '/shop';

  const bagHref = account
    ? '/account/shop?view=bag'
    : '/cart';

  const {
    ready,
    unavailable,
    deviceOnly,
    pending,
    error,
    retry,
    update,
    lines,
  } = useShoppingBag();

  const options = variants.filter(
    variant =>
      variant.currency === 'NGN' &&
      UUID.test(variant.id) &&
      Number.isSafeInteger(variant.priceMinor) &&
      variant.priceMinor >= 0,
  );

  const selectedVariant =
    options.find(variant => variant.id === selectedId) ??
    options[0];

  const selectedQuantity = selectedVariant
    ? lines.find(
        line => line.variantId === selectedVariant.id,
      )?.quantity ?? 0
    : 0;

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!ready || unavailable || pending) {
      return;
    }

    const form = new FormData(event.currentTarget);

    const id = String(form.get('variant') ?? '');

    const requestedQuantity =
      Number(form.get('quantity'));

    if (
      !options.some(variant => variant.id === id) ||
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1 ||
      requestedQuantity > MAX_QUANTITY
    ) {
      setNotice(
        'Choose a valid bottle size and quantity.',
      );

      return;
    }

    const existingQuantity = lines.find(
      line => line.variantId === id,
    )?.quantity ?? 0;

    if (
      existingQuantity + requestedQuantity >
      MAX_QUANTITY
    ) {
      setNotice(
        `Your bag already contains ${existingQuantity} of this selection. The maximum is ${MAX_QUANTITY} per variant.`,
      );

      return;
    }

    setNotice('');

    try {
      const changed = await update(
        current => {
          const previous = current.find(
            line => line.variantId === id,
          )?.quantity ?? 0;

          if (
            previous + requestedQuantity >
            MAX_QUANTITY
          ) {
            return current;
          }

          return setBagQuantity(
            current,
            id,
            previous + requestedQuantity,
          );
        },
        id,
      );

      setNotice(
        changed
          ? deviceOnly
            ? 'Added to the shopping bag on this device.'
            : 'Fragrance added to your shopping bag.'
          : 'Unable to add this selection. Check your bag and quantity.',
      );

    } catch {
      setNotice(
        'The fragrance could not be added. Please try again.',
      );
    }
  }

  if (!selectedVariant) {
    return (
      <div
        className="mt-6 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-5"
        role="status"
      >
        <h2 className="font-serif text-xl text-[var(--gr-theme-text)]">
          Ordering temporarily unavailable
        </h2>

        <p className="mt-2 text-sm leading-7 text-[var(--gr-theme-muted)]">
          This fragrance does not currently have a
          selectable NGN variant. You can still
          explore the collection.
        </p>

        <Link
          href={collectionHref}
          className="text-link mt-4"
        >
          Explore other perfumes

          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </div>
    );
  }

  return (
    <section
      className="mt-4 min-w-0 rounded-2xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-4 shadow-sm sm:p-6"
      aria-labelledby="gr-order-heading"
    >
      <div className="mb-5 border-b border-[var(--gr-theme-border)] pb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gr-theme-gold)]">
          YOUR SELECTION
        </p>

        <h2
          id="gr-order-heading"
          className="font-serif text-2xl font-normal text-[var(--gr-theme-text)]"
        >
          Choose your fragrance.
        </h2>

        <p className="mt-2 text-sm leading-6 text-[var(--gr-theme-muted)]">
          Select your preferred bottle size and
          quantity, then add it to your shopping bag.
        </p>
      </div>

      <form
        className="gr-bag-form min-w-0"
        onSubmit={submit}
        onChange={() => setNotice('')}
        aria-busy={pending}
      >
        <div className="grid w-full min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0">
            Bottle size / variant

            <select
              name="variant"
              aria-label="Choose fragrance variant"
              value={selectedVariant.id}
              onChange={event =>
                setSelectedId(event.target.value)
              }
              required
              className="w-full min-w-0"
            >
              {options.map(variant => (
                <option
                  key={variant.id}
                  value={variant.id}
                >
                  {variant.sizeMl
                    ? `${variant.sizeMl} ml`
                    : variant.sku ?? 'Standard'}

                  {' · '}

                  {formatPrice(variant.priceMinor)}

                  {variant.sizeMl && variant.sku
                    ? ` · ${variant.sku}`
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            Quantity

            <input
              name="quantity"
              type="number"
              inputMode="numeric"
              value={quantity}
              onChange={event =>
                setQuantity(Number(event.target.value))
              }
              min={1}
              max={MAX_QUANTITY}
              step={1}
              required
            />
          </label>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--gr-theme-bg)] px-4 py-3">
          <div>
            <p className="mb-1 text-[11px] text-[var(--gr-theme-muted)]">
              Selected bottle price
            </p>

            <strong className="font-serif text-2xl text-[var(--gr-theme-text)]">
              {formatPrice(
                selectedVariant.priceMinor,
                selectedVariant.currency,
              )}
            </strong>
          </div>

          <p className="mb-0 text-xs text-[var(--gr-theme-muted)]">
            {selectedQuantity > 0
              ? `${selectedQuantity} already in your bag`
              : 'Ready to add to bag'}
          </p>
        </div>

        <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="submit"
            className="gr-bag-primary min-h-12! rounded-lg! px-6!"
            disabled={
              !ready ||
              unavailable ||
              pending
            }
          >
            <ShoppingBag
              size={17}
              aria-hidden="true"
            />

            {pending
              ? 'Adding to bag…'
              : 'Add to shopping bag'}
          </button>

          <Link
            className="text-link min-h-11"
            href={bagHref}
          >
            View shopping bag

            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>

        {unavailable ? (
          <div
            className="grid gap-2 text-sm"
            role="alert"
          >
            <p>
              Your shopping bag could not be synced.
              Your existing selections have not
              been deliberately cleared.
            </p>

            <button
              type="button"
              className="text-link"
              onClick={retry}
            >
              Try again
            </button>
          </div>
        ) : (
          (error || notice) && (
            <p
              role={error ? 'alert' : 'status'}
              aria-live="polite"
              className="text-sm leading-6"
            >
              {error || notice}
            </p>
          )
        )}
      </form>

      <p className="mb-0 mt-5 border-t border-[var(--gr-theme-border)] pt-4 text-xs leading-6 text-[var(--gr-theme-muted)]">
        Checkout continues through WhatsApp.
        Golden Rose will confirm availability,
        delivery arrangements and payment details
        before completing your order.
      </p>
    </section>
  );
}