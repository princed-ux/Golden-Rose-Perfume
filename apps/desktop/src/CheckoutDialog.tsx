import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Check,
  Copy,
} from "lucide-react";
import { Modal } from "./dialogs";
import { money } from "./domain";

export type ReceivingBankAccount = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

type Props = {
  step: "confirm" | "payment";
  count: number;
  subtotal: number;
  total: number;
  discount: string;
  setDiscount: (value: string) => void;
  cash: string;
  setCash: (value: string) => void;
  tendered: number | null;
  change: number | null;
  pendingReference?: string;
  busy: boolean;
  error: string;
  totalsError: string;
  close: () => void;
  back: () => void;
  next: () => void;
  pay: () => void;
  bankAccount?: ReceivingBankAccount | null;
};

export function CheckoutDialog({
  step,
  count,
  subtotal,
  total,
  discount,
  setDiscount,
  cash,
  setCash,
  tendered,
  change,
  pendingReference,
  busy,
  error,
  totalsError,
  close,
  back,
  next,
  pay,
  bankAccount,
}: Props) {
  const [method, setMethod] =
    useState<"cash" | "transfer">("cash");

  const [copied, setCopied] = useState(false);

  const recovering = Boolean(pendingReference);
  const cashSelected = recovering || method === "cash";

  const canConfirmCash =
    !busy &&
    (recovering ||
      (!totalsError &&
        tendered !== null &&
        tendered >= total &&
        tendered > 0 &&
        change !== null));

  function chooseCash() {
    setMethod("cash");
    next();
  }

  function chooseTransfer() {
    setMethod("transfer");
    next();
  }

  async function copyAccount() {
    if (!bankAccount?.accountNumber) return;

    try {
      await navigator.clipboard.writeText(
        bankAccount.accountNumber,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const nextCashAmount =
    Math.ceil((total + 1) / 50_000) * 500;

  const quickAmounts = Array.from(
    new Set([
      1000,
      2000,
      5000,
      10000,
      20000,
      50000,
      nextCashAmount,
    ]),
  )
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b);

  return (
    <Modal
      title={
        step === "confirm"
          ? "Confirm sale"
          : cashSelected
            ? "Cash payment"
            : "Bank transfer"
      }
      kicker={
        step === "confirm"
          ? "Step 1 of 2"
          : recovering
            ? "Transaction recovery"
            : "Step 2 of 2"
      }
      close={close}
      busy={busy}
      className="checkout-modal"
    >
      {step === "confirm" ? (
        <>
          <dl className="sale-review">
            <div>
              <dt>Customer</dt>
              <dd>Cash Customer</dd>
            </div>

            <div>
              <dt>
                Products ({count}{" "}
                {count === 1 ? "unit" : "units"})
              </dt>
              <dd>{money(subtotal)}</dd>
            </div>

            <div>
              <dt>
                <label htmlFor="sale-discount">
                  Discount (₦)
                </label>
              </dt>
              <dd>
                <input
                  id="sale-discount"
                  value={discount}
                  onChange={(event) =>
                    setDiscount(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={busy}
                />
              </dd>
            </div>

            <div>
              <dt>Sales tax</dt>
              <dd className="review-note">
                Determined by the register
              </dd>
            </div>

            <div className="review-payable">
              <dt>Amount payable</dt>
              <dd>
                {totalsError ? "—" : money(total)}
              </dd>
            </div>
          </dl>

          {totalsError && (
            <p className="notice error" role="alert">
              {totalsError}
            </p>
          )}

          <h3 className="eyebrow payment-label">
            Choose payment method
          </h3>

          <div
            className="payment-methods"
            role="group"
            aria-label="Payment methods"
          >
            <button
              type="button"
              className="cash-method"
              onClick={chooseCash}
              disabled={busy || Boolean(totalsError)}
            >
              <Banknote size={17} />
              Cash payment
              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              onClick={chooseTransfer}
              disabled={busy || Boolean(totalsError)}
            >
              <Building2 size={17} />
              Bank transfer
              <ArrowRight size={15} />
            </button>

            {[
              "POS terminal",
              "Credit payment",
              "Cheque",
              "Web payment",
            ].map((name) => (
              <button
                key={name}
                type="button"
                disabled
                title="Not yet integrated"
              >
                {name}
              </button>
            ))}
          </div>

          <footer className="modal-actions">
            <button
              type="button"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
          </footer>
        </>
      ) : cashSelected ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canConfirmCash) pay();
          }}
          onKeyDown={(event) => {
            if (
              event.ctrlKey &&
              event.key === "Enter"
            ) {
              event.preventDefault();

              if (canConfirmCash) pay();
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="payment-due">
              <span>Amount payable</span>
              <strong>{money(total)}</strong>
            </div>

            {!recovering && (
              <>
                <h3 className="eyebrow payment-label">
                  Quick cash amounts
                </h3>

                <div
                  className="cash-denominations"
                  role="group"
                  aria-label="Quick cash amounts"
                >
                  {quickAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={
                        tendered === amount * 100
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setCash(String(amount))
                      }
                    >
                      {money(amount * 100)}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setCash(
                        (total / 100).toFixed(2),
                      )
                    }
                  >
                    Exact cash
                  </button>

                  <button
                    type="button"
                    onClick={() => setCash("")}
                  >
                    Clear
                  </button>
                </div>

                <label>
                  Cash received (₦)
                  <input
                    autoFocus
                    className="cash-amount-input"
                    name="cash"
                    inputMode="decimal"
                    autoComplete="off"
                    value={cash}
                    onChange={(event) =>
                      setCash(event.target.value)
                    }
                    placeholder="Enter amount given"
                    required
                  />
                </label>
              </>
            )}

            <div className="payment-totals">
              <div>
                <span>Total due</span>
                <strong>{money(total)}</strong>
              </div>

              <div>
                <span>Cash received</span>
                <strong>
                  {tendered === null
                    ? "—"
                    : money(tendered)}
                </strong>
              </div>

              <div>
                <span>
                  Change to give customer
                </span>
                <strong>
                  {change === null
                    ? "—"
                    : money(change)}
                </strong>
              </div>
            </div>

            {!recovering &&
              tendered !== null &&
              tendered < total && (
                <p
                  className="field-error"
                  role="alert"
                >
                  Cash received is below the amount
                  due. Enter enough cash to continue.
                </p>
              )}

            {recovering && (
              <p className="notice pending">
                A previous payment confirmation
                was interrupted. Retry with the
                same transaction reference.
                <small className="code">
                  {pendingReference}
                </small>
              </p>
            )}

            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}

            <footer className="modal-actions">
              <button
                type="button"
                onClick={recovering ? close : back}
              >
                <ArrowLeft size={15} />
                {recovering ? "Close" : "Back"}
              </button>

              <button
                className="primary"
                type="submit"
                disabled={!canConfirmCash}
              >
                {busy
                  ? "Confirming…"
                  : recovering
                    ? "Retry same transaction"
                    : "Confirm cash payment"}

                {recovering ? (
                  <Check size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
            </footer>
          </fieldset>
        </form>
      ) : (
        <div>
          <div className="payment-due">
            <span>Amount to transfer</span>
            <strong>{money(total)}</strong>
          </div>

          {bankAccount?.bankName &&
          bankAccount.accountName &&
          bankAccount.accountNumber ? (
            <>
              <p className="notice pending">
                Ask the customer to transfer the
                exact amount to the store's
                verified receiving account.
              </p>

              <dl className="sale-review">
                <div>
                  <dt>Bank</dt>
                  <dd>{bankAccount.bankName}</dd>
                </div>

                <div>
                  <dt>Account name</dt>
                  <dd>{bankAccount.accountName}</dd>
                </div>

                <div>
                  <dt>Account number</dt>
                  <dd>{bankAccount.accountNumber}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => void copyAccount()}
              >
                <Copy size={15} />
                {copied
                  ? "Account number copied"
                  : "Copy account number"}
              </button>
            </>
          ) : (
            <p
              className="notice pending"
              role="status"
            >
              The store's receiving bank account
              has not been connected to the
              desktop application yet.
            </p>
          )}

          <p className="notice pending">
            Transfer verification is not yet
            integrated. Do not mark this sale
            paid or release goods based only on
            a transfer screenshot.
          </p>

          <footer className="modal-actions">
            <button
              type="button"
              onClick={back}
            >
              <ArrowLeft size={15} />
              Back
            </button>

            <button
              className="primary"
              type="button"
              disabled
            >
              Awaiting payment integration
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
}