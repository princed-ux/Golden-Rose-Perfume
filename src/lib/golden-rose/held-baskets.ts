/**
 * GOLDEN ROSE PERFUME
 *
 * Shared held-basket queue management.
 *
 * Holding a basket does not record a payment,
 * complete a sale or reserve inventory.
 *
 * This module is shared by the web and desktop registers.
 */

export const MAX_HELD_BASKETS = 100;

export interface HeldBasketIdentity {
  id: string;
  createdAt: string;
}

export interface HeldBasketResult<
  T extends HeldBasketIdentity,
> {
  basket: T;
  remaining: T[];
}

export function isHeldBasketIdentity(
  value: unknown,
): value is HeldBasketIdentity {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const basket =
    value as Partial<HeldBasketIdentity>;

  return (
    typeof basket.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      basket.id,
    ) &&

    typeof basket.createdAt === 'string' &&

    Number.isFinite(
      Date.parse(basket.createdAt),
    )
  );
}

/**
 * Validate the queue without modifying its contents.
 */

export function validateHeldBasketQueue<
  T extends HeldBasketIdentity,
>(
  baskets: readonly T[],
): void {
  if (!Array.isArray(baskets)) {
    throw new Error(
      'The held basket queue is invalid.',
    );
  }

  if (baskets.length > MAX_HELD_BASKETS) {
    throw new Error(
      'The held basket queue exceeds its supported capacity.',
    );
  }

  const ids = new Set<string>();

  for (const basket of baskets) {
    if (!isHeldBasketIdentity(basket)) {
      throw new Error(
        'A held basket has an invalid reference.',
      );
    }

    const id = basket.id.toLowerCase();

    if (ids.has(id)) {
      throw new Error(
        'Duplicate held basket references were detected.',
      );
    }

    ids.add(id);
  }
}

/**
 * Append a basket without mutating the current queue.
 *
 * Never replace or automatically delete an older basket
 * to make room for another transaction.
 */

export function appendHeldBasket<
  T extends HeldBasketIdentity,
>(
  baskets: readonly T[],
  basket: T,
): T[] {
  validateHeldBasketQueue(baskets);

  if (!isHeldBasketIdentity(basket)) {
    throw new Error(
      'The new basket has an invalid reference.',
    );
  }

  if (baskets.length >= MAX_HELD_BASKETS) {
    throw new Error(
      `A maximum of ${MAX_HELD_BASKETS} baskets can be held. Recall or remove a basket before continuing.`,
    );
  }

  if (
    baskets.some(
      item =>
        item.id.toLowerCase() ===
        basket.id.toLowerCase(),
    )
  ) {
    throw new Error(
      'This basket is already held.',
    );
  }

  return [
    ...baskets,
    basket,
  ];
}

/**
 * Retrieve a specific basket and return the remaining queue.
 *
 * The original queue remains unchanged until the calling
 * register successfully persists the replacement queue.
 */

export function takeHeldBasket<
  T extends HeldBasketIdentity,
>(
  baskets: readonly T[],
  id: string,
): HeldBasketResult<T> | null {
  if (!Array.isArray(baskets)) {
    return null;
  }

  if (
    typeof id !== 'string' ||
    !id.trim()
  ) {
    return null;
  }

  const matches = baskets.filter(
    basket => basket.id === id,
  );

  if (matches.length !== 1) {
    return null;
  }

  return {
    basket: matches[0],

    remaining: baskets.filter(
      basket => basket.id !== id,
    ),
  };
}