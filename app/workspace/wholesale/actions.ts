'use server';

import { revalidatePath } from 'next/cache';

import {
  UUID,
} from '@/src/lib/golden-rose/contracts';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  calculateWholesaleOrder,
  wholesaleBalance,
  type WholesaleLineInput,
} from '@/src/lib/golden-rose/wholesale';

/* =========================================================
   GOLDEN ROSE PERFUME — WHOLESALE AND DISTRIBUTION
   ========================================================= */

export type WholesalePaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'card';

type Failure = {
  ok: false;
  message: string;
};

export type WholesaleResult<T> =
  | {
      ok: true;
      data: T;
    }
  | Failure;

export interface WholesaleLocation {
  id: string;
  name: string;
  code: string;
}

export interface WholesaleLocations {
  items: WholesaleLocation[];
  canSell: boolean;
  canDispatch: boolean;
}

export interface WholesalePackage {
  id: string;
  unitName: string;
  unitsPerPackage: number;
}

export interface WholesaleProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sizeMl: number | null;
  priceMinor: number;
  available: number;
  packages: WholesalePackage[];
}

export interface WholesaleCatalogue {
  items: WholesaleProduct[];
  hasMore: boolean;
}

export interface WholesaleOrderRecord {
  id: string;
  location_id: string;
  business_name: string;
  contact: string;
  delivery_address: string;
  notes: string;
  currency: 'NGN';
  created_by: string;
  created_at: string;
  dispatched_at: string | null;
  dispatched_by: string | null;

  /*
   * Financial information is omitted for employees
   * who have dispatch permission only.
   */

  total_minor?: number;
  paid_minor?: number;
  balance_minor?: number;

  payment_status?:
    | 'unpaid'
    | 'partially_paid'
    | 'paid';
}

export interface WholesaleSavedLine {
  order_id: string;
  line_id: string;
  line_number: number;
  variant_id: string;
  package_id: string | null;
  product_name: string;
  sku: string | null;
  unit_name: string;
  units_per_package: number;
  package_quantity: number;
  base_quantity: number;

  retail_unit_price_minor?: number;
  package_price_minor?: number;
  line_total_minor?: number;
}

export interface WholesalePaymentRecord {
  id: string;
  order_id: string;
  amount_minor: number;
  method: WholesalePaymentMethod;
  reference: string;
  recorded_by: string;
  created_at: string;
}

export interface WholesaleStockMovement {
  variantId: string;
  quantity: number;
  movementId: string;
}

export interface WholesaleDispatchRecord {
  id: string;
  order_id: string;
  performed_by: string;
  movements: WholesaleStockMovement[];
  created_at: string;
}

export interface WholesaleDetails {
  order: WholesaleOrderRecord;
  lines: WholesaleSavedLine[];
  payments: WholesalePaymentRecord[];
  dispatches: WholesaleDispatchRecord[];
}

export interface WholesaleOrders {
  items: WholesaleOrderRecord[];
  hasMore: boolean;
}

export interface CreateWholesaleInput {
  orderId: string;
  locationId: string;
  businessName: string;
  contact?: string;
  deliveryAddress?: string;
  notes?: string;
  lines: WholesaleLineInput[];
  initialPaymentMinor: number;
  paymentMethod?: WholesalePaymentMethod | null;
  paymentReference?: string;
  paymentConfirmed: boolean;
  dispatchNow: boolean;
}

export interface AdditionalPaymentInput {
  orderId: string;
  paymentId: string;
  amountMinor: number;
  method: WholesalePaymentMethod;
  reference?: string;
  confirmed: boolean;
}

export interface DispatchWholesaleInput {
  orderId: string;
  dispatchId: string;
}

/* =========================================================
   SHARED VALIDATION
   ========================================================= */

function failed(message: string): Failure {
  return {
    ok: false,
    message,
  };
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function validId(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    UUID.test(value)
  );
}

function integer(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

function validDate(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(
      Date.parse(value),
    )
  );
}

function nullableString(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    typeof value === 'string'
  );
}

