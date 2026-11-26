'use client';

import { ActionButton } from '@/src/components/action-feedback';
import Link from 'next/link';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  MessageCircle,
  ShoppingBag,
} from 'lucide-react';

import {
  formatPrice,
  type CatalogProduct,
} from '@/src/lib/golden-rose/contracts';

import {
  MAX_BAG_LINES,
  MAX_QUANTITY,
  resolveBag,
  setBagQuantity,
  type BagLine,
} from '@/src/lib/customer/bag';

import { useShoppingBag } from './use-shopping-bag';
import { prepareCheckout } from '@/app/checkout/actions';
import { loadBagProducts } from '@/app/account/shopping-actions';

interface CustomerProfile {
  name: string;
  email: string | null;
}

interface CheckoutFormProps {
  lines: BagLine[];
  profile: CustomerProfile | null;
  configured: boolean;
  contactUnavailable: boolean;
  disabled: boolean;
}

/* =========================================================
   WHATSAPP CHECKOUT
   ========================================================= */

function CheckoutForm({
  lines,
  profile,
  configured,
  contactUnavailable,
  disabled,
}: CheckoutFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const requestRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const [prepared, setPrepared] = useState<{
    href: string;
    totalMinor: number;
    reference: string;
    snapshot: string;
  } | null>(null);

  const snapshot = JSON.stringify(lines);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (pending || disabled || !configured) {
      return;
    }

    const data = new FormData(event.currentTarget);

    data.set('bag', snapshot);

    const fingerprint =
      JSON.stringify([...data.entries()]);

    if (
      !requestRef.current ||
      requestRef.current.fingerprint !== fingerprint
    ) {
      requestRef.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };
    }

    data.set(
      'requestKey',
      requestRef.current.key,
    );

    setPending(true);
    setPrepared(null);
    setError('');

    try {
      const result = await prepareCheckout(data);

      if (
        'href' in result &&
        result.href &&
        'reference' in result &&
        result.reference
      ) {
        setPrepared({
          href: result.href,
          totalMinor: result.totalMinor,
          reference: result.reference,
          snapshot,
        });

      } else {
        setError(
          result.error ??
          'The message could not be prepared.',
        );
      }

    } catch {
      setError(
        'The message could not be prepared. Try again.',
      );

    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="gr-bag-panel min-w-0"
      aria-labelledby="whatsapp-heading"
    >
      <h2 id="whatsapp-heading">
        Checkout on WhatsApp
      </h2>

      <p>
        Prepare a trackable enquiry, then send it on
        WhatsApp. Golden Rose confirms availability,
        final prices and delivery in chat.
      </p>

      {contactUnavailable ? (
        <p role="alert">
          WhatsApp checkout is temporarily unavailable.
          Your shopping bag is safe. Please try again.
        </p>
      ) : (
        !configured && (
          <p role="status">
            The store has not configured an active
            WhatsApp checkout contact yet.
          </p>
        )
      )}

      <form
        className="gr-bag-form min-w-0"
        onSubmit={submit}
        onChange={() => {
          setPrepared(null);
          setError('');
        }}
        aria-busy={pending}
      >
        <fieldset
          disabled={
            pending ||
            disabled ||
            !configured
          }
          className="gr-bag-form min-w-0"
        >
          <label>
            Name

            <input
              name="name"
              autoComplete="name"
              defaultValue={profile?.name}
              required
              maxLength={120}
            />
          </label>

          <label>
            Phone number

            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              maxLength={30}
            />
          </label>

          <label>
            Email (optional)

            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={profile?.email ?? ''}
              maxLength={254}
            />
          </label>

          <label>
            Delivery details (optional)

            <textarea
              name="delivery"
              rows={3}
              maxLength={240}
            />
          </label>

          <ActionButton
            pending={pending}
            pendingLabel="Preparing…"
            type="submit"
            className="gr-bag-primary"
          >
            {pending
              ? 'Checking prices…'
              : 'Prepare WhatsApp message'}
          </ActionButton>
        </fieldset>
      </form>

      {error && (
        <p role="alert">{error}</p>
      )}

      {!disabled &&
        prepared?.snapshot === snapshot && (
          <div className="gr-bag-prepared min-w-0">
            <p role="status">
              Enquiry{' '}

              <strong>
                {prepared.reference}
              </strong>

              {' '}saved.

              Current estimated item total{' '}

              <strong>
                {formatPrice(prepared.totalMinor)}
              </strong>
            </p>

            <a
              className="gr-bag-primary"
              href={prepared.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle
                size={17}
                aria-hidden="true"
              />

              Open WhatsApp
            </a>

            <p>
              Your enquiry is saved as a draft request,
              not a paid order. Review and send the
              message in WhatsApp; opening the chat alone
              does not notify the boutique or reserve stock.
            </p>

            {profile && (
              <Link
                href="/account/orders"
                className="text-link"
              >
                View my order enquiries
              </Link>
            )}
          </div>
        )}
    </section>
  );
}

