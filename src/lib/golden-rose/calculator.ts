export type CalculatorOperator =
  | '+'
  | '-'
  | '*'
  | '/';

export type CalculatorKey =
  | CalculatorOperator
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '='
  | 'AC'
  | 'DEL'
  | '%'
  | '+/-';

export interface CalculatorState {
  display: string;
  accumulator: string | null;
  operator: CalculatorOperator | null;
  replace: boolean;
  error: string | null;
}

/* =========================================================
   GOLDEN ROSE PERFUME — CALCULATOR ENGINE

   Eight fractional digits.
   Fifteen integer digits.

   BigInt constructors preserve compatibility with
   the existing ES2017 TypeScript target.
   ========================================================= */

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);
const SCALE = BigInt(100_000_000);

const LIMIT =
  BigInt('99999999999999999999999');

/* =========================================================
   INITIAL CALCULATOR STATE
   ========================================================= */

export function initialCalculator(): CalculatorState {
  return {
    display: '0',
    accumulator: null,
    operator: null,
    replace: true,
    error: null,
  };
}

/* =========================================================
   DECIMAL CONVERSION
   ========================================================= */

function scaled(text: string): bigint {
  if (
    !/^-?\d{1,15}(?:\.\d{0,8})?$/.test(text)
  ) {
    throw new Error('Number out of range');
  }

  const negative =
    text.startsWith('-');

  const [whole, fraction = ''] =
    (
      negative
        ? text.slice(1)
        : text
    ).split('.');

  const value =
    BigInt(whole) * SCALE +
    BigInt(fraction.padEnd(8, '0'));

  return negative
    ? -value
    : value;
}

function formatted(value: bigint): string {
  if (
    value > LIMIT ||
    value < -LIMIT
  ) {
    throw new Error(
      'Result out of range',
    );
  }

  const absolute =
    value < ZERO
      ? -value
      : value;

  const fraction =
    (absolute % SCALE)
      .toString()
      .padStart(8, '0')
      .replace(/0+$/, '');

  return (
    (value < ZERO ? '-' : '') +

    (absolute / SCALE).toString() +

    (
      fraction
        ? '.' + fraction
        : ''
    )
  );
}

/* =========================================================
   DECIMAL DIVISION

   Round half away from zero, including negative results.
   ========================================================= */

function divideRounded(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator === ZERO) {
    throw new Error(
      'Cannot divide by zero',
    );
  }

  const negative =
    (numerator < ZERO) !==
    (denominator < ZERO);

  const n =
    numerator < ZERO
      ? -numerator
      : numerator;

  const d =
    denominator < ZERO
      ? -denominator
      : denominator;

  const result =
    n / d +
    (
      (n % d) * TWO >= d
        ? ONE
        : ZERO
    );

  return negative
    ? -result
    : result;
}

/* =========================================================
   ARITHMETIC OPERATIONS
   ========================================================= */

export function calculate(
  left: string,
  operator: CalculatorOperator,
  right: string,
): string {
  const a = scaled(left);

  const b = scaled(right);

  switch (operator) {
    case '+':
      return formatted(a + b);

    case '-':
      return formatted(a - b);

    case '*':
      return formatted(
        divideRounded(a * b, SCALE),
      );

    case '/':
      return formatted(
        divideRounded(a * SCALE, b),
      );
  }
}

function isOperator(
  key: CalculatorKey,
): key is CalculatorOperator {
  return (
    key === '+' ||
    key === '-' ||
    key === '*' ||
    key === '/'
  );
}

/* =========================================================
   CALCULATOR STATE MACHINE
   ========================================================= */

export function calculatorKey(
  state: CalculatorState,
  key: CalculatorKey,
): CalculatorState {
  if (key === 'AC') {
    return initialCalculator();
  }

  /* Recover from a previous calculation error. */

  if (state.error) {
    if (/^[0-9.]$/.test(key)) {
      return calculatorKey(
        initialCalculator(),
        key,
      );
    }

    return state;
  }

  try {
    /* ===================================================
       NUMBER AND DECIMAL ENTRY
       =================================================== */

    if (/^[0-9.]$/.test(key)) {
      let display =
        state.replace
          ? '0'
          : state.display;

      if (key === '.') {
        if (display.includes('.')) {
          return state;
        }

        display += '.';

      } else {
        display =
          display === '0'
            ? key

            : display === '-0'
              ? '-' + key

              : display + key;
      }

      if (
        !/^-?\d{1,15}(?:\.\d{0,8})?$/.test(
          display,
        )
      ) {
        return state;
      }

      return {
        ...state,
        display,
        replace: false,
      };
    }

    /* ===================================================
       DELETE LAST CHARACTER
       =================================================== */

    if (key === 'DEL') {
      if (state.replace) {
        return state;
      }

      const display =
        state.display.slice(0, -1);

      return {
        ...state,

        display:
          !display || display === '-'
            ? '0'
            : display,
      };
    }

    /* ===================================================
       NEGATIVE VALUES AND PERCENTAGE

       Percentage converts the displayed number
       to its decimal percentage value.
       =================================================== */

    if (
      key === '+/-' ||
      key === '%'
    ) {
      const value =
        scaled(state.display);

      const display =
        formatted(
          key === '+/-'
            ? -value
            : divideRounded(
                value,
                HUNDRED,
              ),
        );

      return {
        ...state,
        display,
        replace: false,
      };
    }

    /* ===================================================
       OPERATOR SELECTION

       Behaves like a standard sequential calculator.
       =================================================== */

    if (isOperator(key)) {
      const display =
        state.operator &&
        state.accumulator !== null &&
        !state.replace

          ? calculate(
              state.accumulator,
              state.operator,
              state.display,
            )

          : formatted(
              scaled(state.display),
            );

      return {
        display,
        accumulator: display,
        operator: key,
        replace: true,
        error: null,
      };
    }

    /* ===================================================
       COMPLETE CALCULATION
       =================================================== */

    if (key === '=') {
      if (
        !state.operator ||
        state.accumulator === null ||
        state.replace
      ) {
        return state;
      }

      return {
        display:
          calculate(
            state.accumulator,
            state.operator,
            state.display,
          ),

        accumulator: null,

        operator: null,

        replace: true,

        error: null,
      };
    }

    return state;

  } catch (error) {
    return {
      ...initialCalculator(),

      error:
        error instanceof Error
          ? error.message
          : 'Calculation failed',
    };
  }
}

/* =========================================================
   PHYSICAL KEYBOARD SUPPORT

   Only explicitly recognized calculator commands
   are handled.
   ========================================================= */

export function calculatorKeyboardKey(
  key: string,
): CalculatorKey | null {
  if (/^[0-9.+*/%=-]$/.test(key)) {
    return key as CalculatorKey;
  }

  if (key === 'Enter') {
    return '=';
  }

  if (
    key === 'Backspace' ||
    key === 'Delete'
  ) {
    return 'DEL';
  }

  if (key.toLowerCase() === 'c') {
    return 'AC';
  }

  return null;
}