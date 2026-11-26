'use client';

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type MouseEvent,
} from 'react';

import {
  Calculator,
  Copy,
  GripHorizontal,
  Minus,
  RotateCcw,
} from 'lucide-react';

import {
  calculatorKey,
  calculatorKeyboardKey,
  initialCalculator,
  type CalculatorKey,
} from '@/src/lib/golden-rose/calculator';

/* =========================================================
   GOLDEN ROSE PERFUME
   FLOATING BUSINESS CALCULATOR
   ========================================================= */

interface Position {
  x: number;
  y: number;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  origin: Position;
  latest: Position;
  moved: boolean;
}

interface Props {
  staffId: string;
}

const STORAGE_PREFIX =
  'golden-rose-calculator-position:';

const EDGE = 12;

const keys: readonly {
  value: CalculatorKey;
  label: string;
  name: string;
  kind?: 'operator' | 'clear' | 'equal';
}[] = [
  {
    value: 'AC',
    label: 'AC',
    name: 'Clear all',
    kind: 'clear',
  },
  {
    value: 'DEL',
    label: '⌫',
    name: 'Delete last digit',
  },
  {
    value: '%',
    label: '%',
    name: 'Convert to percentage',
  },
  {
    value: '/',
    label: '÷',
    name: 'Divide',
    kind: 'operator',
  },
  {
    value: '7',
    label: '7',
    name: 'Seven',
  },
  {
    value: '8',
    label: '8',
    name: 'Eight',
  },
  {
    value: '9',
    label: '9',
    name: 'Nine',
  },
  {
    value: '*',
    label: '×',
    name: 'Multiply',
    kind: 'operator',
  },
  {
    value: '4',
    label: '4',
    name: 'Four',
  },
  {
    value: '5',
    label: '5',
    name: 'Five',
  },
  {
    value: '6',
    label: '6',
    name: 'Six',
  },
  {
    value: '-',
    label: '−',
    name: 'Subtract',
    kind: 'operator',
  },
  {
    value: '1',
    label: '1',
    name: 'One',
  },
  {
    value: '2',
    label: '2',
    name: 'Two',
  },
  {
    value: '3',
    label: '3',
    name: 'Three',
  },
  {
    value: '+',
    label: '+',
    name: 'Add',
    kind: 'operator',
  },
  {
    value: '+/-',
    label: '±',
    name: 'Change sign',
  },
  {
    value: '0',
    label: '0',
    name: 'Zero',
  },
  {
    value: '.',
    label: '.',
    name: 'Decimal point',
  },
  {
    value: '=',
    label: '=',
    name: 'Calculate result',
    kind: 'equal',
  },
];

/* =========================================================
   POSITION MANAGEMENT
   ========================================================= */

function clampPosition(
  position: Position,
  width: number,
  height: number,
): Position {
  const viewportWidth =
    window.innerWidth;

  const viewportHeight =
    window.innerHeight;

  return {
    x: Math.max(
      EDGE,
      Math.min(
        position.x,
        viewportWidth - width - EDGE,
      ),
    ),

    y: Math.max(
      EDGE,
      Math.min(
        position.y,
        viewportHeight - height - EDGE,
      ),
    ),
  };
}

function validPosition(
  value: unknown,
): value is Position {
  if (
    !value ||
    typeof value !== 'object' ||
    !('x' in value) ||
    !('y' in value)
  ) {
    return false;
  }

  return (
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&

    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function readPosition(
  key: string,
): Position | null {
  try {
    const raw =
      window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const value: unknown =
      JSON.parse(raw);

    return validPosition(value)
      ? value
      : null;

  } catch {
    return null;
  }
}

function savePosition(
  key: string,
  value: Position,
) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value),
    );

  } catch {
    /*
     * A blocked storage service does not prevent
     * the calculator from being used or moved.
     */
  }
}

/* =========================================================
   OPERATOR PRESENTATION
   ========================================================= */

function operatorLabel(
  value: string,
): string {
  switch (value) {
    case '*':
      return '×';

    case '/':
      return '÷';

    case '-':
      return '−';

    default:
      return value;
  }
}