function validMethod(
  value: unknown,
): value is WholesalePaymentMethod {
  return (
    value === 'cash' ||
    value === 'bank_transfer' ||
    value === 'card'
  );
}

function cleanText(
  value: unknown,
  max: number,
  required = false,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new Error(
        'A required field is missing.',
      );
    }

    return '';
  }

  if (typeof value !== 'string') {
    throw new Error(
      'A text field contains an invalid value.',
    );
  }

  const cleaned = value.trim();

  if (
    cleaned.length > max ||

    (
      required &&
      cleaned.length < 2
    ) ||

    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(
      cleaned,
    )
  ) {
    throw new Error(
      'Check the business and transaction details.',
    );
  }

  return cleaned;
}

/* =========================================================
   AUTHENTICATED DATABASE REQUEST
   ========================================================= */

type WholesaleAction =
  | 'locations'
  | 'catalogue'
  | 'list'
  | 'detail'
  | 'create'
  | 'payment'
  | 'dispatch';

async function requestWholesale(
  action: WholesaleAction,
  payload: Record<string, unknown> = {},
): Promise<
  WholesaleResult<Record<string, unknown>>
> {
  try {
    const staff = await getStaffAccess();

    if ('reason' in staff) {
      return failed(
        'An active employee session is required.',
      );
    }

    /*
     * Authentication is checked here.
     *
     * Individual module permissions, assigned location,
     * current product prices and stock authorization
     * are enforced by the database RPC.
     */

    const client = await createClient();

    const {
      data,
      error,
    } = await client.rpc(
      'gr_wholesale',
      {
        p_action: action,
        p_payload: payload,
      },
    );

    if (error) {
      if (
        error.code === '42501' ||
        error.code === 'GR403'
      ) {
        return failed(
          'Your account does not have permission to perform this wholesale operation.',
        );
      }

      if (error.code === 'P0002') {
        return failed(
          'The requested wholesale sale was not found.',
        );
      }

      if (error.code === '23514') {
        return failed(
          'The transaction violates stock or financial constraints. Check available inventory and payment amounts.',
        );
      }

      if (
        error.code === '40001' ||
        error.code === '40P01'
      ) {
        return failed(
          'Another transaction is updating these records. Retry using the same transaction reference.',
        );
      }

      if (error.code === '23505') {
        return failed(
          'A transaction reference conflicts with an existing record. Check the original transaction before retrying.',
        );
      }

      if (error.code === '22023') {
        return failed(
          typeof error.message === 'string'
            ? error.message.slice(0, 220)
            : 'Check the wholesale transaction details.',
        );
      }

      if (
        error.code === '22P02' ||
        error.code === '22003'
      ) {
        return failed(
          'One or more quantities, prices or references are invalid.',
        );
      }

      console.error(
        '[Golden Rose wholesale]',
        {
          action,
          code: error.code,
        },
      );

      return failed(
        'The wholesale service is unavailable. Check the database connection and retry the original reference.',
      );
    }

    const result = record(data);

    if (!result || result.ok !== true) {
      return failed(
        'The wholesale transaction response could not be verified.',
      );
    }

    return {
      ok: true,
      data: result,
    };

  } catch {
    return failed(
      'The wholesale operation could not be confirmed. Check the original transaction before trying again.',
    );
  }
}

/* =========================================================
   SELLING LOCATIONS
   ========================================================= */

function validLocation(
  value: unknown,
): value is WholesaleLocation {
  const item = record(value);

  return Boolean(
    item &&
    validId(item.id) &&
    typeof item.name === 'string' &&
    typeof item.code === 'string',
  );
}

export async function loadWholesaleLocations(): Promise<
  WholesaleResult<WholesaleLocations>
> {
  const result =
    await requestWholesale('locations');

  if (!result.ok) {
    return result;
  }

  const {
    items,
    canSell,
    canDispatch,
  } = result.data;

  if (
    !Array.isArray(items) ||
    !items.every(validLocation) ||

    typeof canSell !== 'boolean' ||

    typeof canDispatch !== 'boolean'
  ) {
    return failed(
      'The authorized selling locations could not be verified.',
    );
  }

  return {
    ok: true,

    data: {
      items,
      canSell,
      canDispatch,
    },
  };
}

