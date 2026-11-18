import { useEffect, useRef, useState, type ReactNode } from "react";
import { Printer, X } from "lucide-react";
import { money, type PosReceipt } from "./domain";

export function Modal({
  title,
  close,
  busy = false,
  children,
  kicker,
  className = "",
}: {
  title: string;
  close: () => void;
  busy?: boolean;
  children: ReactNode;
  kicker?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + className}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <div>
          {kicker && <span className="eyebrow">{kicker}</span>}
          <h2>{title}</h2>
        </div>
        <button aria-label="Close dialog" disabled={busy} onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Receipt({
  receipt,
  close,
}: {
  receipt: PosReceipt;
  close: () => void;
}) {
  const [error, setError] = useState("");
  async function print() {
    try {
      const { isTauri, invoke } = await import("@tauri-apps/api/core");
      if (isTauri()) await invoke("print_receipt");
      else window.print();
    } catch {
      setError(
        "The print dialog could not be opened. Check the Windows printer setup.",
      );
    }
  }
  return (
    <Modal
      title="Receipt"
      kicker="Sale confirmed"
      close={close}
      className="receipt-modal"
    >
      <article className="receipt-paper" id="receipt-paper">
        <h2>GOLDEN ROSE</h2>
        <p>Perfume · Beauty of Fragrance</p>
        <p>{receipt.locationName}</p>
        <h3>Sales receipt #{receipt.saleNumber}</h3>
        <p>{new Date(receipt.createdAt).toLocaleString("en-NG")}</p>
        <dl>
          {receipt.items.map((item, index) => (
            <div key={item.variantId + index}>
              <dt>
                {item.name}
                <small>
                  {item.sku} · {item.quantity} × {money(item.unitPriceMinor)}
                </small>
              </dt>
              <dd>{money(item.lineTotalMinor)}</dd>
            </div>
          ))}
          <div>
            <dt>Subtotal</dt>
            <dd>{money(receipt.subtotalMinor)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{money(receipt.discountMinor)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{money(receipt.taxMinor)}</dd>
          </div>
          <div className="receipt-total">
            <dt>Total</dt>
            <dd>{money(receipt.totalMinor)}</dd>
          </div>
          <div>
            <dt>Cash received</dt>
            <dd>{money(receipt.tenderedMinor)}</dd>
          </div>
          <div>
            <dt>Change</dt>
            <dd>{money(receipt.changeMinor)}</dd>
          </div>
        </dl>
        <p className="code">{receipt.saleId}</p>
        <p>Thank you for shopping with Golden Rose.</p>
      </article>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="primary print-button" onClick={() => void print()}>
        <Printer size={17} />
        Print receipt
      </button>
    </Modal>
  );
}
