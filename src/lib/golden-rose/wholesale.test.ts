import { test } from 'node:test';

import assert from 'node:assert/strict';

import {
  calculateWholesaleLine,
  calculateWholesaleOrder,
  parseWholesaleMoney,
  validateWholesaleDispatch,
  wholesaleBalance,
  type WholesaleLineInput,
} from './wholesale';

const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const carton: WholesaleLineInput = {
  lineId: uid(1),
  variantId: uid(2),
  packageId: uid(3),
  unitsPerPackage: 24,
  packageQuantity: 2,
  retailUnitPriceMinor: 500_000,
};

test(
  'carton sales convert packaging to bottles and default to the catalogue price',
  () => {
    const result =
      calculateWholesaleLine(carton);

    assert.equal(
      result.baseQuantity,
      48,
    );

    assert.equal(
      result.packagePriceMinor,
      12_000_000,
    );

    assert.equal(
      result.lineTotalMinor,
      24_000_000,
    );
  },
);

test(
  'negotiated package pricing is separate from catalogue bottle pricing',
  () => {
    const result =
      calculateWholesaleLine({
        ...carton,

        agreedPackagePriceMinor:
          10_000_000,
      });

    assert.equal(
      result.lineTotalMinor,
      20_000_000,
    );

    assert.equal(
      result.retailUnitPriceMinor,
      500_000,
    );
  },
);

test(
  'individual and packaged sales of the same SKU aggregate stock requirements',
  () => {
    const order =
      calculateWholesaleOrder(
        [
          carton,

          {
            ...carton,

            lineId: uid(4),

            packageId: null,

            unitsPerPackage: 1,

            packageQuantity: 5,
          },
        ],

        500_000,
      );

    assert.equal(
      order.bottleCount,
      53,
    );

    assert.equal(
      order.totalMinor,
      26_000_000,
    );

    assert.deepEqual(
      order.stockRequired,

      [
        {
          variantId: carton.variantId,
          quantity: 53,
        },
      ],
    );
  },
);

test(
  'invalid conversion, quantities, amounts, IDs, duplicate lines and overflow fail',
  () => {
    for (const input of [
      {
        ...carton,
        packageId: null,
      },
      {
        ...carton,
        packageQuantity: 0,
      },
      {
        ...carton,
        unitsPerPackage: 1.5,
      },
      {
        ...carton,
        agreedPackagePriceMinor: -1,
      },
      {
        ...carton,
        variantId: 'bad',
      },
      {
        ...carton,
        retailUnitPriceMinor:
          Number.MAX_SAFE_INTEGER,
      },
    ]) {
      assert.throws(
        () => calculateWholesaleLine(input),
      );
    }

    assert.throws(
      () =>
        calculateWholesaleOrder([
          carton,
          carton,
        ]),
    );

    assert.throws(
      () =>
        calculateWholesaleOrder(
          [carton],
          24_000_000,
        ),
    );
  },
);

test(
  'naira amounts convert exactly to kobo and reject invalid input',
  () => {
    assert.equal(
      parseWholesaleMoney('365,000.25'),
      36_500_025,
    );

    assert.equal(
      parseWholesaleMoney('0'),
      0,
    );

    for (const text of [
      '',
      '1,00',
      '-5',
      '1e3',
      '0.001',
    ]) {
      assert.throws(
        () => parseWholesaleMoney(text),
      );
    }
  },
);

test(
  'partial and full payments are independent from dispatch',
  () => {
    assert.equal(
      wholesaleBalance(
        36_500_000,
        0,
      ).status,

      'unpaid',
    );

    assert.deepEqual(
      wholesaleBalance(
        36_500_000,
        20_000_000,
      ),

      {
        totalMinor: 36_500_000,
        paidMinor: 20_000_000,
        balanceMinor: 16_500_000,
        status: 'partially_paid',
      },
    );

    assert.equal(
      wholesaleBalance(
        36_500_000,
        36_500_000,
      ).status,

      'paid',
    );

    assert.throws(
      () => wholesaleBalance(100, 101),
    );
  },
);

test(
  'partial dispatch retains remaining bottles and prevents over-dispatch',
  () => {
    const lines = [
      calculateWholesaleLine(carton),
    ];

    assert.deepEqual(
      validateWholesaleDispatch(
        lines,
        [],

        [
          {
            lineId: carton.lineId,
            quantity: 18,
          },
        ],
      ),

      {
        remaining: [
          {
            lineId: carton.lineId,
            quantity: 30,
          },
        ],

        status: 'partially_dispatched',
      },
    );

    assert.equal(
      validateWholesaleDispatch(
        lines,

        [
          {
            lineId: carton.lineId,
            quantity: 18,
          },
        ],

        [
          {
            lineId: carton.lineId,
            quantity: 30,
          },
        ],
      ).status,

      'dispatched',
    );

    assert.throws(() =>
      validateWholesaleDispatch(
        lines,

        [
          {
            lineId: carton.lineId,
            quantity: 18,
          },
        ],

        [
          {
            lineId: carton.lineId,
            quantity: 31,
          },
        ],
      ),
    );

    assert.throws(() =>
      validateWholesaleDispatch(
        lines,
        [],

        [
          {
            lineId: uid(9),
            quantity: 1,
          },
        ],
      ),
    );

    assert.throws(() =>
      validateWholesaleDispatch(
        lines,
        [],

        [
          {
            lineId: carton.lineId,
            quantity: 30,
          },
          {
            lineId: carton.lineId,
            quantity: 30,
          },
        ],
      ),
    );

    assert.throws(() =>
      validateWholesaleDispatch(
        [
          {
            ...lines[0],
            baseQuantity: 99,
          },
        ],

        [],

        [
          {
            lineId: carton.lineId,
            quantity: 1,
          },
        ],
      ),
    );
  },
);