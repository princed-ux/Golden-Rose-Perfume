/** Browser-safe Golden Rose POS payment rules.
 * All amounts are integer kobo.
 */

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'card'
  | 'split';

export type PaymentBreakdown = {
  cashMinor: number;
  transferMinor: number;
  cardMinor: number;
};

export type ReceivingAccount = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type SalePayment = {
  method: PaymentMethod;
  tenderedMinor: number;
  payments?: PaymentBreakdown;
  customerName?: string | null;
  manualConfirmed?: boolean;
};

export const CASH_DENOMINATIONS = [
  5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000,
] as const;

export const MAX_TENDER_MINOR = 9_999_999_999_999;

export function paymentMethodLabel(
  method: PaymentMethod,
): string {
  return (
    {
      cash: 'Cash',
      bank_transfer: 'Bank transfer',
      card: 'Card / POS terminal',
      split: 'Split payment',
    }[method] ?? 'Unknown payment method'
  );
}

export function isPaymentMethod(
  value: unknown,
): value is PaymentMethod {
  return (
    value === 'cash' ||
    value === 'bank_transfer' ||
    value === 'card' ||
    value === 'split'
  );
}

export function validReceivingAccount(
  value: unknown,
): value is ReceivingAccount {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const account = value as Partial<ReceivingAccount>;

  return (
    typeof account.bankName === 'string' &&
    account.bankName.trim().length > 0 &&
    typeof account.accountName === 'string' &&
    account.accountName.trim().length > 0 &&
    typeof account.accountNumber === 'string' &&
    /^\d{10}$/.test(account.accountNumber)
  );
}

export function parsePaymentAmount(
  value: string,
): number | null {
  const clean = value.trim().replaceAll(',', '');

  if (!clean) return 0;

  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(clean)) {
    return null;
  }

  const [whole, fraction = ''] = clean.split('.');

  const minor =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  return (
    Number.isSafeInteger(minor) &&
    minor <= MAX_TENDER_MINOR
  )
    ? minor
    : null;
}

export function addCashDenomination(
  value: string,
  naira: number,
): string {
  const before = parsePaymentAmount(value);

  if (
    before === null ||
    !Number.isSafeInteger(naira) ||
    naira <= 0
  ) {
    return value;
  }

  const next = before + naira * 100;

  return (
    Number.isSafeInteger(next) &&
    next <= MAX_TENDER_MINOR
  )
    ? (next / 100).toFixed(2)
    : value;
}

export function calculateTender(
  totalMinor: number,
  payments: PaymentBreakdown,
) {
  if (
    !Number.isSafeInteger(totalMinor) ||
    totalMinor <= 0 ||
    ![
      payments.cashMinor,
      payments.transferMinor,
      payments.cardMinor,
    ].every(
      value =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_TENDER_MINOR,
    )
  ) {
    throw new Error('Enter valid payment amounts.');
  }

  const {
    cashMinor,
    transferMinor,
    cardMinor,
  } = payments;

  const tenderedMinor =
    cashMinor + transferMinor + cardMinor;

  if (
    !Number.isSafeInteger(tenderedMinor) ||
    tenderedMinor > MAX_TENDER_MINOR ||
    transferMinor + cardMinor > totalMinor
  ) {
    throw new Error(
      'Non-cash payments cannot exceed the amount due.',
    );
  }

  const outstandingMinor = Math.max(
    0,
    totalMinor - tenderedMinor,
  );

  const changeMinor = Math.max(
    0,
    tenderedMinor - totalMinor,
  );

  const appliedCashMinor =
    cashMinor - changeMinor;

  if (
    appliedCashMinor < 0 ||
    (cashMinor > 0 && appliedCashMinor === 0)
  ) {
    throw new Error(
      'Cash change must come from cash used to pay this sale.',
    );
  }

  const used =
    Number(appliedCashMinor > 0) +
    Number(transferMinor > 0) +
    Number(cardMinor > 0);

  const method: PaymentMethod =
    used > 1
      ? 'split'
      : transferMinor > 0
        ? 'bank_transfer'
        : cardMinor > 0
          ? 'card'
          : 'cash';

  return {
    method,
    tenderedMinor,
    outstandingMinor,
    changeMinor,
    appliedCashMinor,
    complete: outstandingMinor === 0,
  };
}