/* =========================================================
   PRODUCT CATALOGUE AND PACKAGING
   ========================================================= */

function validPackage(
  value: unknown,
): value is WholesalePackage {
  const item = record(value);

  return Boolean(
    item &&
    validId(item.id) &&

    typeof item.unitName === 'string' &&

    integer(
      item.unitsPerPackage,
      2,
      100_000,
    ),
  );
}

function validProduct(
  value: unknown,
): value is WholesaleProduct {
  const item = record(value);

  if (!item) {
    return false;
  }

  return (
    validId(item.id) &&

    typeof item.name === 'string' &&

    nullableString(item.sku) &&

    nullableString(item.barcode) &&

    (
      item.sizeMl === null ||

      (
        typeof item.sizeMl === 'number' &&
        Number.isFinite(item.sizeMl) &&
        item.sizeMl >= 0
      )
    ) &&

    integer(item.priceMinor, 1) &&

    integer(
      item.available,
      0,
      2_147_483_647,
    ) &&

    Array.isArray(item.packages) &&

    item.packages.every(validPackage)
  );
}

export async function loadWholesaleCatalogue(
  locationId: string,
  search = '',
  offset = 0,
): Promise<
  WholesaleResult<WholesaleCatalogue>
> {
  if (
    !validId(locationId) ||

    typeof search !== 'string' ||

    search.trim().length > 100 ||

    !integer(offset, 0, 10_000)
  ) {
    return failed(
      'Select a valid location and product search.',
    );
  }

  const result =
    await requestWholesale(
      'catalogue',
      {
        locationId,
        search: search.trim(),
        offset,
      },
    );

  if (!result.ok) {
    return result;
  }

  const {
    items,
    hasMore,
  } = result.data;

  if (
    !Array.isArray(items) ||

    items.length > 50 ||

    !items.every(validProduct) ||

    typeof hasMore !== 'boolean'
  ) {
    return failed(
      'The wholesale catalogue could not be verified.',
    );
  }

  return {
    ok: true,

    data: {
      items,
      hasMore,
    },
  };
}

/* =========================================================
   VERIFY PERSISTED SALES RECORDS
   ========================================================= */

function validOrder(
  value: unknown,
): value is WholesaleOrderRecord {
  const item = record(value);

  if (
    !item ||

    !validId(item.id) ||

    !validId(item.location_id) ||

    !validId(item.created_by) ||

    typeof item.business_name !== 'string' ||

    typeof item.contact !== 'string' ||

    typeof item.delivery_address !== 'string' ||

    typeof item.notes !== 'string' ||

    item.currency !== 'NGN' ||

    !validDate(item.created_at) ||

    (
      item.dispatched_at !== null &&
      !validDate(item.dispatched_at)
    ) ||

    (
      item.dispatched_by !== null &&
      !validId(item.dispatched_by)
    ) ||

    (
      (item.dispatched_at === null) !==
      (item.dispatched_by === null)
    )
  ) {
    return false;
  }

  /*
   * Dispatch-only users do not receive
   * financial information.
   */

  if (
    item.total_minor === undefined &&
    item.paid_minor === undefined &&
    item.balance_minor === undefined
  ) {
    return item.payment_status === undefined;
  }

  if (
    !integer(item.total_minor, 1) ||

    !integer(
      item.paid_minor,
      0,
      item.total_minor,
    ) ||

    !integer(item.balance_minor)
  ) {
    return false;
  }

  const balance =
    wholesaleBalance(
      item.total_minor,
      item.paid_minor,
    );

  return (
    item.balance_minor ===
      balance.balanceMinor &&

    (
      item.payment_status === undefined ||

      item.payment_status === balance.status
    )
  );
}

/* =========================================================
   VERIFY SAVED PRODUCT LINES
   ========================================================= */

