'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';

import './pos-checkout-modal.css';

import {
  NonCashPaymentPanel,
} from '@/src/components/pos-noncash-payment';

import {
  CASH_DENOMINATIONS,
  addCashDenomination,
  buildSalePayment,
  paymentMethodLabel,
  validReceivingAccount,
  type SalePayment,
} from '@/src/lib/golden-rose/pos-payments';

import type {
  CashSaleRequest,
} from './types';

/* =========================================================
   CHECKOUT CONTRACTS
   ========================================================= */

export type PosCheckoutLine = {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPriceMinor: number;
};

export type PosReceivingAccount = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

type Step =
  | 'review'
  | 'cash'
  | 'bank'
  | 'card'
  | 'split';

export type PosCheckoutModalProps = {
  open: boolean;
  lines: readonly PosCheckoutLine[];
  customerName?: string;
  subtotalMinor: number;
  discountMinor: number;
  discountNaira: string;
  discountLimitPercent: number;
  validDiscount: boolean;
  onDiscountChange: (value: string) => void;
  totalMinor: number;
  taxMinor?: number | null;
  cashNaira: string;
  cashMinor: number | null;
  onCashChange: (value: string) => void;
  pendingReference?: string | null;
  pendingPayment?: CashSaleRequest | null;
  paymentVersion?: number;
  receivingAccount?: PosReceivingAccount | null;
  busy: boolean;
  onClose: () => void;
  onConfirmCash: (
    payment?: SalePayment,
  ) => Promise<boolean>;
};

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

/* =========================================================
   CHECKOUT SESSION LIFECYCLE

   The interactive session exists only while checkout is open.

   Closing the dialog unmounts its internal state, ensuring that
   the next customer starts with a fresh payment method and name.

   No synchronous state-reset effect is required.
   ========================================================= */

export function PosCheckoutModal(
  props: PosCheckoutModalProps,
) {
  if (!props.open) {
    return null;
  }

  return (
    <CheckoutSession {...props} />
  );
}

/* =========================================================
   ACTIVE CHECKOUT SESSION
   ========================================================= */

