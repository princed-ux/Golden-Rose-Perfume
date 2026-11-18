import { isTauri } from "@tauri-apps/api/core";
import { UUID, type BasketLine } from "./domain";

export interface CustomerSale {
  status: "shopping" | "confirming" | "complete" | "idle";
  items: { name: string; quantity: number; priceMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}

export const emptyCustomerSale = (): CustomerSale => ({
  status: "idle",
  items: [],
  subtotalMinor: 0,
  discountMinor: 0,
  totalMinor: 0,
});

export function displayChannelId(): string {
  try {
    const existing = sessionStorage.getItem("golden-rose-customer-display");
    if (existing && UUID.test(existing)) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("golden-rose-customer-display", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// An explicit allowlist keeps account data, tokens, stock and internal IDs off the second screen.
export function customerSale(
  lines: {
    product: Pick<BasketLine["product"], "name" | "priceMinor">;
    quantity: number;
  }[],
  subtotalMinor: number,
  discountMinor: number,
  totalMinor: number,
  status: CustomerSale["status"],
): CustomerSale {
  return {
    status,
    items: lines.map((line) => ({
      name: line.product.name,
      quantity: line.quantity,
      priceMinor: line.product.priceMinor,
    })),
    subtotalMinor,
    discountMinor,
    totalMinor,
  };
}

export function parseCustomerSale(value: unknown): CustomerSale | null {
  if (!value || typeof value !== "object") return null;
  const sale = value as CustomerSale;
  if (
    !["shopping", "confirming", "complete", "idle"].includes(sale.status) ||
    !Array.isArray(sale.items) ||
    sale.items.length > 40 ||
    ![sale.subtotalMinor, sale.discountMinor, sale.totalMinor].every(
      (amount) => Number.isSafeInteger(amount) && amount >= 0,
    ) ||
    sale.items.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.name !== "string" ||
        item.name.length > 300 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100 ||
        !Number.isSafeInteger(item.priceMinor) ||
        item.priceMinor < 0,
    )
  )
    return null;
  return {
    status: sale.status,
    items: sale.items.map(({ name, quantity, priceMinor }) => ({
      name,
      quantity,
      priceMinor,
    })),
    subtotalMinor: sale.subtotalMinor,
    discountMinor: sale.discountMinor,
    totalMinor: sale.totalMinor,
  };
}

declare global {
  interface Window {
    goldenRoseDisplay?: {
      open?: () => Promise<void>;
      publish?: (sale: CustomerSale) => void;
      subscribe?: (listener: (sale: CustomerSale) => void) => () => void;
    };
  }
}

export function displayPublisher(channelId: string) {
  let current = emptyCustomerSale();
  const channel =
    !isTauri() && !window.goldenRoseDisplay
      ? new BroadcastChannel("golden-rose-display:" + channelId)
      : null;
  async function publish(sale: CustomerSale) {
    current = sale;
    if (window.goldenRoseDisplay?.publish)
      window.goldenRoseDisplay.publish(sale);
    else if (isTauri()) {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo("customer-display", "golden-rose-customer-sale", sale).catch(
        () => undefined,
      );
    } else channel?.postMessage(sale);
  }
  const heartbeat = window.setInterval(() => void publish(current), 1000);
  return {
    publish,
    dispose() {
      clearInterval(heartbeat);
      void publish(emptyCustomerSale());
      channel?.close();
    },
  };
}

export async function openCustomerDisplay(channelId: string) {
  if (window.goldenRoseDisplay?.open) return window.goldenRoseDisplay.open();
  const url = "/?customer-display=" + encodeURIComponent(channelId);
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel("customer-display");
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    const { availableMonitors, currentMonitor } = await import(
      "@tauri-apps/api/window"
    );
    const monitors = await availableMonitors();
    const main = await currentMonitor();
    const second = monitors.find(
      (monitor) =>
        monitor.position.x !== main?.position.x ||
        monitor.position.y !== main?.position.y,
    );
    const position = second?.position.toLogical(second.scaleFactor);
    const window = new WebviewWindow("customer-display", {
      url,
      title: "Golden Rose — Customer Display",
      width: 1100,
      height: 760,
      incognito: true,
      ...(position ? { x: position.x, y: position.y, fullscreen: true } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      void window.once("tauri://created", () => resolve());
      void window.once("tauri://error", () =>
        reject(new Error("Customer display could not be opened.")),
      );
    });
    return;
  }
  const display = window.open(
    url,
    "golden-rose-customer-" + channelId,
    "popup,width=1100,height=760",
  );
  if (!display)
    throw new Error(
      "Allow pop-up windows to open the customer display, then move it to the second monitor.",
    );
  display.opener = null;
  display.focus();
}
