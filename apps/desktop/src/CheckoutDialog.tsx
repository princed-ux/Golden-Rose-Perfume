import { useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Check,
} from "lucide-react";

import { Modal } from "./dialogs";
import { money } from "./domain";

import {
  NonCashPaymentPanel,
} from "../../../src/components/pos-noncash-payment";

import {
  CASH_DENOMINATIONS,
  addCashDenomination,
  buildSalePayment,
  paymentMethodLabel,
  validReceivingAccount,
  type PaymentMethod,
  type SalePayment,
} from "../../../src/lib/golden-rose/pos-payments";

import type {
  CashSaleRequest,
} from "../../../app/workspace/pos/types";

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
  pendingPayment?: CashSaleRequest | null;
  paymentVersion?: number;
  busy: boolean;
  error: string;
  totalsError: string;
  close: () => void;
  back: () => void;
  next: () => void;
  pay: (payment?: SalePayment) => Promise<boolean | void>;
  bankAccount?: ReceivingBankAccount | null;
};

/* =========================================================
   GOLDEN ROSE PERFUME — DESKTOP CHECKOUT
   ========================================================= */

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
  pendingPayment,
  paymentVersion,
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
    useState<PaymentMethod>("cash");

  const [customerName, setCustomerName] =
    useState("");

  const [feedback, setFeedback] =
    useState("");

  const updatedPayments =
    paymentVersion === 2;

  const bankAvailable =
    updatedPayments &&
    validReceivingAccount(bankAccount);

  const recovering =
    Boolean(pendingReference);

  const cashSelected =
    recovering || method === "cash";

  /*
   * Recovery always uses the original persisted request.
   * Do not calculate its amount from the current basket,
   * because that basket may have changed after a restart.
   */

  const originalTotal =
    pendingPayment
      ? pendingPayment.items.reduce(
          (sum, item) =>
            sum +
            item.quantity *
              item.expectedPriceMinor,
          0,
        ) - pendingPayment.discountMinor
      : total;

  const displayedTotal =
    recovering
      ? originalTotal
      : total;

  const displayedTendered =
    recovering && pendingPayment
      ? pendingPayment.tenderedMinor
      : tendered;

  const displayedChange =
    recovering && pendingPayment
      ? pendingPayment.tenderedMinor -
        originalTotal
      : change;

  const validTotal =
    Number.isSafeInteger(total) &&
    total > 0 &&
    !totalsError;

  const canConfirmCash =
    !busy &&
    (
      recovering ||
      (
        validTotal &&
        tendered !== null &&
        tendered >= total &&
        tendered > 0 &&
        change !== null
      )
    );

  /* =======================================================
     PAYMENT METHOD NAVIGATION
     ======================================================= */

  function chooseCash() {
    if (busy || !validTotal) {
      return;
    }

    setFeedback("");
    setMethod("cash");
    next();
  }

  function chooseTransfer() {
    if (
      busy ||
      !validTotal ||
      !bankAvailable
    ) {
      return;
    }

    setFeedback("");
    setMethod("bank_transfer");
    next();
  }

  function chooseOther(
    selected: "card" | "split",
  ) {
    if (
      busy ||
      !validTotal ||
      !updatedPayments
    ) {
      return;
    }

    setFeedback("");
    setMethod(selected);
    next();
  }

  /* =======================================================
     CASH CONFIRMATION AND RECOVERY
     ======================================================= */

  async function submitCash() {
    if (!canConfirmCash) {
      return;
    }

    setFeedback("");

    try {
      const payment = recovering
        ? undefined
        : buildSalePayment(
            total,
            {
              cashMinor: tendered ?? 0,
              transferMinor: 0,
              cardMinor: 0,
            },
            updatedPayments
              ? customerName
              : "",
            false,
            null,
          );

      const result =
        await pay(payment);

      if (result === false) {
        setFeedback(
          "Sale not confirmed. Review the register message before retrying the same transaction.",
        );
      }

    } catch (issue) {
      setFeedback(
        issue instanceof Error
          ? issue.message
          : "Payment could not be prepared.",
      );
    }
  }

  const quickAmounts =
    CASH_DENOMINATIONS;

  /* =======================================================
     CHECKOUT INTERFACE
     ======================================================= */

  return (
    <Modal
      title={
        recovering
          ? "Recover payment"
          : step === "confirm"
            ? "Confirm sale"
            : method === "cash"
              ? "Cash payment"
              : paymentMethodLabel(method)
      }
      kicker={
        recovering
          ? "Transaction recovery"
          : step === "confirm"
            ? "Step 1 of 2"
            : "Step 2 of 2"
      }
      close={close}
      busy={busy}
      className="checkout-modal"
    >
      {step === "confirm" && !recovering ? (
        <>
          <dl className="sale-review">
            <div>
              <dt>
                Customer
              </dt>

              <dd>
                <input
                  aria-label="Customer name (optional)"
                  placeholder="Walk-in customer"
                  maxLength={120}
                  value={customerName}
                  autoComplete="off"
                  disabled={
                    busy ||
                    !updatedPayments
                  }
                  onChange={event =>
                    setCustomerName(
                      event.target.value,
                    )
                  }
                />
              </dd>
            </div>

            {!updatedPayments && (
              <div>
                <dt>
                  Customer names
                </dt>

                <dd className="review-note">
                  Available after payment migration
                </dd>
              </div>
            )}

            <div>
              <dt>
                Products ({count}{" "}
                {count === 1
                  ? "unit"
                  : "units"})
              </dt>

              <dd>
                {money(subtotal)}
              </dd>
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
                  onChange={event =>
                    setDiscount(
                      event.target.value,
                    )
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={busy}
                />
              </dd>
            </div>

            <div>
              <dt>
                Sales tax
              </dt>

              <dd className="review-note">
                Determined by the register
              </dd>
            </div>

            <div className="review-payable">
              <dt>
                Amount payable
              </dt>

              <dd>
                {totalsError
                  ? "—"
                  : money(total)}
              </dd>
            </div>
          </dl>

          {totalsError && (
            <p
              className="notice error"
              role="alert"
            >
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
              disabled={
                busy ||
                !validTotal
              }
            >
              <Banknote size={17} />

              Cash payment

              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              onClick={chooseTransfer}
              disabled={
                busy ||
                !validTotal ||
                !bankAvailable
              }
              title={
                bankAvailable
                  ? "Record confirmed transfer"
                  : "Owner receiving account required"
              }
            >
              <Building2 size={17} />

              Bank transfer

              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              disabled={
                busy ||
                !validTotal ||
                !updatedPayments
              }
              title="Record an approved physical card terminal payment"
              onClick={() =>
                chooseOther("card")
              }
            >
              POS terminal
            </button>

            <button
              type="button"
              disabled={
                busy ||
                !validTotal ||
                !updatedPayments
              }
              onClick={() =>
                chooseOther("split")
              }
            >
              Split payment
            </button>

            {[
              "Credit payment",
              "Cheque",
              "Web payment",
            ].map(name => (
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

          {(error || feedback) && (
            <p
              className="notice error"
              role="alert"
            >
              {error || feedback}
            </p>
          )}

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
          onSubmit={event => {
            event.preventDefault();

            if (canConfirmCash) {
              void submitCash();
            }
          }}
          onKeyDown={event => {
            if (
              event.ctrlKey &&
              event.key === "Enter"
            ) {
              event.preventDefault();

              if (canConfirmCash) {
                void submitCash();
              }
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="payment-due">
              <span>
                {recovering
                  ? "Saved payment · " +
                    (
                      pendingPayment
                        ? paymentMethodLabel(
                            pendingPayment.method,
                          )
                        : "Recovery"
                    )
                  : "Amount payable"}
              </span>

              <strong>
                {money(displayedTotal)}
              </strong>
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
                  {quickAmounts.map(amount => (
                    <button
                      key={amount}
                      type="button"
                      className={
                        tendered === amount * 100
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setCash(
                          addCashDenomination(
                            cash,
                            amount,
                          ),
                        )
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
                    onClick={() =>
                      setCash("")
                    }
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
                    onChange={event =>
                      setCash(
                        event.target.value,
                      )
                    }
                    placeholder="Enter amount given"
                    required
                  />
                </label>
              </>
            )}

            {recovering && pendingPayment && (
              <dl className="sale-review">
                <div>
                  <dt>
                    Customer
                  </dt>

                  <dd>
                    {pendingPayment.customerName ||
                      "Walk-in customer"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Payment method
                  </dt>

                  <dd>
                    {paymentMethodLabel(
                      pendingPayment.method,
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
              </dl>
            )}

            <div className="payment-totals">
              <div>
                <span>
                  Total due
                </span>

                <strong>
                  {money(displayedTotal)}
                </strong>
              </div>

              <div>
                <span>
                  {recovering
                    ? "Original tendered amount"
                    : "Cash received"}
                </span>

                <strong>
                  {displayedTendered === null
                    ? "—"
                    : money(displayedTendered)}
                </strong>
              </div>

              <div>
                <span>
                  {recovering
                    ? "Original calculated change"
                    : "Change to give customer"}
                </span>

                <strong>
                  {
                    displayedChange === null ||
                    displayedChange < 0
                      ? "—"
                      : money(displayedChange)
                  }
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
                  Cash received is below the amount due.
                  Enter enough cash to continue.
                </p>
              )}

            {recovering && (
              <p className="notice pending">
                A previous payment confirmation was interrupted.
                Retry with the same transaction reference.
                Do not collect the payment or issue change again.

                <small className="code">
                  {pendingReference}
                </small>
              </p>
            )}

            {(error || feedback) && (
              <p
                className="notice error"
                role="alert"
              >
                {error || feedback}
              </p>
            )}

            <footer className="modal-actions">
              <button
                type="button"
                onClick={
                  recovering
                    ? close
                    : back
                }
              >
                <ArrowLeft size={15} />

                {recovering
                  ? "Close"
                  : "Back"}
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
        <NonCashPaymentPanel
          key={
            method +
            ":" +
            total +
            ":" +
            (
              bankAccount?.accountNumber ??
              ""
            )
          }
          mode={method}
          totalMinor={total}
          receivingAccount={bankAccount}
          customerName={customerName}
          busy={busy}
          error={error || feedback}
          onBack={() => {
            setFeedback("");
            back();
          }}
          onConfirm={pay}
        />
      )}
    </Modal>
  );
}