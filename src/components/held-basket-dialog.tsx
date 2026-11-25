'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ArrowRight,
  Clock3,
  ClipboardList,
  Package,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';

import {
  MAX_HELD_BASKETS,
} from '../lib/golden-rose/held-baskets';

/* =========================================================
   GOLDEN ROSE PERFUME — HELD TRANSACTIONS
   ========================================================= */

export interface HeldBasketLine {
  id: string;
  name: string;
  sku?: string | null;
  sizeMl?: number | null;
  quantity: number;
  priceMinor: number;
}

export interface HeldBasketPreview {
  id: string;
  createdAt: string;
  location: string;
  discountMinor: number | null;
  lines: readonly HeldBasketLine[];
}

interface HeldBasketDialogProps {
  baskets: readonly HeldBasketPreview[];
  hasActiveBasket: boolean;
  disabled?: boolean;
  errorMessage?: string;
  close: () => void;
  recall: (id: string) => void;
  remove: (id: string) => void;
}

/* =========================================================
   FORMATTING AND TRANSACTION TOTALS
   ========================================================= */

const currency = new Intl.NumberFormat(
  'en-NG',
  {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
);

function money(
  minor: number,
): string {
  return currency.format(minor / 100);
}

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Unknown creation date';
  }

  return new Intl.DateTimeFormat(
    'en-NG',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    },
  ).format(date);
}

function shortReference(
  id: string,
): string {
  return 'HOLD-' +
    id.slice(0, 8).toUpperCase();
}

function basketTotals(
  basket: HeldBasketPreview,
) {
  const units = basket.lines.reduce(
    (sum, line) =>
      sum + line.quantity,
    0,
  );

  const subtotalMinor =
    basket.lines.reduce(
      (sum, line) =>
        sum +
        line.quantity *
          line.priceMinor,
      0,
    );

  const validSubtotal =
    Number.isSafeInteger(subtotalMinor) &&
    subtotalMinor >= 0;

  const validDiscount =
    typeof basket.discountMinor === 'number' &&
    Number.isSafeInteger(
      basket.discountMinor,
    ) &&
    basket.discountMinor >= 0 &&
    basket.discountMinor <= subtotalMinor;

  const totalMinor =
    validSubtotal && validDiscount
      ? subtotalMinor -
        basket.discountMinor!
      : null;

  return {
    units,
    subtotalMinor,
    validSubtotal,
    validDiscount,
    totalMinor,
  };
}

/* =========================================================
   HELD BASKET DIALOG
   ========================================================= */

