import {
  emptyRegister,
  UUID,
  validSaleRequest,
  type RegisterState,
  type SaleDraft,
  type PosProduct,
} from "./domain";

function validDraft(value: SaleDraft): boolean {
  return Boolean(
    value &&
      Array.isArray(value.lines) &&
      value.lines.length <= 40 &&
      typeof value.discount === "string" &&
      (value.locationId === null || UUID.test(value.locationId)) &&
      value.lines.every(
        (line) =>
          UUID.test(line.product?.id ?? "") &&
          typeof line.product.name === "string" &&
          Number.isSafeInteger(line.product.priceMinor) &&
          line.product.priceMinor > 0 &&
          line.product.currency === "NGN" &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0 &&
          line.quantity <= 100,
      ) &&
      new Set(value.lines.map((line) => line.product.id)).size ===
        value.lines.length &&
      (value.pending === null ||
        (validSaleRequest(value.pending) &&
          value.pending.locationId === value.locationId &&
          JSON.stringify(value.pending.items) ===
            JSON.stringify(
              value.lines.map((line) => ({
                variantId: line.product.id,
                quantity: line.quantity,
                expectedPriceMinor: line.product.priceMinor,
              })),
            ))),
  );
}

export function registerStorage(
  userId: string,
  storage: Storage = localStorage,
) {
  const key = "golden-rose-register-v1:" + userId;
  return {
    load(): RegisterState {
      const raw = storage.getItem(key);
      if (!raw) return emptyRegister();
      const state = JSON.parse(raw) as RegisterState;
      if (
        !validDraft(state.draft) ||
        !Array.isArray(state.held) ||
        !state.held.every((held) => validDraft(held.draft)) ||
        !Array.isArray(state.receipts)
      ) {
        throw new Error(
          "The saved register cannot be safely restored. Keep this device data and contact the owner.",
        );
      }
      return state;
    },
    save(state: RegisterState) {
      // Persist before dispatching any payment. Storage failure blocks checkout.
      storage.setItem(key, JSON.stringify(state));
    },
  };
}

export function reconcileStock(
  products: PosProduct[],
  draft: SaleDraft,
): SaleDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      const current = products.find(
        (product) => product.id === line.product.id,
      );
      return current ? { ...line, product: current } : line;
    }),
  };
}
