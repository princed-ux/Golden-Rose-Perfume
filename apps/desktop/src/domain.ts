// Shared, browser-safe business contracts.
// No Next.js runtime or server actions.

import { UUID } from "../../../src/lib/golden-rose/contracts";

import {
  validSalePayment,
} from "../../../src/lib/golden-rose/pos-payments";

export type {
  PosProduct,
  PosCatalogue,
  PosReceipt,
  CashSaleRequest,
} from "../../../app/workspace/pos/types";

export {
  ROLE_MODULES,
  canViewModule,
} from "../../../src/domain/permissions";

export {
  WORKSPACE_MODULES,
} from "../../../src/domain/modules";

export type {
  WorkspaceModuleId,
} from "../../../src/domain/modules";

export type {
  Role,
} from "../../../src/domain/types";

export {
  formatPrice as money,
  nairaToKobo,
  UUID,
} from "../../../src/lib/golden-rose/contracts";

import type {
  PosProduct,
  CashSaleRequest,
  PosReceipt,
} from "../../../app/workspace/pos/types";

export interface BasketLine {
  product: PosProduct;
  quantity: number;
}

export interface SaleDraft {
  lines: BasketLine[];
  discount: string;
  locationId: string | null;
  pending: CashSaleRequest | null;
}

export interface RegisterState {
  draft: SaleDraft;

  held: {
    id: string;
    createdAt: string;
    draft: SaleDraft;
  }[];

  receipts: PosReceipt[];
}

export const emptyDraft = (): SaleDraft => ({
  lines: [],
  discount: "",
  locationId: null,
  pending: null,
});

export const emptyRegister = (): RegisterState => ({
  draft: emptyDraft(),
  held: [],
  receipts: [],
});

export function validSaleRequest(
  value: CashSaleRequest,
): boolean {
  return Boolean(
    value &&

      UUID.test(value.idempotencyKey) &&
      UUID.test(value.locationId) &&

      Array.isArray(value.items) &&
      value.items.length > 0 &&
      value.items.length <= 40 &&

      Number.isSafeInteger(
        value.discountMinor,
      ) &&
      value.discountMinor >= 0 &&

      Number.isSafeInteger(
        value.tenderedMinor,
      ) &&
      value.tenderedMinor > 0 &&

      value.items.every(
        item =>
          UUID.test(item.variantId) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 100 &&
          Number.isSafeInteger(
            item.expectedPriceMinor,
          ) &&
          item.expectedPriceMinor > 0,
      ) &&

      new Set(
        value.items.map(
          item => item.variantId,
        ),
      ).size === value.items.length &&

      validSalePayment(
        value,
        value.items.reduce(
          (sum, item) =>
            sum +
            item.quantity *
              item.expectedPriceMinor,
          0,
        ) - value.discountMinor,
      ),
  );
}

export function addProduct(
  lines: BasketLine[],
  product: PosProduct,
): BasketLine[] {
  const existing = lines.find(
    line => line.product.id === product.id,
  );

  const quantity =
    (existing?.quantity ?? 0) + 1;

  if (
    !Number.isSafeInteger(product.available) ||
    product.available < quantity
  ) {
    throw new Error(
      "Insufficient verified stock at this store.",
    );
  }

  if (
    !Number.isSafeInteger(product.priceMinor) ||
    product.priceMinor <= 0 ||
    product.currency !== "NGN"
  ) {
    throw new Error(
      "This product does not have a valid NGN selling price.",
    );
  }

  if (quantity > 100) {
    throw new Error(
      "A sale line can contain at most 100 units.",
    );
  }

  if (!existing && lines.length >= 40) {
    throw new Error(
      "The current transaction API permits 40 different variants per sale.",
    );
  }

  return existing
    ? lines.map(
        line =>
          line.product.id === product.id
            ? {
                product,
                quantity,
              }
            : line,
      )
    : [
        ...lines,
        {
          product,
          quantity,
        },
      ];
}

export function saleTotals(
  lines: BasketLine[],
  discountMinor: number,
) {
  const subtotalMinor = lines.reduce(
    (sum, line) =>
      sum +
      line.quantity *
        line.product.priceMinor,
    0,
  );

  if (
    !Number.isSafeInteger(subtotalMinor) ||
    subtotalMinor < 0 ||
    !Number.isSafeInteger(discountMinor) ||
    discountMinor < 0 ||
    discountMinor > subtotalMinor
  ) {
    throw new Error(
      "Enter a discount between zero and the subtotal.",
    );
  }

  return {
    subtotalMinor,
    discountMinor,
    totalMinor:
      subtotalMinor - discountMinor,
  };
}

export function cashChange(
  totalMinor: number,
  tenderedMinor: number,
) {
  if (
    !Number.isSafeInteger(tenderedMinor) ||
    tenderedMinor <= 0 ||
    tenderedMinor < totalMinor
  ) {
    throw new Error(
      "Cash received must cover the total.",
    );
  }

  return tenderedMinor - totalMinor;
}

export function exactMatches(
  products: PosProduct[],
  code: string,
) {
  const normalized =
    code.trim().toLowerCase();

  return products.filter(
    product =>
      product.barcode?.toLowerCase() ===
        normalized ||

      product.sku?.toLowerCase() ===
        normalized,
  );
}

export function calculate(
  expression: string,
): number {
  // Deliberately parses one ordinary
  // arithmetic operation. Never evaluates code.

  const match =
    /^\s*(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
      expression,
    );

  if (!match) {
    throw new Error(
      "Enter an operation such as 12 × 3.",
    );
  }

  const left = Number(match[1]);
  const right = Number(match[3]);

  if (
    (
      match[2] === "/" ||
      match[2] === "÷"
    ) &&
    right === 0
  ) {
    throw new Error(
      "Cannot divide by zero.",
    );
  }

  const result =
    match[2] === "+"
      ? left + right
      : match[2] === "-"
        ? left - right
        : match[2] === "*" ||
            match[2] === "×"
          ? left * right
          : left / right;

  if (!Number.isFinite(result)) {
    throw new Error(
      "The result is outside the supported range.",
    );
  }

  return result;
}