function validSavedLine(
  value: unknown,
): value is WholesaleSavedLine {
  const line = record(value);

  if (
    !line ||

    !validId(line.order_id) ||

    !validId(line.line_id) ||

    !validId(line.variant_id) ||

    (
      line.package_id !== null &&
      !validId(line.package_id)
    ) ||

    !integer(line.line_number, 1, 100) ||

    typeof line.product_name !== 'string' ||

    !nullableString(line.sku) ||

    typeof line.unit_name !== 'string' ||

    !integer(
      line.units_per_package,
      1,
      100_000,
    ) ||

    !integer(
      line.package_quantity,
      1,
      1_000_000,
    ) ||

    !integer(
      line.base_quantity,
      1,
      1_000_000,
    ) ||

    line.base_quantity !==
      line.units_per_package *
      line.package_quantity ||

    (
      line.package_id === null &&
      line.units_per_package !== 1
    )
  ) {
    return false;
  }

  if (
    line.retail_unit_price_minor === undefined &&
    line.package_price_minor === undefined &&
    line.line_total_minor === undefined
  ) {
    return true;
  }

  return (
    integer(
      line.retail_unit_price_minor,
      1,
    ) &&

    integer(
      line.package_price_minor,
      1,
    ) &&

    integer(
      line.line_total_minor,
      1,
    ) &&

    line.line_total_minor ===
      line.package_price_minor *
      line.package_quantity
  );
}

function validPayment(
  value: unknown,
): value is WholesalePaymentRecord {
  const item = record(value);

  return Boolean(
    item &&

    validId(item.id) &&

    validId(item.order_id) &&

    validId(item.recorded_by) &&

    integer(item.amount_minor, 1) &&

    validMethod(item.method) &&

    typeof item.reference === 'string' &&

    validDate(item.created_at),
  );
}

function validMovement(
  value: unknown,
): value is WholesaleStockMovement {
  const item = record(value);

  return Boolean(
    item &&

    validId(item.variantId) &&

    validId(item.movementId) &&

    integer(
      item.quantity,
      1,
      1_000_000,
    ),
  );
}

function validDispatch(
  value: unknown,
): value is WholesaleDispatchRecord {
  const item = record(value);

  return Boolean(
    item &&

    validId(item.id) &&

    validId(item.order_id) &&

    validId(item.performed_by) &&

    validDate(item.created_at) &&

    Array.isArray(item.movements) &&

    item.movements.length > 0 &&

    item.movements.every(validMovement),
  );
}

/* =========================================================
   COMPLETE WHOLESALE TRANSACTION VALIDATION
   ========================================================= */

