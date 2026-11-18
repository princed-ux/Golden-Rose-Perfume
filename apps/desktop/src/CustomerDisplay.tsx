import { useEffect, useState } from "react";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { money } from "./domain";
import {
  emptyCustomerSale,
  parseCustomerSale,
  type CustomerSale,
} from "./customer-display";

export function CustomerDisplay({ channelId }: { channelId: string }) {
  const [sale, setSale] = useState(emptyCustomerSale);
  const count = sale.items.reduce((total, item) => total + item.quantity, 0);
  useEffect(() => {
    let alive = true;
    let lastUpdate = 0;
    let unsubscribe: (() => void) | undefined;
    const receive = (value: unknown) => {
      const next = parseCustomerSale(value);
      if (alive && next) {
        lastUpdate = Date.now();
        setSale(next);
      }
    };
    if (window.goldenRoseDisplay?.subscribe)
      unsubscribe = window.goldenRoseDisplay.subscribe(receive);
    else if (isTauri()) {
      void import("@tauri-apps/api/event").then(async ({ listen }) => {
        const stop = await listen<CustomerSale>(
          "golden-rose-customer-sale",
          (event) => receive(event.payload),
        );
        if (alive) unsubscribe = stop;
        else stop();
      });
    } else {
      const channel = new BroadcastChannel("golden-rose-display:" + channelId);
      channel.onmessage = (event) => receive(event.data);
      unsubscribe = () => channel.close();
    }
    const timeout = window.setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate > 5000) {
        lastUpdate = 0;
        setSale(emptyCustomerSale());
      }
    }, 1000);
    return () => {
      alive = false;
      unsubscribe?.();
      clearInterval(timeout);
    };
  }, [channelId]);

  return (
    <main className="customer-display">
      <header>
        <img src="/golden-rose-logo.png" alt="Golden Rose Perfume" />
        <div>
          <h1>Golden Rose Perfume</h1>
          <p>Beauty Of Fragrance</p>
        </div>
      </header>
      {sale.items.length ? (
        <div className="customer-sale">
          <section aria-label="Your items">
            <h2>
              {sale.status === "complete"
                ? "Thank you for shopping with us"
                : "Your fragrances"}
            </h2>
            <div className="customer-items">
              {sale.items.map((item, index) => (
                <article key={index}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>
                      {item.quantity} × {money(item.priceMinor)}
                    </p>
                  </div>
                  <strong>{money(item.quantity * item.priceMinor)}</strong>
                </article>
              ))}
            </div>
          </section>
          <aside>
            <ShoppingBag size={32} />
            <p>
              {count} {count === 1 ? "item" : "items"}
            </p>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(sale.subtotalMinor)}</dd>
              </div>
              {sale.discountMinor > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{money(sale.discountMinor)}</dd>
                </div>
              )}
            </dl>
            <span className="eyebrow">
              {sale.status === "complete" ? "Total paid" : "Your total"}
            </span>
            <strong className="customer-total">{money(sale.totalMinor)}</strong>
            {sale.status === "complete" ? (
              <p className="customer-paid">
                <CheckCircle2 size={19} />
                Payment confirmed
              </p>
            ) : sale.status === "confirming" ? (
              <p>Confirming your payment…</p>
            ) : (
              <p>Please review your items.</p>
            )}
          </aside>
        </div>
      ) : (
        <section className="customer-welcome">
          <span className="eyebrow">Welcome to Golden Rose</span>
          <h2>Find your signature fragrance.</h2>
          <p>Your selected fragrances will appear here.</p>
        </section>
      )}
      <footer>Thank you for choosing Golden Rose Perfume.</footer>
    </main>
  );
}