/* =========================================================
   SHARED SHOPPING BAG
   ========================================================= */

export interface ShoppingBagScreenProps {
  checkout?: boolean;
  configured?: boolean;
  contactUnavailable?: boolean;
  profile?: CustomerProfile | null;

  /*
   * Keep navigation inside the customer account
   * without changing the bag's storage or data model.
   */

  account?: boolean;
}

export function ShoppingBagScreen({
  checkout = false,
  configured = false,
  contactUnavailable = false,
  profile = null,
  account = false,
}: ShoppingBagScreenProps) {
  const collectionHref = account
    ? '/account/shop'
    : '/shop';

  const bagHref = account
    ? '/account/shop?view=bag'
    : '/cart';

  const checkoutHref = account
    ? '/account/shop?view=checkout'
    : '/checkout';

  const productHref = (slug: string) =>
    account
      ? `/account/shop?product=${encodeURIComponent(slug)}`
      : `/shop/${encodeURIComponent(slug)}`;

  const {
    ready,
    lines,
    unavailable: syncUnavailable,
    deviceOnly,
    pending,
    update,
    error,
    retry,
  } = useShoppingBag();

  const snapshot =
    ready &&
    !syncUnavailable &&
    lines.length
      ? JSON.stringify(lines)
      : '';

  const [request, setRequest] = useState(0);

  const key = snapshot + ':' + request;

  const [catalogue, setCatalogue] = useState<{
    key: string;
    products: CatalogProduct[] | null;
  }>();

  /* LOAD CURRENT PRICES FROM THE EXISTING SERVICE */

  useEffect(() => {
    if (!snapshot) return;

    let current = true;

    const finish = (
      products: CatalogProduct[] | null,
    ) => {
      if (current) {
        setCatalogue({
          key,
          products,
        });
      }
    };

    loadBagProducts(snapshot).then(
      finish,
      () => finish(null),
    );

    return () => {
      current = false;
    };
  }, [key, snapshot]);

  const products =
    catalogue?.key === key
      ? catalogue.products
      : undefined;

  const resolved = products
    ? resolveBag(lines, products)
    : null;

  const changeQuantity = (
    id: string,
    quantity: number,
  ) =>
    update(
      current =>
        setBagQuantity(current, id, quantity),
      id,
    );

  /* LOADING */

  if (!ready) {
    return (
      <p
        className="gr-bag-panel"
        role="status"
      >
        Loading your shopping bag…
      </p>
    );
  }

  /* SYNCHRONIZATION FAILURE */

  if (syncUnavailable) {
    return (
      <section
        className="gr-bag-panel"
        role="status"
      >
        <p>
          Your shopping bag could not be synced.
          Items saved on this device will be kept.
        </p>

        <ActionButton
          type="button"
          className="gr-bag-primary"
          onClick={retry}
        >
          Try again
        </ActionButton>
      </section>
    );
  }

  /* EMPTY BAG */

  if (!lines.length) {
    return (
      <section className="gr-bag-panel gr-bag-empty">
        <ShoppingBag
          size={28}
          aria-hidden="true"
        />

        <h2>Your bag is empty.</h2>

        {deviceOnly && (
          <p role="status">
            Your bag is saved on this device.
            Account sync is temporarily unavailable.
          </p>
        )}

        <Link
          href={collectionHref}
          className="gr-bag-primary"
        >
          Explore fragrances
        </Link>
      </section>
    );
  }

  /* PRICE VERIFICATION */

  if (products === undefined) {
    return (
      <p
        className="gr-bag-panel"
        role="status"
      >
        Checking current prices…
      </p>
    );
  }

  if (!resolved) {
    return (
      <section
        className="gr-bag-panel"
        role="alert"
      >
        <p>
          Product prices are temporarily unavailable.
          Your bag is saved.
        </p>

        <ActionButton
          type="button"
          className="gr-bag-primary"
          onClick={() =>
            setRequest(value => value + 1)
          }
        >
          Try again
        </ActionButton>
      </section>
    );
  }

  const {
    items,
    unavailable,
    totalMinor,
  } = resolved;

  const canCheckout =
    items.length > 0 &&
    lines.length <= MAX_BAG_LINES &&
    unavailable.length === 0 &&
    totalMinor !== null;

  /* SHOPPING BAG CONTENT */

  return (
    <div className="gr-bag-grid min-w-0">
      <section
        className="gr-bag-panel min-w-0"
        aria-labelledby="bag-items"
        aria-busy={pending}
      >
        <h2 id="bag-items">
          Selected fragrances
        </h2>

        {deviceOnly && (
          <p role="status">
            Your bag is saved on this device.
            Account sync is temporarily unavailable.
          </p>
        )}

        {error && (
          <p role="alert">{error}</p>
        )}

        {items.map(item => (
          <article
            className="gr-bag-item min-w-0"
            key={item.variantId}
          >
            <div className="min-w-0">
              <Link
                href={productHref(item.slug)}
                className="gr-bag-item-name break-words"
              >
                {item.name}
              </Link>

              <p className="break-words">
                {[
                  item.sizeMl
                    ? item.sizeMl + ' ml'
                    : '',
                  item.sku,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <p>
                {formatPrice(item.priceMinor)} each
              </p>
            </div>

            <div className="min-w-0">
              <p>
                {formatPrice(
                  item.priceMinor * item.quantity,
                )}
              </p>

              {checkout ? (
                <p>
                  Quantity {item.quantity}
                </p>
              ) : (
                <div className="gr-bag-quantity flex-wrap!">
                  <ActionButton
                    type="button"
                    disabled={
                      pending ||
                      item.quantity <= 1
                    }
                    onClick={() =>
                      changeQuantity(
                        item.variantId,
                        item.quantity - 1,
                      )
                    }
                    aria-label={
                      'Decrease quantity of ' +
                      item.name
                    }
                  >
                    −
                  </ActionButton>

                  <span aria-label="Quantity">
                    {item.quantity}
                  </span>

                  <ActionButton
                    type="button"
                    disabled={
                      pending ||
                      item.quantity >= MAX_QUANTITY
                    }
                    onClick={() =>
                      changeQuantity(
                        item.variantId,
                        item.quantity + 1,
                      )
                    }
                    aria-label={
                      'Increase quantity of ' +
                      item.name
                    }
                  >
                    +
                  </ActionButton>

                  <ActionButton
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      changeQuantity(
                        item.variantId,
                        0,
                      )
                    }
                    aria-label={
                      'Remove ' + item.name
                    }
                  >
                    Remove
                  </ActionButton>
                </div>
              )}
            </div>
          </article>
        ))}

        {/* UNAVAILABLE SELECTIONS */}

        {unavailable.map((item, index) => (
          <div
            className="gr-bag-item min-w-0"
            key={item.variantId}
          >
            <p>
              Unavailable selection {index + 1}
              {' · '}
              Quantity {item.quantity}
            </p>

            {!checkout && (
              <ActionButton
                type="button"
                disabled={pending}
                onClick={() =>
                  changeQuantity(
                    item.variantId,
                    0,
                  )
                }
                aria-label={
                  'Remove unavailable selection ' +
                  (index + 1)
                }
              >
                Remove
              </ActionButton>
            )}
          </div>
        ))}

        {/* CURRENT VERIFIED ESTIMATED TOTAL */}

        <p className="gr-bag-total flex-wrap!">
          <span>
            Estimated item total
          </span>

          <strong>
            {totalMinor !== null
              ? formatPrice(totalMinor)
              : 'Unavailable'}
          </strong>
        </p>

        {unavailable.length > 0 && (
          <p role="status">
            Remove unavailable items from your
            bag to continue.
          </p>
        )}

        {lines.length > MAX_BAG_LINES && (
          <p role="status">
            Reduce your bag to {MAX_BAG_LINES}
            {' '}fragrances to continue.
          </p>
        )}

        {/* ACCOUNT-AWARE CHECKOUT LINKS */}

        {checkout ? (
          <Link
            href={bagHref}
            className="text-link"
          >
            Edit shopping bag
          </Link>
        ) : (
          canCheckout && (
            <Link
              href={checkoutHref}
              className="gr-bag-primary"
            >
              Continue to WhatsApp checkout
            </Link>
          )
        )}
      </section>

      {/* CHECKOUT FORM */}

      {checkout && (
        <CheckoutForm
          lines={lines}
          profile={profile}
          configured={configured}
          contactUnavailable={contactUnavailable}
          disabled={!canCheckout}
        />
      )}
    </div>
  );
}