function parseDetails(
  data: Record<string, unknown>,
  expectedOrderId: string,
): WholesaleDetails | null {
  const {
    order,
    lines,
    payments,
    dispatches,
  } = data;

  if (
    !validOrder(order) ||

    order.id.toLowerCase() !==
      expectedOrderId.toLowerCase() ||

    !Array.isArray(lines) ||

    lines.length < 1 ||

    lines.length > 100 ||

    !lines.every(validSavedLine) ||

    !Array.isArray(payments) ||

    !payments.every(validPayment) ||

    !Array.isArray(dispatches) ||

    dispatches.length > 1 ||

    !dispatches.every(validDispatch)
  ) {
    return null;
  }

  const lineIds = new Set(
    lines.map(line => line.line_id),
  );

  const paymentIds = new Set(
    payments.map(payment => payment.id),
  );

  if (
    lineIds.size !== lines.length ||

    paymentIds.size !== payments.length ||

    lines.some(
      line => line.order_id !== order.id,
    ) ||

    payments.some(
      payment => payment.order_id !== order.id,
    ) ||

    dispatches.some(
      dispatch => dispatch.order_id !== order.id,
    ) ||

    (
      (order.dispatched_at !== null) !==
      (dispatches.length === 1)
    )
  ) {
    return null;
  }

  if (order.total_minor !== undefined) {
    if (
      lines.some(
        line =>
          line.line_total_minor === undefined,
      )
    ) {
      return null;
    }

    const total = lines.reduce(
      (sum, line) =>
        sum + (line.line_total_minor ?? 0),
      0,
    );

    const paid = payments.reduce(
      (sum, payment) =>
        sum + payment.amount_minor,
      0,
    );

    if (
      !Number.isSafeInteger(total) ||

      !Number.isSafeInteger(paid) ||

      total !== order.total_minor ||

      paid !== order.paid_minor
    ) {
      return null;
    }

  } else {
    if (
      payments.length > 0 ||

      lines.some(
        line =>
          line.package_price_minor !== undefined ||

          line.retail_unit_price_minor !== undefined ||

          line.line_total_minor !== undefined,
      )
    ) {
      return null;
    }
  }

  /*
   * Verify the confirmed dispatch movement quantities
   * against the original order's grouped bottle counts.
   */

  if (dispatches.length === 1) {
    const expected = new Map<string, number>();

    for (const line of lines) {
      expected.set(
        line.variant_id,

        (
          expected.get(line.variant_id) ?? 0
        ) + line.base_quantity,
      );
    }

    const actual = new Map<string, number>();

    const movementIds = new Set<string>();

    for (const movement of dispatches[0].movements) {
      if (
        movementIds.has(movement.movementId) ||

        actual.has(movement.variantId)
      ) {
        return null;
      }

      movementIds.add(movement.movementId);

      actual.set(
        movement.variantId,
        movement.quantity,
      );
    }

    if (
      actual.size !== expected.size ||

      [...expected].some(
        ([variantId, quantity]) =>
          actual.get(variantId) !== quantity,
      )
    ) {
      return null;
    }
  }

  return {
    order,
    lines,
    payments,
    dispatches,
  };
}

/* =========================================================
   WHOLESALE SALES HISTORY
   ========================================================= */

export async function loadWholesaleOrders(
  search = '',
  offset = 0,
  locationId?: string,
): Promise<
  WholesaleResult<WholesaleOrders>
> {
  if (
    typeof search !== 'string' ||

    search.trim().length > 100 ||

    !integer(offset, 0, 10_000) ||

    (
      locationId !== undefined &&
      !validId(locationId)
    )
  ) {
    return failed(
      'Invalid wholesale sales filters.',
    );
  }

  const result =
    await requestWholesale(
      'list',
      {
        search: search.trim(),
        offset,
        locationId: locationId ?? null,
      },
    );

  if (!result.ok) {
    return result;
  }

  const {
    items,
    hasMore,
  } = result.data;

  if (
    !Array.isArray(items) ||

    items.length > 50 ||

    !items.every(validOrder) ||

    typeof hasMore !== 'boolean'
  ) {
    return failed(
      'The wholesale sales history could not be verified.',
    );
  }

  return {
    ok: true,

    data: {
      items,
      hasMore,
    },
  };
}

export async function loadWholesaleDetails(
  orderId: string,
): Promise<
  WholesaleResult<WholesaleDetails>
> {
  if (!validId(orderId)) {
    return failed(
      'Invalid wholesale sale reference.',
    );
  }

  const result =
    await requestWholesale(
      'detail',
      { orderId },
    );

  if (!result.ok) {
    return result;
  }

  const details =
    parseDetails(
      result.data,
      orderId,
    );

  if (!details) {
    return failed(
      'The wholesale sale details could not be verified.',
    );
  }

  return {
    ok: true,
    data: details,
  };
}

/* =========================================================
   REFRESH RELATED WORKSPACE PAGES
   ========================================================= */

function refreshWorkspace() {
  for (const path of [
    '/workspace/wholesale',
    '/workspace/dispatch',
    '/workspace/inventory',
    '/workspace/products',
    '/workspace',
  ]) {
    try {
      revalidatePath(path);

    } catch {
      /*
       * Cache refresh failure must not invalidate an
       * already confirmed financial transaction.
       */

      console.error(
        '[Golden Rose wholesale refresh]',
        { path },
      );
    }
  }
}