export function HeldBasketDialog({
  baskets,
  hasActiveBasket,
  disabled = false,
  errorMessage,
  close,
  recall,
  remove,
}: HeldBasketDialogProps) {
  const titleId = useId();

  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const searchRef =
    useRef<HTMLInputElement>(null);

  const [search, setSearch] =
    useState('');

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  /* Newest held transactions first. */

  const ordered = useMemo(
    () =>
      [...baskets].sort(
        (left, right) =>
          Date.parse(right.createdAt) -
          Date.parse(left.createdAt),
      ),
    [baskets],
  );

  /* =======================================================
     SEARCH HELD TRANSACTIONS
     ======================================================= */

  const filtered = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return ordered;
    }

    return ordered.filter(basket => {
      const searchable = [
        basket.id,
        shortReference(basket.id),
        basket.location,
        formatDate(basket.createdAt),

        ...basket.lines.flatMap(
          line => [
            line.name,
            line.sku ?? '',
            String(line.sizeMl ?? ''),
          ],
        ),
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [
    ordered,
    search,
  ]);

  const selected =
    filtered.find(
      basket => basket.id === selectedId,
    ) ??
    filtered[0] ??
    null;

  const summary =
    selected
      ? basketTotals(selected)
      : null;

  /* =======================================================
     NATIVE MODAL AND FOCUS MANAGEMENT

     Prevent interaction with the underlying register
     while the cashier is selecting a held transaction.

     Restore focus and page scrolling when closed.
     ======================================================= */

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const previous =
      document.activeElement;

    const overflow =
      document.body.style.overflow;

    if (!dialog.open) {
      dialog.showModal();
    }

    document.body.style.overflow =
      'hidden';

    searchRef.current?.focus();

    return () => {
      if (dialog.open) {
        dialog.close();
      }

      document.body.style.overflow =
        overflow;

      if (
        previous instanceof HTMLElement &&
        previous.isConnected
      ) {
        previous.focus();
      }
    };
  }, []);

  /* =======================================================
     RECALL SELECTED TRANSACTION
     ======================================================= */

  function recallSelected() {
    if (
      disabled ||
      !selected
    ) {
      return;
    }

    recall(selected.id);
  }

  /* =======================================================
     REMOVE UNPAID TRANSACTION

     Removing a held basket is not a refund and does
     not create or reverse inventory movements.
     ======================================================= */

  function removeSelected() {
    if (
      disabled ||
      !selected
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${shortReference(selected.id)} from the held queue? This removes only the unpaid basket and does not refund a payment or change inventory.`,
    );

    if (!confirmed) {
      return;
    }

    remove(selected.id);

    setSelectedId(null);
  }

  /* =======================================================
     DIALOG INTERFACE
     ======================================================= */

  return (
    <dialog
      ref={dialogRef}
      className="gr-held-dialog"
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <style>
        {styles}
      </style>

      <div className="gr-held-shell">

        {/* MODAL HEADER */}

        <header className="gr-held-header">
          <div className="gr-held-heading">
            <span className="gr-held-heading-icon">
              <ClipboardList size={23} />
            </span>

            <div>
              <p className="gr-held-eyebrow">
                GOLDEN ROSE / REGISTER
              </p>

              <h2 id={titleId}>
                Recall held sales
              </h2>

              <p className="gr-held-subtitle">
                Select an unpaid customer basket
                to resume the transaction.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="gr-held-icon-button"
            aria-label="Close held sales"
            onClick={close}
          >
            <X size={21} />
          </button>
        </header>

        {/* QUEUE OVERVIEW */}

        <section className="gr-held-overview">
          <div>
            <span>
              Held transactions
            </span>

            <strong>
              {baskets.length}
            </strong>
          </div>

          <div>
            <span>
              Queue capacity
            </span>

            <strong>
              {baskets.length}
              {' / '}
              {MAX_HELD_BASKETS}
            </strong>
          </div>

          <div>
            <span>
              Current basket
            </span>

            <strong>
              {hasActiveBasket
                ? 'Active'
                : 'Empty'}
            </strong>
          </div>
        </section>

        {/* ACTIVE BASKET INFORMATION */}

        {hasActiveBasket && (
          <div
            className="gr-held-information"
            role="status"
          >
            <RotateCcw size={17} />

            <p>
              Recalling another transaction will hold
              your current basket automatically.
              Neither customer&apos;s basket will be
              intentionally overwritten.
            </p>
          </div>
        )}

        {/* ERROR FEEDBACK */}

        {errorMessage && (
          <div
            className="gr-held-error"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {/* TRANSACTION SEARCH */}

        <div className="gr-held-search">
          <Search size={19} />

          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Search reference, product, SKU or store"
            aria-label="Search held baskets"
            autoComplete="off"
            maxLength={120}
            onChange={event =>
              setSearch(event.target.value)
            }
          />

          {search && (
            <button
              type="button"
              className="gr-held-icon-button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* HELD TRANSACTION LIST AND PREVIEW */}

        <div className="gr-held-content">

          {/* HELD TRANSACTION LIST */}

          <section
            className="gr-held-list"
            aria-label="Held transactions"
          >
            <div className="gr-held-section-heading">
              <h3>
                Held baskets
              </h3>

              <span>
                {filtered.length} shown
              </span>
            </div>

            {filtered.length > 0 ? (
              filtered.map(basket => {
                const totals =
                  basketTotals(basket);

                const active =
                  basket.id === selected?.id;

                return (
                  <button
                    key={basket.id}
                    type="button"
                    aria-pressed={active}
                    className={
                      'gr-held-list-item' +
                      (
                        active
                          ? ' gr-held-list-item-active'
                          : ''
                      )
                    }
                    onClick={() =>
                      setSelectedId(basket.id)
                    }
                  >
                    <span className="gr-held-list-icon">
                      <ShoppingBag size={20} />
                    </span>

                    <span className="gr-held-list-main">
                      <strong>
                        {shortReference(basket.id)}
                      </strong>

                      <small>
                        {basket.location}
                      </small>

                      <small className="gr-held-list-date">
                        <Clock3 size={12} />

                        {formatDate(
                          basket.createdAt,
                        )}
                      </small>

                      <small>
                        {totals.units}
                        {' '}
                        {totals.units === 1
                          ? 'item'
                          : 'items'}
                      </small>
                    </span>

                    <strong className="gr-held-list-price">
                      {totals.totalMinor === null
                        ? 'Review'
                        : money(totals.totalMinor)}
                    </strong>
                  </button>
                );
              })
            ) : (
              <div className="gr-held-empty">
                <ShoppingBag size={33} />

                <h3>
                  {search
                    ? 'No matching baskets'
                    : 'No held baskets'}
                </h3>

                <p>
                  {search
                    ? 'Try a different product, store or reference.'
                    : 'Hold a current sale to serve another customer, then recall it here.'}
                </p>
              </div>
            )}
          </section>

          {/* SELECTED TRANSACTION PREVIEW */}

          <section
            className="gr-held-preview"
            aria-label="Selected basket details"
          >
            {selected && summary ? (
              <>
                <div className="gr-held-preview-heading">
                  <div>
                    <p className="gr-held-eyebrow">
                      TRANSACTION PREVIEW
                    </p>

                    <h3>
                      {shortReference(
                        selected.id,
                      )}
                    </h3>
                  </div>

                  <span className="gr-held-status">
                    Unpaid
                  </span>
                </div>

                {/* TRANSACTION METADATA */}

                <div className="gr-held-preview-meta">
                  <p>
                    <strong>
                      Location:
                    </strong>
                    {' '}
                    {selected.location}
                  </p>

                  <p>
                    <strong>
                      Held:
                    </strong>
                    {' '}
                    {formatDate(
                      selected.createdAt,
                    )}
                  </p>
                </div>

                {/* SELECTED PRODUCTS */}

                <div className="gr-held-product-lines">
                  {selected.lines.map(
                    (line, index) => (
                      <article
                        className="gr-held-product"
                        key={
                          line.id +
                          ':' +
                          index
                        }
                      >
                        <span className="gr-held-product-icon">
                          <Package size={20} />
                        </span>

                        <div className="gr-held-product-description">
                          <strong>
                            {line.name}
                          </strong>

                          <small>
                            {[
                              line.sku,

                              line.sizeMl
                                ? line.sizeMl + ' ml'
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') ||
                              'Fragrance'}
                          </small>

                          <small>
                            {line.quantity}
                            {' × '}
                            {money(
                              line.priceMinor,
                            )}
                          </small>
                        </div>

                        <strong>
                          {money(
                            line.quantity *
                              line.priceMinor,
                          )}
                        </strong>
                      </article>
                    ),
                  )}
                </div>

                {/* TRANSACTION TOTALS */}

                <dl className="gr-held-totals">
                  <div>
                    <dt>
                      Total units
                    </dt>

                    <dd>
                      {summary.units}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Subtotal
                    </dt>

                    <dd>
                      {summary.validSubtotal
                        ? money(
                            summary.subtotalMinor,
                          )
                        : 'Review required'}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Discount
                    </dt>

                    <dd>
                      {summary.validDiscount
                        ? '−' +
                          money(
                            selected.discountMinor!,
                          )
                        : 'Review required'}
                    </dd>
                  </div>

                  <div className="gr-held-total">
                    <dt>
                      Held sale total
                    </dt>

                    <dd>
                      {summary.totalMinor === null
                        ? 'Review required'
                        : money(
                            summary.totalMinor,
                          )}
                    </dd>
                  </div>
                </dl>

                <p className="gr-held-stock-note">
                  Stock is not reserved while a sale
                  is held. Current prices and stock
                  availability must be checked before
                  completing payment.
                </p>
              </>
            ) : (
              <div className="gr-held-empty">
                <ClipboardList size={34} />

                <h3>
                  Transaction preview
                </h3>

                <p>
                  Select a held basket to review
                  the products and transaction total.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* MODAL ACTIONS */}

        <footer className="gr-held-footer">
          <button
            type="button"
            className="gr-held-secondary"
            onClick={close}
          >
            Close
          </button>

          <div className="gr-held-footer-actions">
            <button
              type="button"
              className="gr-held-remove"
              disabled={
                disabled ||
                !selected
              }
              onClick={removeSelected}
            >
              <Trash2 size={16} />

              Remove
            </button>

            <button
              type="button"
              className="gr-held-primary"
              disabled={
                disabled ||
                !selected
              }
              onClick={recallSelected}
            >
              <RotateCcw size={16} />

              {hasActiveBasket
                ? 'Switch to this sale'
                : 'Recall sale'}

              <ArrowRight size={17} />
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

/* =========================================================
   SHARED WEB AND DESKTOP DIALOG STYLES
   ========================================================= */

const styles = `
.gr-held-dialog {
  --held-bg: #fffdfa;
  --held-panel: #ffffff;
  --held-text: #432538;
  --held-muted: #806d78;
  --held-border: #e9dcd7;
  --held-soft: #f9f1e7;
  --held-accent: #73324b;
  --held-gold: #a77b41;

  box-sizing: border-box;
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(960px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 0;
  border: 1px solid var(--held-border);
  border-radius: 20px;
  color: var(--held-text);
  background: var(--held-bg);
  box-shadow: 0 24px 90px rgba(41, 13, 29, .24);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
}

.gr-held-dialog::backdrop {
  background: rgba(29, 14, 23, .58);
  backdrop-filter: blur(5px);
}

.gr-held-dialog *,
.gr-held-dialog *::before,
.gr-held-dialog *::after {
  box-sizing: border-box;
}

.gr-held-dialog button,
.gr-held-dialog input {
  font: inherit;
}

.gr-held-dialog p,
.gr-held-dialog h2,
.gr-held-dialog h3,
.gr-held-dialog dl,
.gr-held-dialog dd {
  margin: 0;
}

.gr-held-dialog button {
  cursor: pointer;
}

.gr-held-dialog button:disabled {
  opacity: .48;
  cursor: not-allowed;
}

.gr-held-dialog button:focus-visible,
.gr-held-dialog input:focus-visible {
  outline: 2px solid var(--held-gold);
  outline-offset: 3px;
}

/* DIALOG STRUCTURE */

.gr-held-shell {
  display: grid;
  gap: 16px;
  padding: 24px;
}

.gr-held-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 0;
  margin: 0;
  border: 0;
}

.gr-held-heading {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  min-width: 0;
}

.gr-held-heading-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 13px;
  background: var(--held-soft);
  color: var(--held-gold);
}

.gr-held-eyebrow {
  color: var(--held-gold);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .12em;
}

.gr-held-heading h2 {
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 650;
  line-height: 1.2;
  color: var(--held-text);
  margin-top: 4px;
}

.gr-held-subtitle {
  color: var(--held-muted);
  margin-top: 6px !important;
  font-size: 13px;
}

.gr-held-icon-button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid var(--held-border);
  border-radius: 9px;
  background: var(--held-panel);
  color: var(--held-text);
}

