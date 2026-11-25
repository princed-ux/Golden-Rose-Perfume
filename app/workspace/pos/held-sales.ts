import type {
  PosProduct,
} from './types';

import {
  isHeldBasketIdentity,
  validateHeldBasketQueue,
  MAX_HELD_BASKETS,
} from '@/src/lib/golden-rose/held-baskets';

/**
 * GOLDEN ROSE PERFUME
 *
 * Browser register held-sale storage contracts.
 */

export const LEGACY_HELD_KEY =
  'golden-rose-pos-held-sale';

const HELD_KEY_PREFIX =
  'golden-rose-pos-held-sales-v2:';

const MAX_LINES = 40;
const MAX_QUANTITY = 100;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HeldSaleLine {
  product: PosProduct;
  quantity: number;
}

export interface HeldSale {
  id: string;
  createdAt: string;
  locationId: string;
  discount: string;
  cart: HeldSaleLine[];
}

/**
 * Each authenticated cashier has a separate storage key.
 *
 * The caller uses sessionStorage, which also scopes
 * the queue to the current browser tab.
 */

export function heldSalesKey(
  staffId: string,
): string {
  if (
    typeof staffId !== 'string' ||
    !UUID.test(staffId)
  ) {
    throw new Error(
      'An authenticated staff identity is required.',
    );
  }

  return HELD_KEY_PREFIX +
    staffId.toLowerCase();
}

function isNullableString(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    typeof value === 'string'
  );
}

function isProduct(
  value: unknown,
): value is PosProduct {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const product =
    value as Partial<PosProduct>;

  return (
    typeof product.id === 'string' &&
    UUID.test(product.id) &&

    typeof product.productId === 'string' &&
    UUID.test(product.productId) &&

    typeof product.name === 'string' &&
    product.name.trim().length > 0 &&

    isNullableString(product.brand) &&
    isNullableString(product.sku) &&
    isNullableString(product.barcode) &&
    isNullableString(product.imagePath) &&

    (
      product.sizeMl === null ||
      (
        typeof product.sizeMl === 'number' &&
        Number.isFinite(product.sizeMl) &&
        product.sizeMl >= 0
      )
    ) &&

    typeof product.priceMinor === 'number' &&
    Number.isSafeInteger(product.priceMinor) &&
    product.priceMinor > 0 &&

    product.currency === 'NGN' &&

    typeof product.available === 'number' &&
    Number.isSafeInteger(product.available) &&
    product.available >= 0
  );
}

function isSaleLine(
  value: unknown,
): value is HeldSaleLine {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const line =
    value as Partial<HeldSaleLine>;

  return (
    isProduct(line.product) &&

    typeof line.quantity === 'number' &&
    Number.isInteger(line.quantity) &&

    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY
  );
}

function isCart(
  value: unknown,
): value is HeldSaleLine[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_LINES ||
    !value.every(isSaleLine)
  ) {
    return false;
  }

  const ids = new Set(
    value.map(
      line =>
        line.product.id.toLowerCase(),
    ),
  );

  if (ids.size !== value.length) {
    return false;
  }

  const totalMinor = value.reduce(
    (sum, line) =>
      sum +
      line.quantity *
        line.product.priceMinor,
    0,
  );

  return (
    Number.isSafeInteger(totalMinor) &&
    totalMinor > 0
  );
}

function isDiscountDraft(
  value: unknown,
): value is string {
  // The discount remains an editable draft.
  // Final validation is performed during checkout.

  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isHeldSale(
  value: unknown,
): value is HeldSale {
  if (!isHeldBasketIdentity(value)) {
    return false;
  }

  const sale =
    value as Partial<HeldSale>;

  return (
    typeof sale.locationId === 'string' &&
    UUID.test(sale.locationId) &&

    isDiscountDraft(sale.discount) &&

    isCart(sale.cart)
  );
}

function copyCart(
  cart: readonly HeldSaleLine[],
): HeldSaleLine[] {
  return cart.map(line => ({
    quantity: line.quantity,

    product: {
      ...line.product,
    },
  }));
}

/**
 * Construct an independent basket snapshot.
 *
 * Cash tender and payment confirmation are intentionally
 * excluded. They must be entered again after recall.
 */

export function makeHeldSale(
  id: string,
  cart: readonly HeldSaleLine[],
  locationId: string,
  discount: string,
): HeldSale {
  const sale: HeldSale = {
    id,

    createdAt:
      new Date().toISOString(),

    locationId,
    discount,

    cart:
      copyCart(cart),
  };

  if (!isHeldSale(sale)) {
    throw new Error(
      'The basket cannot be held safely. Check its products, prices, quantities and selling location.',
    );
  }

  return sale;
}

/**
 * Restore the saved queue.
 *
 * Invalid records cause restoration to fail rather than
 * silently deleting baskets or replacing them with an
 * empty queue.
 */

export function parseHeldSales(
  raw: string | null,
): HeldSale[] {
  if (raw === null) {
    return [];
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'The saved held-basket data is not valid JSON.',
    );
  }

  if (
    !Array.isArray(value) ||
    value.length > MAX_HELD_BASKETS ||
    !value.every(isHeldSale)
  ) {
    throw new Error(
      'The saved held baskets could not be verified.',
    );
  }

  validateHeldBasketQueue(value);

  return value.map(sale => ({
    id:
      sale.id,

    createdAt:
      sale.createdAt,

    locationId:
      sale.locationId,

    discount:
      sale.discount,

    cart:
      copyCart(sale.cart),
  }));
}

/**
 * Convert the original single-held-sale format.
 *
 * The old register stored:
 *
 * cart
 * locationId
 * discount
 * cash
 * createdAt (numeric timestamp)
 *
 * Do not restore the old cash amount.
 */

export function parseLegacyHeldSale(
  raw: string,
  id: string,
): HeldSale {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'The previous held basket is unreadable.',
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'The previous held basket has an invalid format.',
    );
  }

  const legacy =
    parsed as Record<string, unknown>;

  if (
    !isCart(legacy.cart) ||

    typeof legacy.locationId !== 'string' ||
    !UUID.test(legacy.locationId) ||

    !isDiscountDraft(legacy.discount) ||

    typeof legacy.createdAt !== 'number' ||
    !Number.isFinite(legacy.createdAt)
  ) {
    throw new Error(
      'The previous held basket could not be verified.',
    );
  }

  const created =
    new Date(legacy.createdAt);

  if (
    !Number.isFinite(created.getTime())
  ) {
    throw new Error(
      'The previous basket has an invalid creation date.',
    );
  }

  const sale: HeldSale = {
    id,

    createdAt:
      created.toISOString(),

    locationId:
      legacy.locationId,

    discount:
      legacy.discount,

    cart:
      copyCart(legacy.cart),
  };

  if (!isHeldSale(sale)) {
    throw new Error(
      'The previous basket could not be converted safely.',
    );
  }

  return sale;
}