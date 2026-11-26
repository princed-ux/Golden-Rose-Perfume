import { test } from 'node:test';

import assert from 'node:assert/strict';

import {
  calculate,
  calculatorKey,
  calculatorKeyboardKey,
  initialCalculator,
  type CalculatorKey,
} from './calculator';

function run(
  ...keys: CalculatorKey[]
) {
  return keys.reduce(
    calculatorKey,
    initialCalculator(),
  );
}

test(
  'decimal additions and subtractions avoid floating point artifacts',
  () => {
    assert.equal(
      calculate('0.1', '+', '0.2'),
      '0.3',
    );

    assert.equal(
      calculate('365000', '-', '200000'),
      '165000',
    );
  },
);

test(
  'multiplication supports bulk prices and negative values',
  () => {
    assert.equal(
      calculate('5000', '*', '32'),
      '160000',
    );

    assert.equal(
      calculate('-2.5', '*', '3'),
      '-7.5',
    );
  },
);

test(
  'division rounds to eight fractional places, including negative ties',
  () => {
    assert.equal(
      calculate('1', '/', '3'),
      '0.33333333',
    );

    assert.equal(
      calculate('-0.00000001', '/', '2'),
      '-0.00000001',
    );
  },
);

test(
  'division by zero and overflow are rejected',
  () => {
    assert.throws(
      () => calculate('1', '/', '0'),
      /zero/,
    );

    assert.throws(
      () =>
        calculate(
          '999999999999999',
          '+',
          '1',
        ),
      /range/,
    );

    assert.throws(
      () =>
        calculate('1e3', '+', '1'),
      /range/,
    );
  },
);

test(
  'sequential operation and operator correction',
  () => {
    assert.equal(
      run(
        '2', '+', '3', '*', '4', '=',
      ).display,
      '20',
    );

    assert.equal(
      run(
        '8', '+', '-', '2', '=',
      ).display,
      '6',
    );
  },
);

test(
  'decimal entry, backspace, sign and percentage',
  () => {
    assert.equal(
      run(
        '.', '5', '.', '2', 'DEL',
      ).display,
      '0.5',
    );

    assert.equal(
      run(
        '2', '5', '+/-', '%',
      ).display,
      '-0.25',
    );

    assert.equal(
      run('0', '0', '3').display,
      '3',
    );
  },
);

test(
  'clear and recover after errors',
  () => {
    const failed =
      run('4', '/', '0', '=');

    assert.match(
      failed.error ?? '',
      /zero/,
    );

    assert.equal(
      calculatorKey(
        failed,
        '7',
      ).display,
      '7',
    );

    assert.deepEqual(
      calculatorKey(
        failed,
        'AC',
      ),
      initialCalculator(),
    );
  },
);

test(
  'keyboard mappings are restricted to calculator commands',
  () => {
    assert.equal(
      calculatorKeyboardKey('Enter'),
      '=',
    );

    assert.equal(
      calculatorKeyboardKey('Backspace'),
      'DEL',
    );

    assert.equal(
      calculatorKeyboardKey('a'),
      null,
    );

    assert.equal(
      calculatorKeyboardKey('F12'),
      null,
    );
  },
);