function CheckoutSession({
  lines,
  customerName = '',
  subtotalMinor,
  discountMinor,
  discountNaira,
  discountLimitPercent,
  validDiscount,
  onDiscountChange,
  totalMinor,
  taxMinor = null,
  cashNaira,
  cashMinor,
  onCashChange,
  pendingReference,
  pendingPayment,
  paymentVersion,
  receivingAccount,
  busy,
  onClose,
  onConfirmCash,
}: PosCheckoutModalProps) {
  const [selectedStep, setSelectedStep] =
    useState<Step>('review');

  const [feedback, setFeedback] =
    useState('');

  const [buyerName, setBuyerName] =
    useState(customerName);

  const updatedPayments =
    paymentVersion === 2;

  const bankAvailable =
    updatedPayments &&
    validReceivingAccount(receivingAccount);

  const panelRef =
    useRef<HTMLElement>(null);

  const openerRef =
    useRef<Element | null>(null);

  const recovery =
    Boolean(pendingReference);

  /*
   * An interrupted payment takes priority over the
   * locally selected payment step.
   *
   * Recovery does not need an effect to change state.
   */

  const step: Step =
    recovery
      ? 'cash'
      : selectedStep;

  const totalItems = lines.reduce(
    (sum, line) =>
      sum + line.quantity,
    0,
  );

  const cashCanPay =
    cashMinor !== null &&
    cashMinor >= totalMinor;

  const changeMinor =
    cashMinor === null
      ? null
      : Math.max(
          0,
          cashMinor - totalMinor,
        );

  const outstandingMinor =
    Math.max(
      0,
      totalMinor - (cashMinor ?? 0),
    );

  const validTotal =
    validDiscount &&
    Number.isSafeInteger(totalMinor) &&
    totalMinor > 0;

  const canSubmit =
    !busy &&
    (
      recovery ||
      (
        validTotal &&
        cashCanPay
      )
    );

  const savedTotalMinor =
    pendingPayment
      ? pendingPayment.items.reduce(
          (sum, item) =>
            sum +
            item.quantity *
              item.expectedPriceMinor,
          0,
        ) - pendingPayment.discountMinor
      : null;

  /* =======================================================
     MODAL SCROLL AND FOCUS MANAGEMENT

     These effects synchronize with browser APIs only.
     They do not synchronously reset React state.
     ======================================================= */

  useEffect(() => {
    openerRef.current =
      document.activeElement;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;

      const opener =
        openerRef.current;

      if (
        opener instanceof HTMLElement &&
        opener.isConnected
      ) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    const frame =
      requestAnimationFrame(() => {
        const first =
          panelRef.current?.querySelector<HTMLElement>(
            step === 'cash' && !recovery
              ? '.gr-checkout-cash-input'
              : 'button:not(:disabled), input:not(:disabled)',
          );

        (
          first ??
          panelRef.current
        )?.focus();
      });

    return () =>
      cancelAnimationFrame(frame);

  }, [
    step,
    recovery,
  ]);

  /* =======================================================
     ACCESSIBLE KEYBOARD NAVIGATION
     ======================================================= */

  useEffect(() => {
    function onKey(
      event: globalThis.KeyboardEvent,
    ) {
      if (
        event.key === 'Escape' &&
        !busy
      ) {
        event.preventDefault();
        onClose();
      }

      if (event.key !== 'Tab') {
        return;
      }

      const controls = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        node =>
          node.getClientRects().length > 0,
      );

      const first =
        controls[0];

      const last =
        controls[controls.length - 1];

      if (!first || !last) {
        event.preventDefault();

        panelRef.current?.focus();

      } else if (
        !panelRef.current?.contains(
          document.activeElement,
        )
      ) {
        event.preventDefault();

        (
          event.shiftKey
            ? last
            : first
        ).focus();

      } else if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();

        last.focus();

      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();

        first.focus();
      }
    }

    document.addEventListener(
      'keydown',
      onKey,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };

  }, [
    busy,
    onClose,
  ]);

  /* =======================================================
     CHECKOUT STEP NAVIGATION
     ======================================================= */

  function goTo(
    next: Step,
  ) {
    if (busy || recovery) {
      return;
    }

    if (
      next !== 'review' &&
      !validTotal
    ) {
      return;
    }

    if (
      next === 'bank' &&
      !bankAvailable
    ) {
      return;
    }

    if (
      (
        next === 'card' ||
        next === 'split'
      ) &&
      !updatedPayments
    ) {
      return;
    }

    setFeedback('');

    setSelectedStep(next);
  }

  /* =======================================================
     CASH PAYMENT CONFIRMATION
     ======================================================= */

  async function confirmCash(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setFeedback('');

    try {
      const payment = recovery
        ? undefined
        : buildSalePayment(
            totalMinor,
            {
              cashMinor: cashMinor ?? 0,
              transferMinor: 0,
              cardMinor: 0,
            },
            updatedPayments
              ? buyerName
              : '',
            false,
            null,
          );

      const confirmed =
        await onConfirmCash(payment);

      if (confirmed) {
        onClose();

      } else {
        setFeedback(
          'The transaction is not confirmed. Check the register message. If the request may have reached the server, retry the same transaction reference.',
        );
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Could not confirm the sale. Retry safely.',
      );
    }
  }

  /* =======================================================
     CHECKOUT INTERFACE
     ======================================================= */

  return (
    <div
      className="gr-checkout-backdrop"
      onMouseDown={event => {
        if (
          event.target ===
            event.currentTarget &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        className="gr-checkout-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gr-checkout-title"
        aria-describedby="gr-checkout-subtitle"
        aria-busy={busy}
      >
        <header className="gr-checkout-head">
          <div>
            <span className="gr-checkout-overline">
              GOLDEN ROSE PERFUME / POINT OF SALE
            </span>

            <h2 id="gr-checkout-title">
              {recovery
                ? 'Recover payment'
                : step === 'review'
                  ? 'Confirm sale'
                  : step === 'cash'
                    ? 'Cash payment'
                    : step === 'bank'
                      ? 'Bank transfer'
                      : step === 'card'
                        ? 'Card / POS terminal'
                        : 'Split payment'}
            </h2>

            <p id="gr-checkout-subtitle">
              {recovery
                ? 'Recover the original transaction without collecting payment again.'
                : step === 'review'
                  ? 'Review the sale and select a payment method.'
                  : step === 'cash'
                    ? 'Enter the cash received and verify the change.'
                    : 'Record only independently confirmed payments. No gateway is called.'}
            </p>
          </div>

          <button
            type="button"
            className="gr-checkout-close"
            aria-label="Close checkout"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div
          className="gr-checkout-progress"
          aria-hidden="true"
        >
          <span className="active">
            1 <b>Confirm sale</b>
          </span>

          <span
            className={
              step !== 'review'
                ? 'active'
                : ''
            }
          >
            2 <b>Payment details</b>
          </span>
        </div>

        {/* =================================================
            STEP ONE: REVIEW THE CURRENT SALE
            ================================================= */}

        {step === 'review' ? (
          <div className="gr-checkout-scroll">
            <div className="gr-checkout-customer">
              <div>
                <span>
                  SELL TO
                </span>

                <label htmlFor="gr-checkout-customer-name">
                  Customer name (optional)
                </label>

                <input
                  id="gr-checkout-customer-name"
                  type="text"
                  value={buyerName}
                  maxLength={120}
                  placeholder="Walk-in customer"
                  disabled={
                    busy ||
                    !updatedPayments
                  }
                  autoComplete="off"
                  onChange={event =>
                    setBuyerName(
                      event.target.value,
                    )
                  }
                />

                {!updatedPayments && (
                  <small>
                    Customer names become available
                    after the payment migration.
                  </small>
                )}
              </div>

              <span className="gr-checkout-count">
                {totalItems}{' '}
                {totalItems === 1
                  ? 'item'
                  : 'items'}
              </span>
            </div>

            <div
              className="gr-checkout-lines"
              aria-label="Sale items"
            >
              {lines.map(line => (
                <div
                  className="gr-checkout-line"
                  key={line.id}
                >
                  <div>
                    <strong>
                      {line.name}
                    </strong>

                    <small>
                      {line.sku || 'Perfume'}
                      {' · '}
                      {line.quantity}
                      {' × '}
                      {money(line.unitPriceMinor)}
                    </small>
                  </div>

                  <b>
                    {money(
                      line.quantity *
                        line.unitPriceMinor,
                    )}
                  </b>
                </div>
              ))}
            </div>

            <dl className="gr-checkout-breakdown">
              <div>
                <dt>
                  Total sales
                </dt>

                <dd>
                  {money(subtotalMinor)}
                </dd>
              </div>

              <div className="gr-checkout-discount-row">
                <dt>
                  <label htmlFor="gr-checkout-discount">
                    Total discount
                  </label>

                  <small>
                    Maximum {discountLimitPercent}%
                    {' '}for your role
                  </small>
                </dt>

                <dd>
                  <span className="gr-checkout-moneyfield">
                    <span>₦</span>

                    <input
                      id="gr-checkout-discount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={discountNaira}
                      onChange={event =>
                        onDiscountChange(
                          event.target.value,
                        )
                      }
                      disabled={
                        busy ||
                        recovery
                      }
                    />
                  </span>

                  <small className="gr-checkout-discount-value">
                    −{money(
                      validDiscount
                        ? discountMinor
                        : 0,
                    )}
                  </small>
                </dd>
              </div>

              {!validDiscount && (
                <div
                  className="gr-checkout-inline-error"
                  role="alert"
                >
                  Enter a valid discount within
                  your allowed limit.
                </div>
              )}

              <div>
                <dt>
                  Sales tax
                </dt>

                <dd>
                  {taxMinor === null
                    ? 'Not configured'
                    : money(taxMinor)}
                </dd>
              </div>

              <div className="gr-checkout-due">
                <dt>
                  Amount payable
                </dt>

                <dd>
                  {money(totalMinor)}
                </dd>
              </div>

              <div>
                <dt>
                  Outstanding
                </dt>

                <dd className="gr-checkout-outstanding">
                  {money(totalMinor)}
                </dd>
              </div>
            </dl>

            <div className="gr-checkout-methods-heading">
              <h3>
                Choose payment method
              </h3>

              <small>
                Only available methods can complete a sale
              </small>
            </div>

            <div className="gr-checkout-methods">
              <button
                type="button"
                disabled={
                  busy ||
                  !validTotal
                }
                onClick={() =>
                  goTo('cash')
                }
              >
                <Banknote size={19} />

                <span>
                  Cash payment
                </span>

                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !validTotal ||
                  !bankAvailable
                }
                title={
                  bankAvailable
                    ? 'Record a confirmed transfer'
                    : 'Owner receiving account required'
                }
                onClick={() =>
                  goTo('bank')
                }
              >
                <Building2 size={19} />

                <span>
                  Bank payment
                </span>

                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !validTotal ||
                  !updatedPayments
                }
                onClick={() =>
                  goTo('card')
                }
                title="Record payment from a physical card terminal"
              >
                <CreditCard size={18} />

                <span>
                  POS terminal
                </span>

                <small>
                  {updatedPayments
                    ? 'Manual confirmation'
                    : 'Payment update required'}
                </small>
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !validTotal ||
                  !updatedPayments
                }
                onClick={() =>
                  goTo('split')
                }
              >
                <WalletCards size={18} />

                <span>
                  Split payment
                </span>

                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                disabled
                title="Credit sales are not integrated"
              >
                <WalletCards size={18} />

                <span>
                  Credit payment
                </span>

                <small>
                  Not connected
                </small>
              </button>

              <button
                type="button"
                disabled
                title="Cheque payment is not integrated"
              >
                <ReceiptText size={18} />

                <span>
                  Cheque
                </span>

                <small>
                  Not connected
                </small>
              </button>

              <button
                type="button"
                disabled
                title="Web payment is not integrated"
              >
                <CreditCard size={18} />

                <span>
                  Web payment
                </span>

                <small>
                  Not connected
                </small>
              </button>
            </div>
          </div>

        /* =================================================
           STEP TWO: CASH OR TRANSACTION RECOVERY
           ================================================= */

        ) : step === 'cash' ? (
          <form
            className="gr-checkout-scroll"
            onSubmit={event =>
              void confirmCash(event)
            }
          >
            {recovery && (
              <p
                className="gr-checkout-warning"
                role="status"
              >
                Transaction confirmation is pending.
                Retry the same reference. Do not
                collect payment or issue change again.

                <code>
                  {pendingReference}
                </code>
              </p>
            )}

            {recovery ? (
              <>
                <div className="gr-checkout-large-total">
                  <span>
                    Saved payment ·{' '}

                    {pendingPayment
                      ? paymentMethodLabel(
                          pendingPayment.method,
                        )
                      : 'Transaction recovery'}
                  </span>

                  <strong>
                    {savedTotalMinor === null
                      ? 'Retry saved reference'
                      : money(savedTotalMinor)}
                  </strong>

                  {pendingPayment && (
                    <small>
                      Customer:{' '}

                      {pendingPayment.customerName ||
                        'Walk-in customer'}
                    </small>
                  )}
                </div>

                {pendingPayment && (
                  <dl className="gr-checkout-cash-results">
                    <div>
                      <dt>
                        Original tendered amount
                      </dt>

                      <dd>
                        {money(
                          pendingPayment.tenderedMinor,
                        )}
                      </dd>
                    </div>

                    {pendingPayment.payments && (
                      <>
                        <div>
                          <dt>
                            Cash received
                          </dt>

                          <dd>
                            {money(
                              pendingPayment.payments.cashMinor,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt>
                            Bank transfer
                          </dt>

                          <dd>
                            {money(
                              pendingPayment.payments.transferMinor,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt>
                            Card / POS terminal
                          </dt>

                          <dd>
                            {money(
                              pendingPayment.payments.cardMinor,
                            )}
                          </dd>
                        </div>
                      </>
                    )}

                    {savedTotalMinor !== null && (
                      <div>
                        <dt>
                          Original calculated change
                        </dt>

                        <dd>
                          {money(
                            pendingPayment.tenderedMinor -
                              savedTotalMinor,
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </>

            ) : (
              <>
                <div className="gr-checkout-large-total">
                  <span>
                    Amount payable
                  </span>

                  <strong>
                    {money(totalMinor)}
                  </strong>
                </div>

                <label
                  className="gr-checkout-field-label"
                  htmlFor="gr-checkout-cash"
                >
                  Cash received (₦)
                </label>

                <div className="gr-checkout-cash-field">
                  <span>₦</span>

                  <input
                    id="gr-checkout-cash"
                    className="gr-checkout-cash-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={cashNaira}
                    onChange={event =>
                      onCashChange(
                        event.target.value,
                      )
                    }
                    disabled={
                      busy ||
                      recovery
                    }
                  />

                  <button
                    type="button"
                    onClick={() =>
                      onCashChange(
                        (totalMinor / 100).toFixed(2),
                      )
                    }
                    disabled={
                      busy ||
                      recovery
                    }
                  >
                    Exact
                  </button>
                </div>

                <div
                  className="gr-checkout-denominations"
                  role="group"
                  aria-label="Add cash denominations"
                >
                  {CASH_DENOMINATIONS.map(value => (
                    <button
                      type="button"
                      key={value}
                      disabled={
                        busy ||
                        recovery
                      }
                      onClick={() =>
                        onCashChange(
                          addCashDenomination(
                            cashNaira,
                            value,
                          ),
                        )
                      }
                    >
                      {new Intl.NumberFormat(
                        'en-NG',
                      ).format(value)}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={
                      busy ||
                      recovery
                    }
                    onClick={() =>
                      onCashChange('')
                    }
                    className="gr-checkout-clear"
                  >
                    Clear
                  </button>
                </div>

                <dl className="gr-checkout-cash-results">
                  <div>
                    <dt>
                      Amount payable
                    </dt>

                    <dd>
                      {money(totalMinor)}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Cash received
                    </dt>

                    <dd>
                      {cashMinor === null
                        ? '—'
                        : money(cashMinor)}
                    </dd>
                  </div>

                  <div className="gr-checkout-change">
                    <dt>
                      Change to return
                    </dt>

                    <dd>
                      {changeMinor === null
                        ? '—'
                        : money(changeMinor)}
                    </dd>
                  </div>

                  {cashMinor !== null &&
                    cashMinor < totalMinor && (
                      <div className="gr-checkout-shortfall">
                        <dt>
                          Still outstanding
                        </dt>

                        <dd>
                          {money(outstandingMinor)}
                        </dd>
                      </div>
                    )}
                </dl>
              </>
            )}

            <p className="gr-checkout-note">
              <ShieldCheck size={15} />

              Only a server-confirmed sale creates
              a receipt and deducts inventory.
            </p>

            {feedback && (
              <p
                role="alert"
                className="gr-checkout-error"
              >
                {feedback}
              </p>
            )}

            <footer className="gr-checkout-footer">
              <button
                type="button"
                className="gr-checkout-back"
                disabled={busy}
                onClick={() => {
                  if (recovery) {
                    onClose();
                  } else {
                    goTo('review');
                  }
                }}
              >
                <ArrowLeft size={17} />

                {recovery
                  ? 'Close'
                  : 'Back'}
              </button>

              <button
                type="submit"
                className="gr-checkout-submit"
                disabled={!canSubmit}
              >
                {busy
                  ? 'Confirming…'
                  : recovery
                    ? 'Retry same transaction'
                    : 'Confirm cash payment'}

                <CheckCircle2 size={17} />
              </button>
            </footer>
          </form>

        /* =================================================
           STEP TWO: BANK, CARD AND SPLIT PAYMENT
           ================================================= */

        ) : (
          <div className="gr-checkout-scroll">
            <NonCashPaymentPanel
              key={
                step +
                ':' +
                totalMinor +
                ':' +
                (
                  receivingAccount?.accountNumber ??
                  ''
                )
              }
              mode={
                step === 'bank'
                  ? 'bank_transfer'
                  : step
              }
              totalMinor={totalMinor}
              receivingAccount={receivingAccount}
              customerName={buyerName}
              busy={busy}
              error={feedback}
              onBack={() =>
                goTo('review')
              }
              onConfirm={async payment => {
                const confirmed =
                  await onConfirmCash(payment);

                if (confirmed) {
                  onClose();
                }

                return confirmed;
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}