/* =========================================================
   FLOATING CALCULATOR
   ========================================================= */

export function FloatingCalculator({
  staffId,
}: Props) {
  const storageKey =
    STORAGE_PREFIX + staffId;

  const panelId = useId();

  const titleId = useId();

  const root =
    useRef<HTMLDivElement>(null);

  const launcher =
    useRef<HTMLButtonElement>(null);

  const display =
    useRef<HTMLDivElement>(null);

  const drag =
    useRef<DragSession | null>(null);

  const suppressClick =
    useRef(false);

  const copyVersion =
    useRef(0);

  const [open, setOpen] =
    useState(false);

  const [position, setPosition] =
    useState<Position | null>(null);

  const [copyFeedback, setCopyFeedback] =
    useState('');

  const [state, press] =
    useReducer(
      calculatorKey,
      undefined,
      initialCalculator,
    );

  /* =======================================================
     RESTORE SAVED EMPLOYEE POSITION

     Only the coordinates are persisted.
     Calculation contents remain in component memory.
     ======================================================= */

  useEffect(() => {
    const frame =
      window.requestAnimationFrame(() => {
        const saved =
          readPosition(storageKey);

        const element =
          root.current;

        if (
          !saved ||
          !element
        ) {
          return;
        }

        const rect =
          element.getBoundingClientRect();

        setPosition(
          clampPosition(
            saved,
            rect.width,
            rect.height,
          ),
        );
      });

    return () =>
      window.cancelAnimationFrame(frame);

  }, [storageKey]);

  /* =======================================================
     VIEWPORT AND PANEL RESIZING

     Keep the calculator inside the screen when:
       - The panel opens or closes
       - The browser window changes size
       - The device changes orientation
       - The workspace layout changes
     ======================================================= */

  useEffect(() => {
    const element =
      root.current;

    if (!element) {
      return;
    }

    let frame = 0;

    function reposition() {
      window.cancelAnimationFrame(frame);

      frame =
        window.requestAnimationFrame(() => {
          const current =
            root.current;

          if (
            !current ||
            drag.current
          ) {
            return;
          }

          const rect =
            current.getBoundingClientRect();

          if (
            rect.width === 0 ||
            rect.height === 0
          ) {
            return;
          }

          const next =
            clampPosition(
              {
                x: rect.left,
                y: rect.top,
              },
              rect.width,
              rect.height,
            );

          if (
            Math.abs(next.x - rect.left) > 0.5 ||
            Math.abs(next.y - rect.top) > 0.5
          ) {
            setPosition(next);
          }
        });
    }

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(reposition)
        : null;

    observer?.observe(element);

    window.addEventListener(
      'resize',
      reposition,
    );

    reposition();

    return () => {
      observer?.disconnect();

      window.removeEventListener(
        'resize',
        reposition,
      );

      window.cancelAnimationFrame(frame);
    };

  }, [open]);

  /* =======================================================
     FOCUS CALCULATOR WHEN OPENED

     Keyboard commands are scoped to this component.
     No global keyboard listener is installed.
     ======================================================= */

  useEffect(() => {
    if (open) {
      display.current?.focus({
        preventScroll: true,
      });
    }
  }, [open]);

  /* =======================================================
     DRAG START
     ======================================================= */

  function beginDrag(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !root.current
    ) {
      return;
    }

    suppressClick.current =
      false;

    const rect =
      root.current.getBoundingClientRect();

    const origin = {
      x: rect.left,
      y: rect.top,
    };

    drag.current = {
      pointerId: event.pointerId,

      startX: event.clientX,

      startY: event.clientY,

      origin,

      latest: origin,

      moved: false,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  }

  /* =======================================================
     DRAG MOVEMENT
     ======================================================= */

  function moveDrag(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    const session =
      drag.current;

    const element =
      root.current;

    if (
      !session ||
      !element ||
      session.pointerId !== event.pointerId
    ) {
      return;
    }

    const dx =
      event.clientX - session.startX;

    const dy =
      event.clientY - session.startY;

    if (
      !session.moved &&
      Math.hypot(dx, dy) < 5
    ) {
      return;
    }

    session.moved = true;

    suppressClick.current =
      true;

    const rect =
      element.getBoundingClientRect();

    const next =
      clampPosition(
        {
          x: session.origin.x + dx,
          y: session.origin.y + dy,
        },
        rect.width,
        rect.height,
      );

    session.latest =
      next;

    setPosition(next);
  }

  /* =======================================================
     COMPLETE DRAG
     ======================================================= */

  function endDrag(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    const session =
      drag.current;

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return;
    }

    drag.current =
      null;

    if (session.moved) {
      suppressClick.current =
        true;

      savePosition(
        storageKey,
        session.latest,
      );
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  /* =======================================================
     KEYBOARD POSITION MOVEMENT

     Arrow keys move the launcher or drag handle.
     This provides an alternative to mouse dragging.
     ======================================================= */

  function moveWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    const element =
      root.current;

    if (!element) {
      return;
    }

    const step =
      event.shiftKey
        ? 40
        : 12;

    let dx = 0;

    let dy = 0;

    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;

      case 'ArrowRight':
        dx = step;
        break;

      case 'ArrowUp':
        dy = -step;
        break;

      case 'ArrowDown':
        dy = step;
        break;

      default:
        return;
    }

    event.preventDefault();

    event.stopPropagation();

    const rect =
      element.getBoundingClientRect();

    const next =
      clampPosition(
        {
          x: rect.left + dx,
          y: rect.top + dy,
        },
        rect.width,
        rect.height,
      );

    setPosition(next);

    savePosition(
      storageKey,
      next,
    );
  }

  /* =======================================================
     OPEN AND MINIMIZE
     ======================================================= */

  function openCalculator(
    event: MouseEvent<HTMLButtonElement>,
  ) {
    /*
     * A drag release must not accidentally open
     * the calculator.
     *
     * Keyboard-generated clicks use detail = 0.
     */

    if (
      suppressClick.current &&
      event.detail !== 0
    ) {
      suppressClick.current = false;

      return;
    }

    suppressClick.current =
      false;

    setOpen(true);
  }

  function minimizeCalculator() {
    setOpen(false);

    window.requestAnimationFrame(() => {
      launcher.current?.focus({
        preventScroll: true,
      });
    });
  }

  /* =======================================================
     RESET FLOATING POSITION
     ======================================================= */

  function resetPosition() {
    setPosition(null);

    try {
      window.localStorage.removeItem(
        storageKey,
      );

    } catch {
      // The current position is still reset.
    }

    window.requestAnimationFrame(() => {
      const element =
        root.current;

      if (!element) {
        return;
      }

      const rect =
        element.getBoundingClientRect();

      setPosition(
        clampPosition(
          {
            x: rect.left,
            y: rect.top,
          },
          rect.width,
          rect.height,
        ),
      );
    });
  }

  /* =======================================================
     CALCULATOR KEY INPUT
     ======================================================= */

  function enterKey(key: CalculatorKey) {
    copyVersion.current += 1;

    setCopyFeedback('');

    press(key);
  }

  function handleKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();

      event.stopPropagation();

      minimizeCalculator();

      return;
    }

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    /*
     * Preserve standard keyboard activation for
     * focused buttons.
     */

    if (
      event.target instanceof HTMLButtonElement &&
      (
        event.key === 'Enter' ||
        event.key === ' '
      )
    ) {
      return;
    }

    const key =
      calculatorKeyboardKey(
        event.key,
      );

    if (!key) {
      return;
    }

    event.preventDefault();

    event.stopPropagation();

    enterKey(key);
  }

  /* =======================================================
     COPY CALCULATION RESULT

     This copies the displayed number only.
     It never writes to a sale or financial record.
     ======================================================= */

  async function copyResult() {
    if (state.error) {
      return;
    }

    const version =
      ++copyVersion.current;

    try {
      await navigator.clipboard.writeText(
        state.display,
      );

      if (
        version === copyVersion.current
      ) {
        setCopyFeedback(
          'Result copied.',
        );
      }

    } catch {
      if (
        version === copyVersion.current
      ) {
        setCopyFeedback(
          'Clipboard unavailable. Select and copy the displayed number.',
        );
      }
    }
  }

  const positionStyle =
    position
      ? {
          left: position.x,
          top: position.y,
        }
      : undefined;

  /* =======================================================
     INTERFACE
     ======================================================= */

  return (
    <div
      ref={root}
      className="gr-floating-calculator"
      data-open={open}
      style={positionStyle}
    >
      <style>
        {calculatorStyles}
      </style>

      {!open ? (
        /* Floating movable launcher */

        <button
          ref={launcher}
          type="button"
          className="gr-calc-launcher"
          aria-label="Open calculator. Drag or use arrow keys to move."
          aria-expanded={false}
          title="Click to open. Drag to move."
          onClick={openCalculator}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={moveWithKeyboard}
        >
          <Calculator
            size={23}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </button>

      ) : (
        /* Expanded calculator panel */

        <section
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className="gr-calc-panel"
          onKeyDown={handleKeyboard}
        >
          {/* Draggable header */}

          <header className="gr-calc-header">
            <button
              type="button"
              className="gr-calc-drag-handle"
              aria-label="Move calculator. Use arrow keys for keyboard movement."
              title="Drag calculator"
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={moveWithKeyboard}
            >
              <GripHorizontal
                size={20}
                aria-hidden="true"
              />
            </button>

            <div className="gr-calc-title">
              <p>
                GOLDEN ROSE
              </p>

              <h2 id={titleId}>
                Calculator
              </h2>
            </div>

            <button
              type="button"
              className="gr-calc-icon"
              aria-label="Reset calculator position"
              title="Reset position"
              onClick={resetPosition}
            >
              <RotateCcw
                size={16}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              className="gr-calc-icon"
              aria-label="Minimize calculator"
              title="Minimize calculator"
              onClick={minimizeCalculator}
            >
              <Minus
                size={19}
                aria-hidden="true"
              />
            </button>
          </header>

          {/* Calculation display */}

          <div
            ref={display}
            tabIndex={0}
            className="gr-calc-display"
            aria-label="Calculator display"
          >
            <div className="gr-calc-expression">
              {state.accumulator !== null &&
                state.operator ? (
                  <>
                    {state.accumulator}
                    {' '}
                    {operatorLabel(
                      state.operator,
                    )}
                  </>
                ) : (
                  'Ready'
                )}
            </div>

            <output
              aria-live="polite"
              className="gr-calc-value"
              data-error={Boolean(state.error)}
            >
              {state.error
                ? state.error
                : state.display}
            </output>
          </div>

          {/* Calculator keys */}

          <div
            className="gr-calc-keypad"
            aria-label="Calculator keypad"
          >
            {keys.map(key => (
              <button
                key={key.value}
                type="button"
                className="gr-calc-key"
                data-kind={
                  key.kind ?? 'number'
                }
                data-selected={
                  key.value ===
                    state.operator &&
                  state.replace
                }
                aria-label={key.name}
                onClick={() =>
                  enterKey(key.value)
                }
              >
                {key.label}
              </button>
            ))}
          </div>

          {/* Copy and assistance */}

          <footer className="gr-calc-footer">
            <button
              type="button"
              className="gr-calc-copy"
              disabled={Boolean(state.error)}
              onClick={() =>
                void copyResult()
              }
            >
              <Copy
                size={15}
                aria-hidden="true"
              />

              Copy result
            </button>

            <p
              className="gr-calc-feedback"
              role="status"
            >
              {copyFeedback ||
                'Drag the handle to move. Press Esc to minimize.'}
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}

/* =========================================================
   GOLDEN ROSE CALCULATOR DESIGN

   Scoped styles.
   No modifications to existing POS or workspace CSS.
   ========================================================= */

const calculatorStyles = `
.gr-floating-calculator {
  --gr-calc-bg: #fffdf9;
  --gr-calc-panel: #ffffff;
  --gr-calc-border: #e5d8cf;
  --gr-calc-text: #482539;
  --gr-calc-muted: #826d78;
  --gr-calc-accent: #54213a;
  --gr-calc-gold: #a67c45;
  --gr-calc-soft: #f6eee7;
  --gr-calc-operator: #f2e5d4;
  --gr-calc-display: #faf5f0;
  --gr-calc-error: #a3324b;

  position: fixed;

  top: 110px;

  left: clamp(16px, 25vw, 290px);

  z-index: 85;

  width: max-content;

  max-width: calc(100vw - 24px);

  color: var(--gr-calc-text);

  font-family: inherit;

  font-size: 14px;

  line-height: 1.5;

  text-align: left;
}

.gr-floating-calculator *,
.gr-floating-calculator *::before,
.gr-floating-calculator *::after {
  box-sizing: border-box;
}

.gr-floating-calculator button {
  font: inherit;
  cursor: pointer;
}

.gr-floating-calculator button:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.gr-floating-calculator button:focus-visible,
.gr-calc-display:focus-visible {
  outline: 2px solid var(--gr-calc-gold);
  outline-offset: 3px;
}

.gr-calc-launcher {
  display: grid;

  width: 50px;

  height: 50px;

  padding: 0;

  place-items: center;

  border: 1px solid #c4a477;

  border-radius: 15px;

  background: var(--gr-calc-accent);

  color: #f2d9ae;

  box-shadow: 0 7px 25px rgba(61, 22, 43, .22);

  touch-action: none;

  user-select: none;

  -webkit-user-select: none;

  cursor: grab !important;
}

.gr-calc-launcher:active,
.gr-calc-drag-handle:active {
  cursor: grabbing !important;
}

.gr-calc-launcher:hover {
  filter: brightness(1.12);
}

.gr-calc-panel {
  display: grid;

  gap: 14px;

  width: min(320px, calc(100vw - 24px));

  max-height: calc(100dvh - 24px);

  padding: 14px;

  overflow-y: auto;

  border: 1px solid var(--gr-calc-border);

  border-radius: 20px;

  background: var(--gr-calc-bg);

  box-shadow:
    0 18px 60px rgba(57, 18, 38, .23),
    0 2px 9px rgba(57, 18, 38, .08);
}

.gr-calc-header {
  display: flex;

  align-items: center;

  gap: 7px;

  min-width: 0;

  padding: 0;

  margin: 0;
}

.gr-calc-title {
  flex: 1;

  min-width: 0;
}

.gr-calc-title p {
  margin: 0;

  color: var(--gr-calc-gold);

  font-size: 9px;

  font-weight: 750;

  letter-spacing: .13em;
}

.gr-calc-title h2 {
  margin: 0;

  color: var(--gr-calc-text);

  font-size: 17px;

  font-weight: 650;
}

.gr-calc-drag-handle,
.gr-calc-icon {
  display: grid;

  place-items: center;

  flex-shrink: 0;

  width: 32px;

  height: 34px;

  padding: 0;

  border: 1px solid var(--gr-calc-border);

  border-radius: 9px;

  background: var(--gr-calc-panel);

  color: var(--gr-calc-text);
}

.gr-calc-drag-handle {
  touch-action: none;

  user-select: none;

  -webkit-user-select: none;

  cursor: grab !important;

  color: var(--gr-calc-gold);
}

.gr-calc-display {
  display: grid;

  align-content: space-between;

  gap: 8px;

  min-width: 0;

  min-height: 90px;

  padding: 13px;

  border: 1px solid var(--gr-calc-border);

  border-radius: 12px;

  background: var(--gr-calc-display);

  text-align: right;
}

.gr-calc-expression {
  min-height: 19px;

  overflow-wrap: anywhere;

  color: var(--gr-calc-muted);

  font-size: 12px;
}

.gr-calc-value {
  display: block;

  color: var(--gr-calc-text);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;

  font-size: 23px;

  font-weight: 650;

  font-variant-numeric: tabular-nums;

  overflow-wrap: anywhere;

  user-select: text;
}

.gr-calc-value[data-error="true"] {
  color: var(--gr-calc-error);

  font-size: 15px;
}

.gr-calc-keypad {
  display: grid;

  grid-template-columns: repeat(4, minmax(0, 1fr));

  gap: 7px;
}

.gr-calc-key {
  display: grid;

  min-height: 45px;

  place-items: center;

  padding: 7px 3px;

  border: 1px solid var(--gr-calc-border);

  border-radius: 10px;

  background: var(--gr-calc-panel);

  color: var(--gr-calc-text);

  font-size: 17px !important;

  font-weight: 650 !important;
}

.gr-calc-key[data-kind="operator"] {
  background: var(--gr-calc-operator);

  color: var(--gr-calc-text);
}

.gr-calc-key[data-kind="clear"] {
  background: var(--gr-calc-soft);

  color: var(--gr-calc-error);
}

.gr-calc-key[data-kind="equal"] {
  border-color: var(--gr-calc-accent);

  background: var(--gr-calc-accent);

  color: #ffffff;
}

.gr-calc-key[data-selected="true"] {
  outline: 2px solid var(--gr-calc-gold);

  outline-offset: -2px;
}

.gr-calc-key:hover:not(:disabled),
.gr-calc-copy:hover:not(:disabled),
.gr-calc-icon:hover {
  filter: brightness(.96);
}

.gr-calc-key:active {
  transform: translateY(1px);
}

.gr-calc-footer {
  display: grid;

  gap: 7px;
}

.gr-calc-copy {
  display: flex;

  align-items: center;

  justify-content: center;

  gap: 7px;

  min-height: 38px;

  padding: 7px 12px;

  border: 1px solid var(--gr-calc-border);

  border-radius: 9px;

  background: var(--gr-calc-panel);

  color: var(--gr-calc-text);

  font-size: 12px !important;

  font-weight: 600 !important;
}

.gr-calc-feedback {
  min-height: 30px;

  margin: 0;

  color: var(--gr-calc-muted);

  font-size: 10px;

  line-height: 1.5;
}

/* =======================================================
   EXPLICIT DARK THEME
   ======================================================= */

.gr-theme-root[data-theme="dark"]
.gr-floating-calculator {
  --gr-calc-bg: #231923;
  --gr-calc-panel: #30232e;
  --gr-calc-border: #513c4c;
  --gr-calc-text: #f4e8ee;
  --gr-calc-muted: #c8b5bf;
  --gr-calc-accent: #8c4564;
  --gr-calc-gold: #dfbd81;
  --gr-calc-soft: #40303b;
  --gr-calc-operator: #503846;
  --gr-calc-display: #1c141c;
  --gr-calc-error: #ffafbe;
}

/* =======================================================
   SYSTEM THEME
   ======================================================= */

@media (prefers-color-scheme: dark) {
  .gr-theme-root[data-theme="system"]
  .gr-floating-calculator {
    --gr-calc-bg: #231923;
    --gr-calc-panel: #30232e;
    --gr-calc-border: #513c4c;
    --gr-calc-text: #f4e8ee;
    --gr-calc-muted: #c8b5bf;
    --gr-calc-accent: #8c4564;
    --gr-calc-gold: #dfbd81;
    --gr-calc-soft: #40303b;
    --gr-calc-operator: #503846;
    --gr-calc-display: #1c141c;
    --gr-calc-error: #ffafbe;
  }
}

/* =======================================================
   MOBILE WORKSPACE
   ======================================================= */

@media (max-width: 900px) {
  .gr-floating-calculator {
    top: 90px;
    left: 12px;
  }

  .gr-calc-launcher {
    width: 46px;
    height: 46px;
  }

  /*
   * Keep the calculator out of the mobile navigation
   * dialog while the sidebar is open.
   */

  .owner-suite[data-mobile-navigation="true"]
  + .gr-floating-calculator {
    display: none;
  }
}

/* =======================================================
   SMALL VIEWPORTS
   ======================================================= */

@media (max-height: 480px) {
  .gr-calc-panel {
    gap: 8px;
    padding: 10px;
  }

  .gr-calc-display {
    min-height: 65px;
    padding: 9px;
  }

  .gr-calc-key {
    min-height: 36px;
  }
}

/* =======================================================
   RECEIPT AND INVOICE PRINTING

   Never include the floating widget in business
   documents or customer receipts.
   ======================================================= */

@media print {
  .gr-floating-calculator {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gr-floating-calculator *,
  .gr-floating-calculator *::before,
  .gr-floating-calculator *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;