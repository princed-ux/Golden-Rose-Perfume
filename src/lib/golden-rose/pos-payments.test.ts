import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addCashDenomination,
  calculateTender,
  buildSalePayment,
  validSalePayment,
  receiptPaymentMatches,
  parsePaymentAmount,
  type SalePayment,
} from './pos-payments';

const bank = {
  bankName: 'Test bank',
  accountName: 'Test business',
  accountNumber: '0123456789',
};

test('repeated denominations add and exact kobo parsing rejects excessive decimals', () => {
  assert.equal(
    addCashDenomination(
      addCashDenomination('', 200),
      200,
    ),
    '400.00',
  );

  assert.equal(
    parsePaymentAmount('1,200.03'),
    120003,
  );

  assert.equal(
    parsePaymentAmount('1.001'),
    null,
  );

  assert.equal(
    addCashDenomination('5', -1),
    '5',
  );
});

test('legacy cash remains compatible and calculates change', () => {
  assert.deepEqual(
    buildSalePayment(
      100000,
      {
        cashMinor: 120000,
        transferMinor: 0,
        cardMinor: 0,
      },
      '',
      false,
      null,
    ),
    {
      method: 'cash',
      tenderedMinor: 120000,
    },
  );

  assert.equal(
    calculateTender(100000, {
      cashMinor: 120000,
      transferMinor: 0,
      cardMinor: 0,
    }).changeMinor,
    20000,
  );
});

test('split payment allocates one sale and calculates change from cash', () => {
  const p = {
    cashMinor: 30000,
    transferMinor: 50000,
    cardMinor: 30000,
  };

  const t = buildSalePayment(
    100000,
    p,
    'Buyer',
    true,
    bank,
  );

  assert.equal(t.method, 'split');

  assert.equal(
    calculateTender(100000, p).changeMinor,
    10000,
  );

  assert.equal(
    validSalePayment(t, 100000),
    true,
  );

  assert.equal(
    receiptPaymentMatches(
      {
        ...t,
        totalMinor: 100000,
        changeMinor: 10000,
      },
      t,
    ),
    true,
  );
});

test('bank details and manual confirmation are both required', () => {
  const p = {
    cashMinor: 0,
    transferMinor: 100000,
    cardMinor: 0,
  };

  assert.throws(() =>
    buildSalePayment(100000, p, '', true, null),
  );

  assert.throws(() =>
    buildSalePayment(100000, p, '', false, bank),
  );

  assert.equal(
    buildSalePayment(
      100000,
      p,
      '',
      true,
      bank,
    ).method,
    'bank_transfer',
  );
});

test('physical terminal works without a bank account but requires confirmation', () => {
  const p = {
    cashMinor: 0,
    transferMinor: 0,
    cardMinor: 100000,
  };

  assert.equal(
    buildSalePayment(
      100000,
      p,
      '',
      true,
      null,
    ).method,
    'card',
  );

  assert.throws(() =>
    buildSalePayment(100000, p, '', false, null),
  );
});

test('reject underpayment, negative allocations, excess noncash and invalid cash change', () => {
  for (const p of [
    {
      cashMinor: 0,
      transferMinor: 0,
      cardMinor: 50000,
    },
    {
      cashMinor: -1,
      transferMinor: 100000,
      cardMinor: 0,
    },
    {
      cashMinor: 0,
      transferMinor: 120000,
      cardMinor: 0,
    },
    {
      cashMinor: 10000,
      transferMinor: 100000,
      cardMinor: 0,
    },
  ]) {
    assert.throws(() =>
      buildSalePayment(
        100000,
        p,
        '',
        true,
        bank,
      ),
    );
  }
});

test('reject mismatched methods, allocations, customer names and change', () => {
  const t = buildSalePayment(
    100000,
    {
      cashMinor: 0,
      transferMinor: 0,
      cardMinor: 100000,
    },
    'Buyer',
    true,
    null,
  );

  assert.equal(
    validSalePayment(
      {
        ...t,
        method: 'cash',
      },
      100000,
    ),
    false,
  );

  assert.equal(
    receiptPaymentMatches(
      {
        ...t,
        payments: {
          cashMinor: 0,
          transferMinor: 100000,
          cardMinor: 0,
        },
        totalMinor: 100000,
        changeMinor: 0,
      },
      t,
    ),
    false,
  );

  assert.equal(
    receiptPaymentMatches(
      {
        ...t,
        customerName: 'Other',
        totalMinor: 100000,
        changeMinor: 0,
      },
      t,
    ),
    false,
  );

  assert.equal(
    receiptPaymentMatches(
      {
        ...t,
        totalMinor: 100000,
        changeMinor: 1,
      },
      t,
    ),
    false,
  );
});

test('legacy receipts accepted and optional names preserved for new sales', () => {
  const t: SalePayment = {
    method: 'cash',
    tenderedMinor: 120000,
  };

  assert.equal(
    receiptPaymentMatches(
      {
        ...t,
        totalMinor: 100000,
        changeMinor: 20000,
        customerName: null,
      },
      t,
    ),
    true,
  );

  const named = buildSalePayment(
    100000,
    {
      cashMinor: 100000,
      transferMinor: 0,
      cardMinor: 0,
    },
    ' Jane ',
    false,
    null,
  );

  assert.equal(named.customerName, 'Jane');
  assert.equal(named.method, 'cash');
});