/* =========================================================
   CREATE A WHOLESALE SALE
   ========================================================= */

export async function createWholesaleSale(
  input: CreateWholesaleInput,
): Promise<
  WholesaleResult<WholesaleDetails>
> {
  if (
    !input ||

    !validId(input.orderId) ||

    !validId(input.locationId) ||

    !Array.isArray(input.lines) ||

    !integer(input.initialPaymentMinor) ||

    typeof input.paymentConfirmed !== 'boolean' ||

    typeof input.dispatchNow !== 'boolean'
  ) {
    return failed(
      'Complete the required wholesale sale details.',
    );
  }

  let calculation:
    ReturnType<typeof calculateWholesaleOrder>;

  let payload: Record<string, unknown>;

  try {
    calculation =
      calculateWholesaleOrder(input.lines);

    if (
      calculation.stockRequired.some(
        line => line.quantity > 1_000_000,
      ) ||

      calculation.lines.some(
        line =>
          line.unitsPerPackage > 100_000 ||
          line.packageQuantity > 1_000_000,
      )
    ) {
      return failed(
        'A product quantity exceeds the supported transaction limit.',
      );
    }

    wholesaleBalance(
      calculation.totalMinor,
      input.initialPaymentMinor,
    );

    if (
      input.initialPaymentMinor > 0 &&

      (
        !input.paymentConfirmed ||
        !validMethod(input.paymentMethod)
      )
    ) {
      return failed(
        'Select the payment method and confirm the amount has been received.',
      );
    }

    payload = {
      orderId:
        input.orderId.toLowerCase(),

      locationId:
        input.locationId.toLowerCase(),

      businessName:
        cleanText(
          input.businessName,
          180,
          true,
        ),

      contact:
        cleanText(input.contact, 254),

      deliveryAddress:
        cleanText(input.deliveryAddress, 500),

      notes:
        cleanText(input.notes, 1000),

      lines:
        calculation.lines.map(line => ({
          lineId: line.lineId,
          variantId: line.variantId,
          packageId: line.packageId,
          unitsPerPackage: line.unitsPerPackage,
          packageQuantity: line.packageQuantity,

          retailUnitPriceMinor:
            line.retailUnitPriceMinor,

          agreedPackagePriceMinor:
            line.agreedPackagePriceMinor ?? null,
        })),

      initialPaymentMinor:
        input.initialPaymentMinor,

      paymentMethod:
        input.initialPaymentMinor > 0
          ? input.paymentMethod
          : null,

      paymentConfirmed:
        input.initialPaymentMinor > 0
          ? input.paymentConfirmed
          : false,

      paymentReference:
        cleanText(input.paymentReference, 120),

      dispatchNow:
        input.dispatchNow,
    };

  } catch (error) {
    return failed(
      error instanceof Error
        ? error.message
        : 'Check the wholesale calculation.',
    );
  }

  /*
   * The caller must persist the orderId and original
   * request before sending a new transaction.
   *
   * An uncertain result must be retried with the
   * original reference and unchanged payload.
   */

  const result =
    await requestWholesale(
      'create',
      payload,
    );

  if (!result.ok) {
    return result;
  }

  const details =
    parseDetails(
      result.data,
      input.orderId,
    );

  if (
    !details ||

    details.order.location_id.toLowerCase() !==
      input.locationId.toLowerCase() ||

    details.order.total_minor !==
      calculation.totalMinor ||

    details.order.business_name !==
      payload.businessName ||

    details.order.paid_minor === undefined ||

    details.order.paid_minor <
      input.initialPaymentMinor ||

    (
      input.dispatchNow &&
      details.order.dispatched_at === null
    )
  ) {
    return failed(
      'The sale response does not match the requested transaction. Do not create another sale. Recover the original reference.',
    );
  }

  if (
    details.lines.length !==
    calculation.lines.length
  ) {
    return failed(
      'The saved product lines could not be confirmed. Recover the original sale reference.',
    );
  }

  const expectedLines = new Map(
    calculation.lines.map(
      line => [
        line.lineId,
        line,
      ],
    ),
  );

  for (const line of details.lines) {
    const expected =
      expectedLines.get(line.line_id);

    if (
      !expected ||

      line.variant_id !== expected.variantId ||

      line.package_id !== expected.packageId ||

      line.base_quantity !== expected.baseQuantity ||

      line.units_per_package !==
        expected.unitsPerPackage ||

      line.package_quantity !==
        expected.packageQuantity ||

      line.package_price_minor !==
        expected.packagePriceMinor ||

      line.line_total_minor !==
        expected.lineTotalMinor
    ) {
      return failed(
        'The saved packaging or selling price differs from the original request. Recover the original sale reference.',
      );
    }
  }

  if (input.initialPaymentMinor > 0) {
    const payment =
      details.payments.find(
        item =>
          item.id.toLowerCase() ===
          input.orderId.toLowerCase(),
      );

    if (
      !payment ||

      payment.amount_minor !==
        input.initialPaymentMinor ||

      payment.method !==
        input.paymentMethod ||

      payment.reference !==
        payload.paymentReference
    ) {
      return failed(
        'The initial payment could not be confirmed. Check the original transaction before accepting another payment.',
      );
    }
  }

  refreshWorkspace();

  return {
    ok: true,
    data: details,
  };
}

