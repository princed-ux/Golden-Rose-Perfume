'use client';
import { ActionButton } from '@/src/components/action-feedback';

import { useEffect, useState } from 'react';
import './PaymentDialog.css';

export type ReceivingBankAccount = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

type Props = {
  open: boolean;
  totalMinor: number;
  bankAccount?: ReceivingBankAccount | null;
  onClose: () => void;
  onConfirmCash: (tenderedMinor: number) => Promise<void>;
};

type Step = 'choose' | 'cash' | 'transfer';

const cashAmounts = [
  1000, 2000, 3000, 5000, 10000, 20000, 50000
];

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function money(minor: number) {
  return naira.format(minor / 100);
}

function parseNairaMinor(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, '');

  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const [whole, fraction = ''] = cleaned.split('.');
  const result =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(result) ? result : null;
}

function PaymentDialogInner({
  totalMinor,
  bankAccount,
  onClose,
  onConfirmCash,
}: Omit<Props, 'open'>) {
  const [step, setStep] = useState<Step>('choose');
  const [cashValue, setCashValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const tenderedMinor = parseNairaMinor(cashValue);

  const shortMinor =
    tenderedMinor === null
      ? 0
      : Math.max(0, totalMinor - tenderedMinor);

  const changeMinor =
    tenderedMinor === null
      ? 0
      : Math.max(0, tenderedMinor - totalMinor);

  const canConfirm =
    totalMinor > 0 &&
    tenderedMinor !== null &&
    tenderedMinor >= totalMinor;

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }

    window.addEventListener('keydown', onEscape);

    return () =>
      window.removeEventListener('keydown', onEscape);
  }, [busy, onClose]);

  async function confirmCash() {
    if (!canConfirm || tenderedMinor === null || busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      // Call the existing authenticated checkout.
      // It must throw if the backend rejects the sale.
      await onConfirmCash(tenderedMinor);

      // Existing register handles receipt and basket clearing.
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Payment could not be confirmed. Retry the same sale.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyBankAccount() {
    if (!bankAccount) return;

    try {
      await navigator.clipboard.writeText(
        bankAccount.accountNumber
      );
      setCopyStatus('Account number copied');
    } catch {
      setCopyStatus('Copy the account number manually');
    }
  }

  return (
    <div className="gr-pay-backdrop">
      <section
        className="gr-pay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Checkout payment"
        aria-busy={busy}
      >
        <header className="gr-pay-head">
          <div>
            <span className="gr-pay-kicker">
              GOLDEN ROSE / POINT OF SALE
            </span>

            <h2>
              {step === 'choose'
                ? 'Confirm sale'
                : step === 'cash'
                ? 'Cash payment'
                : 'Bank transfer'}
            </h2>
          </div>

          <ActionButton
            type="button"
            className="gr-pay-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close payment"
          >
            ×
          </ActionButton>
        </header>

        <div className="gr-pay-total">
          <span>Total amount due</span>
          <strong>{money(totalMinor)}</strong>
        </div>

        {step === 'choose' && (
          <div className="gr-pay-body">
            <p className="gr-pay-help">
              Select the customer&apos;s payment method.
            </p>

            <div className="gr-pay-methods">
              <ActionButton
                type="button"
                className="gr-pay-method"
                onClick={() => setStep('cash')}
              >
                <span>
                  <strong>Cash</strong>
                  <small>
                    Receive cash and calculate change
                  </small>
                </span>
                <b>›</b>
              </ActionButton>

              <ActionButton
                type="button"
                className="gr-pay-method"
                onClick={() => setStep('transfer')}
              >
                <span>
                  <strong>Bank transfer</strong>
                  <small>
                    Show the owner&apos;s receiving account
                  </small>
                </span>
                <b>›</b>
              </ActionButton>
            </div>
          </div>
        )}

        {step === 'cash' && (
          <div className="gr-pay-body">
            <label
              className="gr-pay-label"
              htmlFor="gr-cash-given"
            >
              Cash received (₦)
            </label>

            <div className="gr-pay-input-wrap">
              <span>₦</span>

              <input
                id="gr-cash-given"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={cashValue}
                onChange={(event) =>
                  setCashValue(
                    event.target.value.replace(/[^\d.,]/g, '')
                  )
                }
                placeholder="e.g. 29000"
                disabled={busy}
              />
            </div>

            <div className="gr-pay-quick">
              <ActionButton
                type="button"
                disabled={busy}
                onClick={() =>
                  setCashValue((totalMinor / 100).toFixed(2))
                }
              >
                Exact
              </ActionButton>

              {cashAmounts.map((amount) => (
                <ActionButton
                  type="button"
                  key={amount}
                  disabled={busy}
                  onClick={() =>
                    setCashValue(String(amount))
                  }
                >
                  {money(amount * 100)}
                </ActionButton>
              ))}
            </div>

            <div
              className="gr-pay-change"
              aria-live="polite"
            >
              <span>
                {shortMinor
                  ? 'Still required'
                  : 'Change to give customer'}
              </span>

              <strong
                className={
                  shortMinor ? 'gr-pay-negative' : ''
                }
              >
                {money(shortMinor || changeMinor)}
              </strong>
            </div>

            {error && (
              <p className="gr-pay-error" role="alert">
                {error}
              </p>
            )}

            <div className="gr-pay-actions">
              <ActionButton
                type="button"
                className="gr-pay-back"
                onClick={() => setStep('choose')}
                disabled={busy}
              >
                Back
              </ActionButton>

              <ActionButton
                type="button"
                className="gr-pay-submit" pending={busy} pendingLabel="Confirming…"
                disabled={!canConfirm || busy}
                onClick={() => void confirmCash()}
              >
                {busy
                  ? 'Confirming…'
                  : 'Confirm cash payment'}
              </ActionButton>
            </div>
          </div>
        )}

        {step === 'transfer' && (
          <div className="gr-pay-body">
            {bankAccount?.bankName &&
            bankAccount.accountName &&
            bankAccount.accountNumber ? (
              <>
                <p className="gr-pay-help">
                  Ask the customer to transfer the exact
                  amount to this account.
                </p>

                <div className="gr-pay-bank-row">
                  <span>Bank</span>
                  <strong>{bankAccount.bankName}</strong>
                </div>

                <div className="gr-pay-bank-row">
                  <span>Account name</span>
                  <strong>{bankAccount.accountName}</strong>
                </div>

                <div className="gr-pay-bank-row">
                  <span>Account number</span>
                  <strong>
                    {bankAccount.accountNumber}
                  </strong>
                </div>

                <ActionButton
                  type="button"
                  className="gr-pay-copy"
                  onClick={() =>
                    void copyBankAccount()
                  }
                >
                  Copy account number
                </ActionButton>

                {copyStatus && (
                  <p role="status" className="gr-pay-help">
                    {copyStatus}
                  </p>
                )}

                <p className="gr-pay-warning">
                  Awaiting bank confirmation.
                  Do not release goods or mark this sale
                  paid from a customer&apos;s screenshot.
                  Payment verification is not yet connected.
                </p>
              </>
            ) : (
              <p className="gr-pay-warning">
                The owner has not configured a verified
                receiving account yet.
              </p>
            )}

            <div className="gr-pay-actions">
              <ActionButton
                type="button"
                className="gr-pay-back"
                onClick={() => setStep('choose')}
              >
                Back
              </ActionButton>

              <ActionButton
                type="button"
                className="gr-pay-submit"
                disabled
                title="Requires verified payment integration"
              >
                Payment verification unavailable
              </ActionButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function PaymentDialog({
  open,
  ...props
}: Props) {
  if (!open) return null;

  return <PaymentDialogInner {...props} />;
}