/* QUEUE OVERVIEW */

.gr-held-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.gr-held-overview > div {
  display: grid;
  gap: 4px;
  padding: 13px;
  min-width: 0;
  border: 1px solid var(--held-border);
  border-radius: 12px;
  background: var(--held-panel);
}

.gr-held-overview span {
  font-size: 12px;
  color: var(--held-muted);
}

.gr-held-overview strong {
  font-size: 19px;
  color: var(--held-text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* INFORMATION AND ERRORS */

.gr-held-information,
.gr-held-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--held-border);
  border-radius: 11px;
  padding: 12px;
  background: var(--held-soft);
  font-size: 13px;
}

.gr-held-information svg {
  flex-shrink: 0;
  color: var(--held-gold);
  margin-top: 2px;
}

.gr-held-error {
  border-color: #b94c64;
  color: #a32f48;
  background: #fff1f3;
}

/* SEARCH */

.gr-held-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  border: 1px solid var(--held-border);
  border-radius: 12px;
  background: var(--held-panel);
  padding: 5px 12px;
}

.gr-held-search > svg {
  flex-shrink: 0;
  color: var(--held-gold);
}

.gr-held-search input {
  width: 100%;
  min-width: 0;
  padding: 8px 0;
  outline: none;
  border: 0;
  background: transparent;
  color: var(--held-text);
}