/* =========================================================
   RECORD ADDITIONAL PAYMENT
   ========================================================= */

export async function recordWholesalePayment(
  input: AdditionalPaymentInput,
): Promise<
  WholesaleResult<WholesaleDetails>
> {
  if (
    !input ||

    !validId(input.orderId) ||

    !validId(input.paymentId) ||

    !integer(input.amountMinor, 1) ||

    !validMethod(input.method) ||

    input.confirmed !== true
  ) {
    return failed(
      'Enter a valid confirmed payment.',
    );
  }

  let reference: string;

  try {
    reference =
      cleanText(input.reference, 120);

  } catch {
    return failed(
      'The payment reference is invalid.',
    );
  }

  const result =
    await requestWholesale(
      'payment',
      {
        orderId: input.orderId,

        paymentId: input.paymentId,

        amountMinor: input.amountMinor,

        method: input.method,

        reference,

        confirmed: true,
      },
    );

  if (!result.ok) {
    return result;
  }

  const details =
    parseDetails(
      result.data,
      input.orderId,
    );

  const payment =
    details?.payments.find(
      item =>
        item.id.toLowerCase() ===
        input.paymentId.toLowerCase(),
    );

  if (
    !details ||
    !payment ||

    payment.amount_minor !==
      input.amountMinor ||

    payment.method !==
      input.method ||

    payment.reference !== reference
  ) {
    return failed(
      'Payment recording could not be verified. Retry only with the original payment reference.',
    );
  }

  refreshWorkspace();

  return {
    ok: true,
    data: details,
  };
}

/* =========================================================
   CONFIRM WHOLESALE DISPATCH
   ========================================================= */

export async function confirmWholesaleDispatch(
  input: DispatchWholesaleInput,
): Promise<
  WholesaleResult<WholesaleDetails>
> {
  if (
    !input ||

    !validId(input.orderId) ||

    !validId(input.dispatchId)
  ) {
    return failed(
      'Invalid wholesale dispatch reference.',
    );
  }

  const result =
    await requestWholesale(
      'dispatch',
      {
        orderId: input.orderId,
        dispatchId: input.dispatchId,
      },
    );

  if (!result.ok) {
    return result;
  }

  const details =
    parseDetails(
      result.data,
      input.orderId,
    );

  const dispatch =
    details?.dispatches.find(
      item =>
        item.id.toLowerCase() ===
        input.dispatchId.toLowerCase(),
    );

  if (
    !details ||

    !dispatch ||

    details.order.dispatched_at === null
  ) {
    return failed(
      'Dispatch could not be confirmed. Check the existing transaction before attempting another stock deduction.',
    );
  }

  refreshWorkspace();

  return {
    ok: true,
    data: details,
  };
}