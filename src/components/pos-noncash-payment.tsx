'use client';

import {
  useState,
  type FormEvent,
} from 'react';

import {
  CASH_DENOMINATIONS,
  addCashDenomination,
  buildSalePayment,
  calculateTender,
  parsePaymentAmount,
  paymentMethodLabel,
  validReceivingAccount,
  type PaymentBreakdown,
  type SalePayment,
  type ReceivingAccount,
} from '../lib/golden-rose/pos-payments';

type Mode =
  | 'bank_transfer'
  | 'card'
  | 'split';

type Props = {
  mode: Mode;
  totalMinor: number;
  receivingAccount?: ReceivingAccount | null;
  customerName: string;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onConfirm: (
    payment: SalePayment,
  ) => Promise<boolean | void>;
};

const money = (minor: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(minor / 100);

export function NonCashPaymentPanel({
  mode,
  totalMinor,
  receivingAccount,
  customerName,
  busy,
  error,
  onBack,
  onConfirm,
}: Props) {
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [card, setCard] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  const account =
    validReceivingAccount(receivingAccount)
      ? receivingAccount
      : null;

  const split = mode === 'split';

  const cashMinor = split
    ? parsePaymentAmount(cash)
    : 0;

  const transferMinor =
    mode === 'bank_transfer'
      ? totalMinor
      : split
        ? parsePaymentAmount(transfer)
        : 0;

  const cardMinor =
    mode === 'card'
      ? totalMinor
      : split
        ? parsePaymentAmount(card)
        : 0;

  let amounts: PaymentBreakdown | null = null;

  let totals:
    | ReturnType<typeof calculateTender>
    | null = null;

  let validation = '';

  try {
    if (
      cashMinor === null ||
      transferMinor === null ||
      cardMinor === null
    ) {
      throw new Error(
        'Enter valid amounts with no more than two decimal places.',
      );
    }

    amounts = {
      cashMinor,
      transferMinor,
      cardMinor,
    };

    totals = calculateTender(
      totalMinor,
      amounts,
    );

    if (transferMinor > 0 && !account) {
      throw new Error(
        'Bank transfer is disabled until the owner saves a receiving account.',
      );
    }

    if (totals.complete && totals.method !== mode) {
      throw new Error(
        'Split payment must use at least two methods.',
      );
    }
  } catch (issue) {
    validation =
      issue instanceof Error
        ? issue.message
        : 'Invalid allocation.';
  }

  const canConfirm =
    !busy &&
    !validation &&
    !!totals?.complete &&
    !!amounts &&
    confirmed;

  function change(
    setter: (value: string) => void,
    value: string,
  ) {
    setter(value);
    setConfirmed(false);
    setFeedback('');
  }

  async function copyAccount() {
    if (!account) return;

    try {
      await navigator.clipboard.writeText(
        account.accountNumber,
      );

      setCopied(true);

    } catch {
      setFeedback(
        'Copy the displayed account number manually.',
      );
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canConfirm || !amounts) return;

    setFeedback('');

    try {
      const payment = buildSalePayment(
        totalMinor,
        amounts,
        customerName,
        confirmed,
        account,
      );

      if (payment.method !== mode) {
        throw new Error(
          'Choose the matching payment method.',
        );
      }

      const saved = await onConfirm(payment);

      if (saved === false) {
        setFeedback(
          'Sale not confirmed. Review the register message before retrying.',
        );
      }
    } catch (issue) {
      setFeedback(
        issue instanceof Error
          ? issue.message
          : 'Payment confirmation unavailable.',
      );
    }
  }

  return (
    <form
      className="gr-pos-multi-payment"
      onSubmit={event => void submit(event)}
    >
      <style>{styles}</style>

      <div className="gr-mp-total">
        <span>Amount payable</span>

        <strong>
          {money(totalMinor)}
        </strong>
      </div>

      {customerName.trim() && (
        <p>
          Customer:{' '}
          <strong>
            {customerName.trim()}
          </strong>
        </p>
      )}

      {(mode === 'bank_transfer' || split) && account && (
        <section
          className="gr-mp-bank"
          aria-label="Store receiving bank account"
        >
          <span>
            OWNER-CONFIGURED RECEIVING ACCOUNT
          </span>

          <strong>
            {account.bankName}
          </strong>

          <span>
            {account.accountName}
          </span>

          <div>
            <code>
              {account.accountNumber}
            </code>

            <button
              type="button"
              disabled={busy}
              onClick={() => void copyAccount()}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>
      )}

      {mode === 'bank_transfer' && !account && (
        <p
          role="alert"
          className="gr-mp-error"
        >
          No receiving account is configured.
          Ask the owner to save the bank details
          in Business Settings.
        </p>
      )}

      {mode === 'card' && (
        <p>
          Use the physical payment terminal.
          Confirm only after the terminal approves
          this transaction. No payment gateway is called.
        </p>
      )}

      {mode === 'bank_transfer' && (
        <p>
          Confirm actual incoming funds.
          Do not accept a transfer screenshot
          as proof of payment.
        </p>
      )}

      {split && (
        <>
          <p>
            Allocate this sale across two or more methods.
            No separate sale is created for each portion.
          </p>

          <label>
            Cash received (₦)

            <input
              inputMode="decimal"
              placeholder="0.00"
              value={cash}
              disabled={busy}
              onChange={event =>
                change(
                  setCash,
                  event.target.value,
                )
              }
            />
          </label>

          <div
            className="gr-mp-denominations"
            role="group"
            aria-label="Add cash denominations"
          >
            {CASH_DENOMINATIONS.map(amount => (
              <button
                type="button"
                key={amount}
                disabled={busy}
                onClick={() =>
                  change(
                    setCash,
                    addCashDenomination(
                      cash,
                      amount,
                    ),
                  )
                }
              >
                +₦{amount.toLocaleString('en-NG')}
              </button>
            ))}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                change(setCash, '')
              }
            >
              Clear cash
            </button>

            <button
              type="button"
              disabled={
                busy ||
                transferMinor === null ||
                cardMinor === null
              }
              onClick={() =>
                change(
                  setCash,
                  (
                    Math.max(
                      0,
                      totalMinor -
                        (transferMinor ?? 0) -
                        (cardMinor ?? 0),
                    ) / 100
                  ).toFixed(2),
                )
              }
            >
              Exact remaining cash
            </button>
          </div>

          <label>
            Bank transfer (₦)

            <input
              inputMode="decimal"
              placeholder={
                account
                  ? '0.00'
                  : 'Owner bank account required'
              }
              value={transfer}
              disabled={busy || !account}
              onChange={event =>
                change(
                  setTransfer,
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            Card / POS terminal (₦)

            <input
              inputMode="decimal"
              placeholder="0.00"
              value={card}
              disabled={busy}
              onChange={event =>
                change(
                  setCard,
                  event.target.value,
                )
              }
            />
          </label>
        </>
      )}

      <dl className="gr-mp-breakdown">
        <div>
          <dt>Cash received</dt>

          <dd>
            {cashMinor === null
              ? '—'
              : money(cashMinor)}
          </dd>
        </div>

        <div>
          <dt>Bank transfer</dt>

          <dd>
            {transferMinor === null
              ? '—'
              : money(transferMinor)}
          </dd>
        </div>

        <div>
          <dt>Card / POS terminal</dt>

          <dd>
            {cardMinor === null
              ? '—'
              : money(cardMinor)}
          </dd>
        </div>

        <div>
          <dt>Outstanding</dt>

          <dd>
            {totals
              ? money(totals.outstandingMinor)
              : '—'}
          </dd>
        </div>

        <div>
          <dt>Cash change</dt>

          <dd>
            {totals
              ? money(totals.changeMinor)
              : '—'}
          </dd>
        </div>
      </dl>

      {validation && (
        <p
          className="gr-mp-error"
          role="alert"
        >
          {validation}
        </p>
      )}

      <label className="gr-mp-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={
            busy ||
            !!validation ||
            !totals?.complete
          }
          onChange={event =>
            setConfirmed(event.target.checked)
          }
        />

        <span>
          I have received the stated cash and independently
          confirmed all transfer and/or physical terminal
          payments in this sale.
        </span>
      </label>

      <p className="gr-mp-notice">
        Manual recording only. This does not automatically
        verify bank or terminal settlement. Do not start
        another sale for these same funds.
      </p>

      {(error || feedback) && (
        <p
          role="alert"
          className="gr-mp-error"
        >
          {error || feedback}
        </p>
      )}

      <div className="gr-mp-footer">
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
        >
          Back
        </button>

        <button
          type="submit"
          className="gr-mp-primary"
          disabled={!canConfirm}
        >
          {busy
            ? 'Confirming…'
            : 'Confirm ' +
              paymentMethodLabel(mode).toLowerCase()}
        </button>
      </div>
    </form>
  );
}

const styles = `
.gr-pos-multi-payment {
  display: grid;
  gap: 14px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}

.gr-pos-multi-payment * {
  box-sizing: border-box;
}

.gr-pos-multi-payment p {
  margin: 0;
}

.gr-pos-multi-payment label {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

.gr-pos-multi-payment input:not([type=checkbox]) {
  width: 100%;
  min-height: 40px;
  border: 1px solid #bd9ba7;
  border-radius: 8px;
  padding: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
}

.gr-pos-multi-payment button {
  border: 1px solid #bd9ba7;
  border-radius: 8px;
  padding: 8px 12px;
  min-height: 38px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gr-pos-multi-payment button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.gr-mp-total,
.gr-mp-bank,
.gr-mp-breakdown {
  border: 1px solid #bd9ba7;
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 6px;
}

.gr-mp-total strong {
  font-size: 26px;
}

.gr-mp-bank div,
.gr-mp-breakdown div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gr-mp-bank code {
  font-size: 18px;
  overflow-wrap: anywhere;
}

.gr-mp-breakdown dt,
.gr-mp-breakdown dd {
  margin: 0;
}

.gr-mp-breakdown dd {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.gr-mp-denominations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gr-pos-multi-payment .gr-mp-confirm {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-weight: 500;
}

.gr-mp-confirm input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}

.gr-mp-error,
.gr-mp-notice {
  border: 1px solid #c39c73;
  padding: 10px;
  border-radius: 8px;
}

.gr-mp-error {
  border-color: #b64a62;
}

.gr-mp-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.gr-pos-multi-payment .gr-mp-primary {
  background: #73324b;
  border-color: #73324b;
  color: white;
}
`;