.gr-held-search input::placeholder {
  color: var(--held-muted);
}

/* TWO-COLUMN TRANSACTION WORKSPACE */

.gr-held-content {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1.15fr);
  gap: 14px;
  align-items: stretch;
}

.gr-held-list,
.gr-held-preview {
  min-width: 0;
  border: 1px solid var(--held-border);
  border-radius: 13px;
  padding: 14px;
  background: var(--held-panel);
}

.gr-held-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 440px;
  overflow: auto;
}

.gr-held-section-heading,
.gr-held-preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gr-held-section-heading h3 {
  font-size: 15px;
  font-weight: 700;
}

.gr-held-section-heading span {
  color: var(--held-muted);
  font-size: 11px;
}

/* HELD TRANSACTION CARDS */

.gr-held-list-item {
  display: flex;
  align-items: flex-start;
  text-align: left;
  gap: 10px;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--held-border);
  border-radius: 11px;
  padding: 11px;
  background: var(--held-panel);
  color: var(--held-text);
  transition:
    border-color .15s,
    background .15s;
}

.gr-held-list-item:hover,
.gr-held-list-item-active {
  border-color: var(--held-gold);
  background: var(--held-soft);
}

.gr-held-list-icon,
.gr-held-product-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 37px;
  height: 37px;
  border-radius: 9px;
  background: var(--held-soft);
  color: var(--held-gold);
}

.gr-held-list-main,
.gr-held-product-description {
  flex: 1;
  display: grid;
  gap: 4px;
  min-width: 0;
}

