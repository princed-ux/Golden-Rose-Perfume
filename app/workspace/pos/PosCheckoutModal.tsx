
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
  Copy,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';

import './pos-checkout-modal.css';

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

type Step = 'review' | 'cash' | 'bank';

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
  receivingAccount?: PosReceivingAccount | null;
  busy: boolean;
  onClose: () => void;
  onConfirmCash: () => Promise<boolean>;
};

const currency = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(minor: number): string {
  return currency.format(minor / 100);
}

const denominationNaira = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
  10000,
  20000,
];

function addAmount(
  current: string,
  amountNaira: number,
): string {
  const cleaned = current.trim().replaceAll(',', '');

  const existing =
    /^\d+(?:\.\d{1,2})?$/.test(cleaned)
      ? Math.round(Number(cleaned) * 100)
      : 0;

  const result = existing + amountNaira * 100;

  return Number.isSafeInteger(result)
    ? (result / 100).toFixed(2)
    : current;
}

export function PosCheckoutModal({
  open,
  lines,
  customerName = 'Cash customer',
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
  receivingAccount,
  busy,
  onClose,
  onConfirmCash,
}: PosCheckoutModalProps) {
  const [step, setStep] = useState<Step>('review');
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<Element | null>(null);

  const totalItems = lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  const cashCanPay =
    cashMinor !== null &&
    cashMinor >= totalMinor;

  const recovery = Boolean(pendingReference);

  const changeMinor =
    cashMinor === null
      ? null
      : Math.max(0, cashMinor - totalMinor);

  const outstandingMinor = Math.max(
    0,
    totalMinor - (cashMinor ?? 0),
  );

  const canSubmit =
    !busy &&
    (
      recovery ||
      (
        validDiscount &&
        totalMinor > 0 &&
        cashCanPay
      )
    );

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;

      const opener = openerRef.current;

      if (
        opener instanceof HTMLElement &&
        opener.isConnected
      ) {
        opener.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setStep(pendingReference ? 'cash' : 'review');
    setFeedback('');
    setCopied(false);
  }, [open, pendingReference]);

  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => {
      const first =
        panelRef.current?.querySelector<HTMLElement>(
          step === 'cash'
            ? '.gr-checkout-cash-input'
            : 'button:not(:disabled), input:not(:disabled)',
        );

      (first ?? panelRef.current)?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }

      if (event.key !== 'Tab') return;

      const controls = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (node) =>
          node.getClientRects().length > 0,
      );

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (!first || !last) {
        event.preventDefault();
        panelRef.current?.focus();
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

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  function goTo(next: Step) {
    if (busy) return;

    setFeedback('');
    setCopied(false);
    setStep(next);
  }

  async function confirmCash(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canSubmit) return;

    setFeedback('');

    try {
      const confirmed = await onConfirmCash();

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

  async function copyAccount() {
    if (!receivingAccount?.accountNumber) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        receivingAccount.accountNumber,
      );

      setCopied(true);

      setFeedback(
        'Account number copied. Payment still requires independent verification.',
      );
    } catch {
      setFeedback(
        'Copy the account number manually. Payment has not been confirmed.',
      );
    }
  }

  return (
    <div
      className="gr-checkout-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
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
              {step === 'review'
                ? 'Confirm sale'
                : step === 'cash'
                  ? 'Cash payment'
                  : 'Bank transfer'}
            </h2>

            <p id="gr-checkout-subtitle">
              {step === 'review'
                ? 'Review the sale and select a payment method.'
                : step === 'cash'
                  ? 'Enter the cash received and verify the change.'
                  : 'Display receiving details. Do not release goods before verification.'}
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
              step !== 'review' ? 'active' : ''
            }
          >
            2 <b>Payment details</b>
          </span>
        </div>

        {step === 'review' ? (
          <div className="gr-checkout-scroll">
            <div className="gr-checkout-customer">
              <div>
                <span>SELL TO</span>
                <strong>{customerName}</strong>
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
              {lines.map((line) => (
                <div
                  className="gr-checkout-line"
                  key={line.id}
                >
                  <div>
                    <strong>{line.name}</strong>

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
                <dt>Total sales</dt>
                <dd>{money(subtotalMinor)}</dd>
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
                      onChange={(event) =>
                        onDiscountChange(
                          event.target.value,
                        )
                      }
                      disabled={busy || recovery}
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
                <dt>Sales tax</dt>

                <dd>
                  {taxMinor === null
                    ? 'Not configured'
                    : money(taxMinor)}
                </dd>
              </div>

              <div className="gr-checkout-due">
                <dt>Amount payable</dt>
                <dd>{money(totalMinor)}</dd>
              </div>

              <div>
                <dt>Outstanding</dt>

                <dd className="gr-checkout-outstanding">
                  {money(totalMinor)}
                </dd>
              </div>
            </dl>

            <div className="gr-checkout-methods-heading">
              <h3>Choose payment method</h3>

              <small>
                Only connected methods can complete
                a sale
              </small>
            </div>

            <div className="gr-checkout-methods">
              <button
                type="button"
                disabled={
                  busy ||
                  !validDiscount ||
                  totalMinor <= 0
                }
                onClick={() => goTo('cash')}
              >
                <Banknote size={19} />
                <span>Cash payment</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !validDiscount ||
                  totalMinor <= 0
                }
                onClick={() => goTo('bank')}
              >
                <Building2 size={19} />
                <span>Bank payment</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                disabled
                title="POS terminal payment is not integrated"
              >
                <CreditCard size={18} />
                <span>POS terminal</span>
                <small>Not connected</small>
              </button>

              <button
                type="button"
                disabled
                title="Credit sales are not integrated"
              >
                <WalletCards size={18} />
                <span>Credit payment</span>
                <small>Not connected</small>
              </button>

              <button
                type="button"
                disabled
                title="Cheque payment is not integrated"
              >
                <ReceiptText size={18} />
                <span>Cheque</span>
                <small>Not connected</small>
              </button>

              <button
                type="button"
                disabled
                title="Web payment is not integrated"
              >
                <CreditCard size={18} />
                <span>Web payment</span>
                <small>Not connected</small>
              </button>
            </div>
          </div>
        ) : step === 'cash' ? (
          <form
            className="gr-checkout-scroll"
            onSubmit={(event) =>
              void confirmCash(event)
            }
          >
            {recovery && (
              <p
                className="gr-checkout-warning"
                role="status"
              >
                Transaction confirmation is pending.
                Retry the same reference; do not
                create another sale.

                <code>{pendingReference}</code>
              </p>
            )}

            <div className="gr-checkout-large-total">
              <span>Amount payable</span>
              <strong>{money(totalMinor)}</strong>
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
                onChange={(event) =>
                  onCashChange(event.target.value)
                }
                disabled={busy || recovery}
              />

              <button
                type="button"
                onClick={() =>
                  onCashChange(
                    (totalMinor / 100).toFixed(2),
                  )
                }
                disabled={busy || recovery}
              >
                Exact
              </button>
            </div>

            <div
              className="gr-checkout-denominations"
              role="group"
              aria-label="Add cash denominations"
            >
              {denominationNaira.map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={busy || recovery}
                  onClick={() =>
                    onCashChange(
                      addAmount(cashNaira, value),
                    )
                  }
                >
                  {new Intl.NumberFormat('en-NG').format(
                    value,
                  )}
                </button>
              ))}

              <button
                type="button"
                disabled={busy || recovery}
                onClick={() => onCashChange('')}
                className="gr-checkout-clear"
              >
                Clear
              </button>
            </div>

            <dl className="gr-checkout-cash-results">
              <div>
                <dt>Amount payable</dt>
                <dd>{money(totalMinor)}</dd>
              </div>

              <div>
                <dt>Cash received</dt>

                <dd>
                  {cashMinor === null
                    ? '—'
                    : money(cashMinor)}
                </dd>
              </div>

              <div className="gr-checkout-change">
                <dt>Change to return</dt>

                <dd>
                  {changeMinor === null
                    ? '—'
                    : money(changeMinor)}
                </dd>
              </div>

              {cashMinor !== null &&
                cashMinor < totalMinor && (
                  <div className="gr-checkout-shortfall">
                    <dt>Still outstanding</dt>
                    <dd>
                      {money(outstandingMinor)}
                    </dd>
                  </div>
                )}
            </dl>

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
                disabled={busy || recovery}
                onClick={() => goTo('review')}
              >
                <ArrowLeft size={17} />
                Back
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
        ) : (
          <div className="gr-checkout-scroll">
            <div className="gr-checkout-large-total">
              <span>Amount to transfer</span>
              <strong>{money(totalMinor)}</strong>
            </div>

            {receivingAccount ? (
              <div className="gr-checkout-bank">
                <span>STORE RECEIVING ACCOUNT</span>

                <strong>
                  {receivingAccount.bankName}
                </strong>

                <p>
                  {receivingAccount.accountName}
                </p>

                <div>
                  <code>
                    {receivingAccount.accountNumber}
                  </code>

                  <button
                    type="button"
                    onClick={() =>
                      void copyAccount()
                    }
                  >
                    <Copy size={16} />

                    {copied
                      ? 'Copied'
                      : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="gr-checkout-warning">
                The owner has not connected a
                verified receiving account to
                this register.
              </p>
            )}

            <p className="gr-checkout-warning">
              Transfer confirmation is not integrated.
              A bank screenshot or customer claim
              is insufficient to mark this sale paid.
            </p>

            {feedback && (
              <p
                role="status"
                className="gr-checkout-note"
              >
                {feedback}
              </p>
            )}

            <footer className="gr-checkout-footer">
              <button
                type="button"
                className="gr-checkout-back"
                disabled={busy}
                onClick={() => goTo('review')}
              >
                <ArrowLeft size={17} />
                Back
              </button>

              <button
                type="button"
                className="gr-checkout-submit"
                disabled
              >
                Awaiting payment integration
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