function validName(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.length <= 120 &&
      !Array.from(value).some(
        char =>
          char.charCodeAt(0) < 32 ||
          char.charCodeAt(0) === 127,
      )
    )
  );
}

export function buildSalePayment(
  totalMinor: number,
  payments: PaymentBreakdown,
  customerName: string,
  manualConfirmed: boolean,
  receivingAccount:
    | ReceivingAccount
    | null
    | undefined,
): SalePayment {
  const result = calculateTender(
    totalMinor,
    payments,
  );

  const customer = customerName.trim();

  if (!validName(customer)) {
    throw new Error(
      'Enter a printable customer name of at most 120 characters.',
    );
  }

  if (!result.complete) {
    throw new Error(
      'The transaction is not fully paid.',
    );
  }

  if (
    payments.transferMinor > 0 &&
    !validReceivingAccount(receivingAccount)
  ) {
    throw new Error(
      'The owner must configure a receiving bank account.',
    );
  }

  if (
    payments.transferMinor +
      payments.cardMinor > 0 &&
    !manualConfirmed
  ) {
    throw new Error(
      'Confirm actual receipt of non-cash funds first.',
    );
  }

  // Preserve existing cash clients and pending references.

  if (result.method === 'cash' && !customer) {
    return {
      method: 'cash',
      tenderedMinor: result.tenderedMinor,
    };
  }

  return {
    method: result.method,
    tenderedMinor: result.tenderedMinor,
    payments: { ...payments },
    customerName: customer,
    manualConfirmed:
      payments.transferMinor +
        payments.cardMinor > 0,
  };
}

export function validSalePayment(
  value: SalePayment,
  totalMinor: number,
): boolean {
  try {
    if (
      !value ||
      !isPaymentMethod(value.method) ||
      !Number.isSafeInteger(totalMinor) ||
      totalMinor <= 0 ||
      !Number.isSafeInteger(value.tenderedMinor) ||
      value.tenderedMinor <= 0 ||
      value.tenderedMinor > MAX_TENDER_MINOR ||
      !validName(value.customerName)
    ) {
      return false;
    }

    if (value.payments === undefined) {
      return (
        value.method === 'cash' &&
        !value.customerName?.trim() &&
        value.tenderedMinor >= totalMinor
      );
    }

    const result = calculateTender(
      totalMinor,
      value.payments,
    );

    return (
      result.complete &&
      result.method === value.method &&
      result.tenderedMinor ===
        value.tenderedMinor &&
      (
        value.payments.transferMinor +
          value.payments.cardMinor === 0 ||
        value.manualConfirmed === true
      )
    );
  } catch {
    return false;
  }
}

export function receiptPaymentMatches(
  receipt: SalePayment & {
    changeMinor: number;
    totalMinor: number;
  },
  request: SalePayment,
): boolean {
  if (
    !validSalePayment(
      receipt,
      receipt.totalMinor,
    ) ||
    receipt.method !== request.method ||
    receipt.tenderedMinor !==
      request.tenderedMinor ||
    (receipt.customerName ?? '').trim() !==
      (request.customerName ?? '').trim() ||
    receipt.changeMinor !==
      receipt.tenderedMinor -
        receipt.totalMinor
  ) {
    return false;
  }

  if (!request.payments) {
    return (
      receipt.method === 'cash' &&
      (
        !receipt.payments ||
        (
          receipt.payments.cashMinor ===
            request.tenderedMinor &&
          receipt.payments.transferMinor === 0 &&
          receipt.payments.cardMinor === 0
        )
      )
    );
  }

  const payments = receipt.payments;

  return (
    !!payments &&
    payments.cashMinor ===
      request.payments.cashMinor &&
    payments.transferMinor ===
      request.payments.transferMinor &&
    payments.cardMinor ===
      request.payments.cardMinor
  );
}