.gr-held-list-main strong,
.gr-held-product-description strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.gr-held-list-main small,
.gr-held-product-description small {
  font-size: 11px;
  color: var(--held-muted);
  overflow-wrap: anywhere;
}

.gr-held-list-date {
  display: flex;
  align-items: center;
  gap: 5px;
}

.gr-held-list-price {
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* TRANSACTION PREVIEW */

.gr-held-preview {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.gr-held-preview-heading h3 {
  font-size: 18px;
  margin-top: 3px;
}

.gr-held-status {
  color: #8b6329;
  border: 1px solid #dac49f;
  background: #fff5df;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 650;
}

.gr-held-preview-meta {
  display: grid;
  gap: 3px;
  color: var(--held-muted);
  font-size: 12px;
}

/* PRODUCT PREVIEW */

.gr-held-product-lines {
  display: grid;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
}

.gr-held-product {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--held-border);
}

.gr-held-product > strong {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  text-align: right;
}

/* TOTALS */

.gr-held-totals {
  display: grid;
  gap: 9px;
  margin-top: auto !important;
  padding: 13px;
  background: var(--held-soft);
  border: 1px solid var(--held-border);
  border-radius: 11px;
}

.gr-held-totals > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.gr-held-totals dt {
  color: var(--held-muted);
}

.gr-held-totals dd {
  font-weight: 650;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.gr-held-totals .gr-held-total {
  border-top: 1px solid var(--held-border);
  padding-top: 11px;
  font-size: 16px;
  font-weight: 700;
}

.gr-held-total dt {
  color: var(--held-text);
}

.gr-held-stock-note {
  font-size: 11px;
  color: var(--held-muted);
}

/* EMPTY STATES */

.gr-held-empty {
  display: grid;
  justify-items: center;
  align-content: center;
  text-align: center;
  gap: 10px;
  min-height: 220px;
  padding: 20px;
  color: var(--held-muted);
}

.gr-held-empty svg {
  color: var(--held-gold);
}

.gr-held-empty h3 {
  color: var(--held-text);
  font-size: 16px;
}

.gr-held-empty p {
  font-size: 13px;
  max-width: 250px;
}

/* FOOTER ACTIONS */

.gr-held-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  border-top: 1px solid var(--held-border);
  padding-top: 15px;
}

.gr-held-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gr-held-secondary,
.gr-held-remove,
.gr-held-primary {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 15px;
  border: 1px solid var(--held-border);
  border-radius: 10px;
  color: var(--held-text);
  background: var(--held-panel);
  font-weight: 650 !important;
}

.gr-held-remove {
  color: #a33c54;
}

.gr-held-primary {
  color: #ffffff;
  border-color: var(--held-accent);
  background: var(--held-accent);
}

/* EXPLICIT DARK THEME */

.gr-theme-root[data-theme="dark"] .gr-held-dialog {
  --held-bg: #211820;
  --held-panel: #2d222b;
  --held-text: #f2e5ec;
  --held-muted: #c7b3be;
  --held-border: #503c49;
  --held-soft: #392b34;
  --held-accent: #98526f;
  --held-gold: #dfb978;
}

/* SYSTEM DARK THEME */

@media (prefers-color-scheme: dark) {
  .gr-theme-root[data-theme="system"] .gr-held-dialog {
    --held-bg: #211820;
    --held-panel: #2d222b;
    --held-text: #f2e5ec;
    --held-muted: #c7b3be;
    --held-border: #503c49;
    --held-soft: #392b34;
    --held-accent: #98526f;
    --held-gold: #dfb978;
  }
}

/* RESPONSIVE MOBILE AND TABLET LAYOUT */

@media (max-width: 720px) {
  .gr-held-dialog {
    width: calc(100vw - 20px);
    max-width: calc(100vw - 20px);
    max-height: calc(100dvh - 20px);
    border-radius: 15px;
  }

  .gr-held-shell {
    padding: 15px;
    gap: 12px;
  }

  .gr-held-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .gr-held-list {
    max-height: 270px;
  }

  .gr-held-overview > div {
    padding: 10px;
  }

  .gr-held-overview strong {
    font-size: 15px;
  }

  .gr-held-overview span {
    font-size: 10px;
  }

  .gr-held-heading-icon {
    width: 36px;
    height: 36px;
  }

  .gr-held-footer-actions {
    flex: 1;
    justify-content: flex-end;
  }
}

/* REDUCED-MOTION ACCESSIBILITY */

@media (prefers-reduced-motion: reduce) {
  .gr-held-dialog * {
    transition: none !important;
    animation: none !important;
  }
}
`;