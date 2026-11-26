/**
 * GOLDEN ROSE PERFUME
 *
 * Shared calculations for wholesale sales.
 * All monetary values are integer kobo.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_UNITS = 2_147_483_647;

export const MAX_WHOLESALE_LINES = 100;

/* =========================================================
   WHOLESALE DATA CONTRACTS
   ========================================================= */

export interface WholesaleLineInput {
  lineId: string;
  variantId: string;
  packageId: string | null;
  unitsPerPackage: number;
  packageQuantity: number;
  retailUnitPriceMinor: number;
  agreedPackagePriceMinor?: number;
}

export interface WholesaleLine
  extends WholesaleLineInput {
  baseQuantity: number;
  packagePriceMinor: number;
  lineTotalMinor: number;
}

/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function integer(
  value: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      'Invalid wholesale quantity or money amount.',
    );
  }

  return value;
}

function id(value: string): string {
  if (
    typeof value !== 'string' ||
    !UUID.test(value)
  ) {
    throw new Error(
      'Invalid record reference.',
    );
  }

  return value.toLowerCase();
}

/* =========================================================
   EXACT NAIRA-TO-KOBO CONVERSION

   BigInt constructors preserve compatibility with
   the existing ES2017 TypeScript target.
   ========================================================= */

export function parseWholesaleMoney(
  value: string,
): number {
  const text =
    value.trim();

  if (
    !/^(?:\d{1,13}|\d{1,3}(?:,\d{3}){1,4})(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    throw new Error(
      'Enter a valid naira amount with no more than two decimal places.',
    );
  }

  const [whole, fraction = ''] =
    text
      .replaceAll(',', '')
      .split('.');

  const amount =
    BigInt(whole) *
      BigInt(100) +

    BigInt(
      fraction.padEnd(2, '0'),
    );

  return integer(
    Number(amount),
    0,
  );
}

/* =========================================================
   WHOLESALE PRODUCT CALCULATION

   Catalogue pricing is used unless an authorized
   negotiated package price has been supplied.

   Inventory always uses individual bottle quantities.
   ========================================================= */

export function calculateWholesaleLine(
  input: WholesaleLineInput,
): WholesaleLine {
  const lineId =
    id(input.lineId);

  const variantId =
    id(input.variantId);

  const packageId =
    input.packageId === null
      ? null
      : id(input.packageId);

  const factor =
    integer(
      input.unitsPerPackage,
      1,
      MAX_UNITS,
    );

  const count =
    integer(
      input.packageQuantity,
      1,
      MAX_UNITS,
    );

  if (
    packageId === null &&
    factor !== 1
  ) {
    throw new Error(
      'Individual bottles must have a conversion of one.',
    );
  }

  const retail =
    integer(
      input.retailUnitPriceMinor,
      1,
    );

  const baseQuantity =
    integer(
      factor * count,
      1,
      MAX_UNITS,
    );

  const packagePriceMinor =
    integer(
      input.agreedPackagePriceMinor ??
        retail * factor,
      1,
    );

  const lineTotalMinor =
    integer(
      packagePriceMinor * count,
      1,
    );

  return {
    ...input,

    lineId,

    variantId,

    packageId,

    baseQuantity,

    packagePriceMinor,

    lineTotalMinor,
  };
}

/* =========================================================
   COMPLETE WHOLESALE ORDER

   Combine individual bottle, pack and carton lines
   belonging to the same product variant before
   validating the actual stock requirements.
   ========================================================= */

export function calculateWholesaleOrder(
  inputs: readonly WholesaleLineInput[],

  discountMinor = 0,
) {
  if (
    !inputs.length ||
    inputs.length > MAX_WHOLESALE_LINES
  ) {
    throw new Error(
      'Enter between 1 and 100 order lines.',
    );
  }

  const seen =
    new Set<string>();

  const stockRequired =
    new Map<string, number>();

  let subtotalMinor = 0;

  let bottleCount = 0;

  const lines = inputs.map(input => {
    const line =
      calculateWholesaleLine(input);

    if (
      seen.has(line.lineId)
    ) {
      throw new Error(
        'Duplicate order line reference.',
      );
    }

    seen.add(line.lineId);

    subtotalMinor =
      integer(
        subtotalMinor +
          line.lineTotalMinor,
        1,
      );

    bottleCount =
      integer(
        bottleCount +
          line.baseQuantity,
        1,
      );

    stockRequired.set(
      line.variantId,

      integer(
        (
          stockRequired.get(
            line.variantId,
          ) ?? 0
        ) +
          line.baseQuantity,

        1,

        MAX_UNITS,
      ),
    );

    return line;
  });

  integer(
    discountMinor,

    0,

    subtotalMinor - 1,
  );

  return {
    lines,

    subtotalMinor,

    discountMinor,

    totalMinor:
      subtotalMinor - discountMinor,

    bottleCount,

    stockRequired: [
      ...stockRequired,
    ].map(
      ([variantId, quantity]) => ({
        variantId,

        quantity,
      }),
    ),
  };
}

/* =========================================================
   WHOLESALE PAYMENT AND BALANCE CALCULATION

   A typed payment amount is not payment evidence.

   Persistent financial records must use confirmed
   payments acknowledged by the transaction service.
   ========================================================= */

export function wholesaleBalance(
  totalMinor: number,

  paidMinor: number,
) {
  integer(
    totalMinor,
    1,
  );

  integer(
    paidMinor,
    0,
    totalMinor,
  );

  return {
    totalMinor,

    paidMinor,

    balanceMinor:
      totalMinor - paidMinor,

    status:
      paidMinor === 0

        ? 'unpaid' as const

        : paidMinor === totalMinor

          ? 'paid' as const

          : 'partially_paid' as const,
  };
}

/* =========================================================
   DISPATCH DATA CONTRACTS
   ========================================================= */

export interface DispatchLine {
  lineId: string;

  quantity: number;
}

/* =========================================================
   DISPATCH VALIDATION

   Quantities are individual bottles, including
   partial deliveries of a package.

   Historical sale lines retain their original
   package conversion and negotiated price.

   This validates proposed dispatch quantities.
   It does not reserve or deduct inventory.

   The current database integration supports
   complete-order dispatch.
   ========================================================= */

export function validateWholesaleDispatch(
  orderLines: readonly WholesaleLine[],

  previouslyDispatched:
    readonly DispatchLine[],

  proposed:
    readonly DispatchLine[],
) {
  if (
    !orderLines.length ||

    orderLines.length >
      MAX_WHOLESALE_LINES ||

    !proposed.length ||

    proposed.length >
      MAX_WHOLESALE_LINES
  ) {
    throw new Error(
      'Select items to dispatch.',
    );
  }

  const ordered =
    new Map<string, number>();

  for (const line of orderLines) {
    const verified =
      calculateWholesaleLine(line);

    if (
      verified.baseQuantity !==
        line.baseQuantity ||

      verified.packagePriceMinor !==
        line.packagePriceMinor ||

      verified.lineTotalMinor !==
        line.lineTotalMinor ||

      ordered.has(
        verified.lineId,
      )
    ) {
      throw new Error(
        'Invalid saved wholesale order.',
      );
    }

    ordered.set(
      verified.lineId,

      verified.baseQuantity,
    );
  }

  const dispatched =
    new Map<string, number>();

  const apply = (
    entry: DispatchLine,
  ) => {
    const key =
      id(entry.lineId);

    const max =
      ordered.get(key);

    if (max === undefined) {
      throw new Error(
        'Dispatch line does not belong to this order.',
      );
    }

    const count =
      integer(
        entry.quantity,

        1,

        max,
      );

    const sum =
      integer(
        (
          dispatched.get(key) ?? 0
        ) + count,

        1,

        max,
      );

    dispatched.set(
      key,

      sum,
    );
  };

  previouslyDispatched.forEach(
    apply,
  );

  proposed.forEach(
    apply,
  );

  const remaining = [
    ...ordered,
  ].map(
    ([lineId, quantity]) => ({
      lineId,

      quantity:
        quantity -
        (
          dispatched.get(lineId) ?? 0
        ),
    }),
  );

  return {
    remaining,

    status:
      remaining.every(
        line => line.quantity === 0,
      )

        ? 'dispatched' as const

        : 'partially_dispatched' as const,
  };
}