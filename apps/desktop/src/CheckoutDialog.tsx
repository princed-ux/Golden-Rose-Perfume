import { ArrowLeft, ArrowRight, Banknote, Check } from "lucide-react";
import { Modal } from "./dialogs";
import { money } from "./domain";

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
}: {
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
}) {
  const canConfirm =
    !busy &&
    (Boolean(pendingReference) ||
      (!totalsError && change !== null && tendered !== null && tendered > 0));
  return (
    <Modal
      title={step === "confirm" ? "Confirm sale" : "Payment details"}
      kicker={
        step === "confirm"
          ? "Step 1 of 2"
          : pendingReference
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
              <dt>Sell to</dt>
              <dd>Cash Customer</dd>
            </div>
            <div>
              <dt>
                Total sales ({count} {count === 1 ? "unit" : "units"})
              </dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div>
              <dt>
                <label htmlFor="sale-discount">Total discount (₦)</label>
              </dt>
              <dd>
                <input
                  id="sale-discount"
                  inputMode="decimal"
                  value={discount}
                  placeholder="0.00"
                  disabled={busy}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </dd>
            </div>
            <div>
              <dt>Sales tax</dt>
              <dd className="review-note">Applied by the register</dd>
            </div>
            <div className="review-payable">
              <dt>Amount payable</dt>
              <dd>{totalsError ? "—" : money(total)}</dd>
            </div>
          </dl>
          {totalsError && (
            <p className="notice error" role="alert">
              {totalsError}
            </p>
          )}
          <h3 className="eyebrow payment-label">Payment method</h3>
          <div
            className="payment-methods"
            role="group"
            aria-label="Payment methods"
          >
            <button
              className="cash-method"
              onClick={next}
              disabled={busy || Boolean(totalsError)}
            >
              <Banknote size={16} />
              Cash payment
            </button>
            {[
              "Bank transfer",
              "POS terminal",
              "Credit payment",
              "Cheque",
              "Web payment",
            ].map((method) => (
              <button
                key={method}
                disabled
                title="Payment confirmation is not connected"
              >
                {method}
              </button>
            ))}
          </div>
          <p className="notice pending">
            Cash payment is available. Other methods require verified payment
            integrations.
          </p>
          <footer className="modal-actions">
            <button onClick={close} disabled={busy}>
              Cancel
            </button>
          </footer>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canConfirm) pay();
          }}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === "Enter") {
              event.preventDefault();
              if (canConfirm) pay();
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="payment-due">
              <span>Cash payment · Amount payable</span>
              <strong>{money(total)}</strong>
            </div>
            {!pendingReference && (
              <>
                <h3 className="eyebrow payment-label">Quick cash amounts</h3>
                <div
                  className="cash-denominations"
                  role="group"
                  aria-label="Quick cash amounts"
                >
                  {[1000, 2000, 5000, 10000, 20000, 50000].map((value) => (
                    <button
                      className={tendered === value * 100 ? "selected" : ""}
                      type="button"
                      key={value}
                      onClick={() => setCash(String(value))}
                    >
                      {money(value * 100)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCash((total / 100).toFixed(2))}
                  >
                    Exact cash
                  </button>
                  <button type="button" onClick={() => setCash("")}>
                    Clear amount
                  </button>
                </div>
                <label>
                  Cash received (₦)
                  <input
                    autoFocus
                    className="cash-amount-input"
                    name="cash"
                    inputMode="decimal"
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                    required
                  />
                </label>
              </>
            )}
            <div className="payment-totals">
              <div>
                <span>Amount due</span>
                <strong>{money(total)}</strong>
              </div>
              <div>
                <span>Change to return</span>
                <strong>{change === null ? "—" : money(change)}</strong>
              </div>
            </div>
            {!pendingReference && tendered !== null && tendered < total && (
              <p className="field-error" role="alert">
                Cash received is below the amount due.
              </p>
            )}
            {pendingReference && (
              <p className="notice pending">
                Confirmation was interrupted. Retry this transaction without
                collecting cash again.
                <small className="code">{pendingReference}</small>
              </p>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button type="button" onClick={pendingReference ? close : back}>
                <ArrowLeft size={15} />
                {pendingReference ? "Close" : "Back"}
              </button>
              <button className="primary" type="submit" disabled={!canConfirm}>
                {busy
                  ? "Confirming payment…"
                  : pendingReference
                    ? "Retry same transaction"
                    : "Confirm cash payment"}
                {pendingReference ? (
                  <Check size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
            </footer>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
