'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  History,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Package,
  PauseCircle,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';

import {
  ActionButton,
  ActionScope,
} from '@/src/components/action-feedback';

import {
  completeCashSale,
  loadPosCatalogue,
} from './actions';

import {
  PosCheckoutModal,
} from './PosCheckoutModal';

import {
  paymentMethodLabel,
  validSalePayment,
  type SalePayment,
} from '@/src/lib/golden-rose/pos-payments';

import {
  HeldBasketDialog,
} from '@/src/components/held-basket-dialog';

import {
  appendHeldBasket,
  takeHeldBasket,
  MAX_HELD_BASKETS,
} from '@/src/lib/golden-rose/held-baskets';

import {
  heldSalesKey,
  LEGACY_HELD_KEY,
  makeHeldSale,
  parseHeldSales,
  parseLegacyHeldSale,
  type HeldSale,
} from './held-sales';

import type {
  CashSaleRequest,
  PosCatalogue,
  PosProduct,
  PosReceipt,
} from './types';

/* =========================================================
   GOLDEN ROSE PERFUME — POINT OF SALE
   ========================================================= */

const formatMoney = new Intl.NumberFormat(
  'en-NG',
  {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
);

const money = (minor: number) =>
  formatMoney.format(minor / 100);

const PENDING_KEY =
  'golden-rose-pos-pending-sale';

const VIEW_KEY =
  'golden-rose-pos-catalogue-view';

const MAX_CART_LINES = 40;
const MAX_PER_LINE = 100;

type CartItem = {
  product: PosProduct;
  quantity: number;
};

type Alert = {
  kind: 'error' | 'success' | 'info';
  message: string;
};

type CatalogueView =
  | 'grid'
  | 'table';

/* =========================================================
   MONEY PARSING
   ========================================================= */

function parseNaira(
  value: string,
): number | null {
  const cleaned =
    value.trim().replaceAll(',', '');

  if (
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(cleaned)
  ) {
    return null;
  }

  const [
    whole,
    fraction = '',
  ] = cleaned.split('.');

  const minor =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(minor)
    ? minor
    : null;
}

/* =========================================================
   PRODUCT PHOTOGRAPHY

   Key the image renderer by its current storage path.
   When the path changes, React mounts a fresh renderer.

   This replaces the synchronous state reset that previously
   caused the react-hooks/set-state-in-effect lint error.
   ========================================================= */

function ProductPhoto({
  product,
}: {
  product: PosProduct;
}) {
  return (
    <ProductPhotoRenderer
      key={
        product.id +
        ':' +
        (product.imagePath ?? '')
      }
      product={product}
    />
  );
}

function ProductPhotoRenderer({
  product,
}: {
  product: PosProduct;
}) {
  const [failed, setFailed] =
    useState(false);

  const image = product.imagePath
    ? 'https://eixbmsethgrtezhdmgsh.supabase.co/storage/v1/object/public/golden-rose-products/' +
      product.imagePath
        .split('/')
        .map(encodeURIComponent)
        .join('/')
    : null;

  return (
    <div className="pos-photo">
      {image && !failed ? (
        <Image
          src={image}
          alt=""
          fill
          unoptimized
          sizes="120px"
          onError={() =>
            setFailed(true)
          }
        />
      ) : (
        <span
          className="pos-photo-mark"
          aria-hidden="true"
        >
          GR
        </span>
      )}
    </div>
  );
}

/* =========================================================
   REGISTER CALCULATOR
   ========================================================= */

function CalculatorDialog({
  close,
  onUseValue,
}: {
  close: () => void;
  onUseValue: (value: string) => void;
}) {
  const [display, setDisplay] =
    useState('0');

  const [stored, setStored] =
    useState<number | null>(null);

  const [operator, setOperator] =
    useState<string | null>(null);

  const [replace, setReplace] =
    useState(false);

  useEffect(() => {
    function onKey(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === 'Escape') {
        close();
      }
    }

    document.addEventListener(
      'keydown',
      onKey,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, [close]);

  function press(
    key: string,
  ) {
    if (key === 'C') {
      setDisplay('0');
      setStored(null);
      setOperator(null);
      setReplace(false);

      return;
    }

    if (key === '⌫') {
      setDisplay(
        value =>
          value.slice(0, -1) || '0',
      );

      return;
    }

    if (
      ['+', '−', '×', '÷'].includes(key)
    ) {
      if (display === 'Error') {
        return;
      }

      setStored(Number(display));
      setOperator(key);
      setReplace(true);

      return;
    }

    if (key === '=') {
      if (
        stored === null ||
        !operator
      ) {
        return;
      }

      const value =
        Number(display);

      const result =
        operator === '+'
          ? stored + value
          : operator === '−'
            ? stored - value
            : operator === '×'
              ? stored * value
              : value === 0
                ? NaN
                : stored / value;

      setDisplay(
        Number.isFinite(result)
          ? String(
              Number(
                result.toFixed(2),
              ),
            )
          : 'Error',
      );

      setOperator(null);
      setStored(null);
      setReplace(true);

      return;
    }

    setDisplay(current => {
      if (
        key === '.' &&
        !replace &&
        current.includes('.')
      ) {
        return current;
      }

      if (
        replace ||
        current === 'Error'
      ) {
        return key === '.'
          ? '0.'
          : key;
      }

      if (
        current.replace(/\D/g, '').length >= 12
      ) {
        return current;
      }

      if (
        current === '0' &&
        key === '00'
      ) {
        return '0';
      }

      return (
        current === '0' &&
        key !== '.'
      )
        ? key
        : current + key;
    });

    setReplace(false);
  }

  const keys = [
    'C', '⌫', '÷', '×',
    '7', '8', '9', '−',
    '4', '5', '6', '+',
    '1', '2', '3', '=',
    '0', '00', '.',
  ];

  return (
    <div
      className="pos-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target ===
          event.currentTarget
        ) {
          close();
        }
      }}
    >
      <section
        className="pos-calculator"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-calc-title"
      >
        <div className="pos-dialog-header">
          <div>
            <small>
              WORKSPACE TOOL
            </small>

            <h2 id="pos-calc-title">
              Calculator
            </h2>
          </div>

          <ActionButton
            type="button"
            className="pos-icon-btn"
            aria-label="Close calculator"
            onClick={close}
          >
            <X size={18} />
          </ActionButton>
        </div>

        <output className="pos-calc-display">
          {display}
        </output>

        <div className="pos-calc-grid">
          {keys.map(key => (
            <ActionButton
              type="button"
              key={key}
              className={
                key === '='
                  ? 'pos-equals'
                  : ''
              }
              onClick={() =>
                press(key)
              }
            >
              {key}
            </ActionButton>
          ))}
        </div>

        <ActionButton
          type="button"
          className="pos-primary pos-wide"
          disabled={
            parseNaira(display) === null
          }
          onClick={() => {
            onUseValue(display);
            close();
          }}
        >
          Use as cash received
        </ActionButton>
      </section>
    </div>
  );
}

/* =========================================================
   VERIFIED SALES RECEIPT
   ========================================================= */

function ReceiptDialog({
  receipt,
  close,
}: {
  receipt: PosReceipt;
  close: () => void;
}) {
  useEffect(() => {
    function onKey(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === 'Escape') {
        close();
      }
    }

    document.addEventListener(
      'keydown',
      onKey,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, [close]);

  return (
    <div className="pos-modal-backdrop pos-receipt-layer">
      <section
        className="pos-receipt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-receipt-title"
      >
        <div className="pos-dialog-header pos-no-print">
          <div>
            <small>
              PAYMENT CONFIRMED
            </small>

            <h2>
              Sale completed
            </h2>
          </div>

          <ActionButton
            type="button"
            className="pos-icon-btn"
            aria-label="Close receipt"
            onClick={close}
          >
            <X size={18} />
          </ActionButton>
        </div>

        <div
          id="pos-print-receipt"
          className="pos-receipt-paper"
        >
          <div className="pos-receipt-brand">
            <strong>
              GOLDEN ROSE
            </strong>

            <small>
              BEAUTY OF FRAGRANCE
            </small>
          </div>

          <h2 id="pos-receipt-title">
            Sales receipt
          </h2>

          <div className="pos-receipt-meta">
            <span>
              Receipt
            </span>

            <b>
              GR-
              {String(
                receipt.saleNumber,
              ).padStart(7, '0')}
            </b>

            <span>
              Date
            </span>

            <span>
              {new Date(
                receipt.createdAt,
              ).toLocaleString(
                'en-NG',
                {
                  timeZone: 'Africa/Lagos',
                },
              )}
            </span>

            <span>
              Location
            </span>

            <span>
              {receipt.locationName}
            </span>

            <span>
              Payment
            </span>

            <span>
              {paymentMethodLabel(
                receipt.method,
              )}
            </span>

            <span>
              Customer
            </span>

            <span>
              {receipt.customerName ||
                'Walk-in customer'}
            </span>
          </div>

          <div className="pos-receipt-lines">
            {receipt.items.map(
              (line, index) => (
                <div
                  key={
                    line.variantId +
                    '-' +
                    index
                  }
                >
                  <span>
                    <b>
                      {line.name}
                    </b>

                    <small>
                      {line.quantity}
                      {' × '}

                      {money(
                        line.unitPriceMinor,
                      )}

                      {' · '}

                      {line.sku ||
                        'Perfume'}
                    </small>
                  </span>

                  <b>
                    {money(
                      line.lineTotalMinor,
                    )}
                  </b>
                </div>
              ),
            )}
          </div>

          <div className="pos-receipt-totals">
            <div>
              <span>
                Subtotal
              </span>

              <span>
                {money(
                  receipt.subtotalMinor,
                )}
              </span>
            </div>

            <div>
              <span>
                Discount
              </span>

              <span>
                −{money(
                  receipt.discountMinor,
                )}
              </span>
            </div>

            <div>
              <span>
                Tax
              </span>

              <span>
                {money(
                  receipt.taxMinor,
                )}
              </span>
            </div>

            <div className="pos-receipt-grand">
              <b>
                Total
              </b>

              <b>
                {money(
                  receipt.totalMinor,
                )}
              </b>
            </div>

            {receipt.payments ? (
              <>
                {receipt.payments.cashMinor > 0 && (
                  <div>
                    <span>
                      Cash received
                    </span>

                    <span>
                      {money(
                        receipt.payments.cashMinor,
                      )}
                    </span>
                  </div>
                )}

                {receipt.payments.transferMinor > 0 && (
                  <div>
                    <span>
                      Bank transfer (manual)
                    </span>

                    <span>
                      {money(
                        receipt.payments.transferMinor,
                      )}
                    </span>
                  </div>
                )}

                {receipt.payments.cardMinor > 0 && (
                  <div>
                    <span>
                      Card / POS (manual)
                    </span>

                    <span>
                      {money(
                        receipt.payments.cardMinor,
                      )}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div>
                <span>
                  Cash received
                </span>

                <span>
                  {money(
                    receipt.tenderedMinor,
                  )}
                </span>
              </div>
            )}

            <div>
              <b>
                Change
              </b>

              <b>
                {money(
                  receipt.changeMinor,
                )}
              </b>
            </div>
          </div>

          <p className="pos-receipt-thanks">
            Thank you for shopping with
            Golden Rose Perfume.
          </p>
        </div>

        <div className="pos-receipt-buttons pos-no-print">
          <ActionButton
            type="button"
            className="pos-primary"
            onClick={() =>
              window.print()
            }
          >
            <Printer size={17} />
            Print
          </ActionButton>

          <ActionButton
            type="button"
            className="pos-secondary"
            onClick={close}
          >
            Start new sale

            <ArrowRight size={16} />
          </ActionButton>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   MAIN POINT OF SALE REGISTER
   ========================================================= */

export function PosRegister({
  initial,
  loadError,
  role,
  staffId,
}: {
  initial: PosCatalogue;
  loadError: string | null;
  role: string;
  staffId: string;
}) {
  const [catalogue, setCatalogue] =
    useState(initial);

  const [locationId, setLocationId] =
    useState(
      initial.selectedLocationId || '',
    );

  const [search, setSearch] =
    useState('');

  const [catalogueView, setCatalogueView] =
    useState<CatalogueView>('table');

  const [focusMode, setFocusMode] =
    useState(true);

  // Multiple held transactions.

  const [heldSales, setHeldSales] =
    useState<HeldSale[]>([]);

  const heldSalesRef =
    useRef<HeldSale[]>([]);

  const [heldLoaded, setHeldLoaded] =
    useState(false);

  const [heldError, setHeldError] =
    useState('');

  const [recallOpen, setRecallOpen] =
    useState(false);

  // Barcode scanner state.

  const [scanning, setScanning] =
    useState(false);

  const scanCount =
    useRef(0);

  // Active basket.

  const [inStockOnly, setInStockOnly] =
    useState(false);

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [discount, setDiscount] =
    useState('0');

  const [cash, setCash] =
    useState('');

  // Loading and payment state.

  const [busy, setBusy] =
    useState(false);

  const [searching, setSearching] =
    useState(false);

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [notice, setNotice] =
    useState<Alert | null>(
      loadError
        ? {
            kind: 'error',
            message: loadError,
          }
        : null,
    );

  // Receipt and modal state.

  const [receipt, setReceipt] =
    useState<PosReceipt | null>(null);

  const [calculatorOpen, setCalculatorOpen] =
    useState(false);

  const [checkoutOpen, setCheckoutOpen] =
    useState(false);

  const [showMobileCart, setShowMobileCart] =
    useState(false);

  // Transaction recovery.

  const [pending, setPending] =
    useState<CashSaleRequest | null>(null);

  const [pendingLoaded, setPendingLoaded] =
    useState(false);

  // Request sequencing and duplicate protection.

  const searchSeq =
    useRef(0);

  const checkoutLock =
    useRef(false);

  const searchInputRef =
    useRef<HTMLInputElement>(null);

  const locked =
    !pendingLoaded ||
    busy ||
    pending !== null;

  const canManageHeld =
    heldLoaded &&
    !heldError &&
    !locked &&
    !checkoutOpen &&
    !scanning;

  /* =======================================================
     SALE TOTALS
     ======================================================= */

  const subtotal = cart.reduce(
    (sum, row) =>
      sum +
      row.product.priceMinor *
        row.quantity,
    0,
  );

  const discountMinor =
    parseNaira(discount);

  const cashMinor =
    parseNaira(cash);

  const discountLimit =
    role === 'owner' ||
    role === 'manager'
      ? 30
      : 10;

  const validDiscount =
    Number.isSafeInteger(subtotal) &&
    subtotal >= 0 &&
    discountMinor !== null &&
    discountMinor <=
      Math.floor(
        subtotal *
          discountLimit /
          100,
      );

  const total =
    subtotal -
    (
      validDiscount
        ? discountMinor!
        : 0
    );

  const canOpenCheckout =
    pendingLoaded &&
    !busy &&
    !scanning &&
    !recallOpen &&
    !!locationId &&
    cart.length > 0 &&
    validDiscount &&
    total > 0 &&
    pending === null;

  const canPay =
    canOpenCheckout &&
    cashMinor !== null &&
    cashMinor >= total;

  const itemCount = cart.reduce(
    (sum, row) =>
      sum + row.quantity,
    0,
  );

  const filtered =
    inStockOnly
      ? catalogue.items.filter(
          item =>
            item.available > 0,
        )
      : catalogue.items;

  /* =======================================================
     RESTORE CATALOGUE VIEW PREFERENCE
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const saved =
          localStorage.getItem(
            VIEW_KEY,
          );

        if (
          saved === 'grid' ||
          saved === 'table'
        ) {
          setCatalogueView(saved);
        }

      } catch {
        // Storage is optional.
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     RESTORE MULTIPLE HELD TRANSACTIONS
     ======================================================= */

  // Held drafts are scoped to the authenticated
  // cashier and browser tab.

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setHeldLoaded(false);
      setHeldError('');

      try {
        const key =
          heldSalesKey(staffId);

        const raw =
          sessionStorage.getItem(key);

        let restored =
          parseHeldSales(raw);

        if (raw === null) {
          const legacy =
            sessionStorage.getItem(
              LEGACY_HELD_KEY,
            );

          if (
            legacy &&
            window.confirm(
              'An older held basket exists in this browser tab. Import it only if it belongs to you. Import now?',
            )
          ) {
            try {
              restored = [
                parseLegacyHeldSale(
                  legacy,
                  crypto.randomUUID(),
                ),
              ];

              sessionStorage.setItem(
                key,
                JSON.stringify(
                  restored,
                ),
              );

              // The new scoped queue has been committed.
              // Preserve the original if removal fails.

              try {
                sessionStorage.removeItem(
                  LEGACY_HELD_KEY,
                );
              } catch {
                // Keep the original backup.
              }

            } catch {
              restored = [];

              setNotice({
                kind: 'error',
                message:
                  'The old held basket could not be imported. Its original data has not been intentionally cleared.',
              });
            }
          }
        }

        heldSalesRef.current =
          restored;

        setHeldSales(restored);

      } catch {
        setHeldError(
          'Held baskets could not be restored safely. Do not clear browser storage; contact the owner.',
        );

      } finally {
        setHeldLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [staffId]);

  /* =======================================================
     PERSIST HELD BASKETS
     ======================================================= */

  function saveHeldSales(
    next: HeldSale[],
  ): boolean {
    try {
      sessionStorage.setItem(
        heldSalesKey(staffId),
        JSON.stringify(next),
      );

      heldSalesRef.current =
        next;

      setHeldSales(next);

      return true;

    } catch {
      setNotice({
        kind: 'error',
        message:
          'The held baskets could not be saved. Your current basket has not been cleared.',
      });

      return false;
    }
  }

  /* =======================================================
     RESTORE INTERRUPTED PAYMENTS
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const raw =
          sessionStorage.getItem(
            PENDING_KEY,
          );

        if (!raw) {
          return;
        }

        const saved: unknown =
          JSON.parse(raw);

        if (
          !saved ||
          typeof saved !== 'object' ||
          !('idempotencyKey' in saved) ||
          typeof saved.idempotencyKey !== 'string' ||
          !('items' in saved) ||
          !Array.isArray(saved.items)
        ) {
          return;
        }

        setPending(
          saved as CashSaleRequest,
        );

        setNotice({
          kind: 'info',
          message:
            'A previous transaction has an unconfirmed response. Recover it using the same reference.',
        });

      } catch {
        // Browser storage may be unavailable.

      } finally {
        setPendingLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     LIVE SERVER-PAGINATED CATALOGUE SEARCH
     ======================================================= */

  useEffect(() => {
    const id =
      ++searchSeq.current;

    const timer = setTimeout(
      async () => {
        setSearching(true);

        try {
          const data =
            await loadPosCatalogue(
              search,
              locationId || null,
            );

          if (
            id !== searchSeq.current
          ) {
            return;
          }

          setCatalogue(data);

          if (
            !locationId &&
            data.selectedLocationId
          ) {
            setLocationId(
              data.selectedLocationId,
            );
          }

        } catch (error) {
          if (
            id === searchSeq.current
          ) {
            setNotice({
              kind: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Product search failed.',
            });
          }

        } finally {
          if (
            id === searchSeq.current
          ) {
            setSearching(false);
          }
        }
      },

      300,
    );

    return () => {
      clearTimeout(timer);

      searchSeq.current =
        id + 1;
    };
  }, [
    search,
    locationId,
  ]);

  /* =======================================================
     AUTOMATIC NOTIFICATION DISMISSAL
     ======================================================= */

  useEffect(() => {
    if (
      !notice ||
      notice.kind === 'info'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      setNotice(null);
    }, 6500);

    return () =>
      clearTimeout(timer);

  }, [notice]);

  /* =======================================================
     ADD PRODUCT TO ACTIVE BASKET
     ======================================================= */

  const add = useCallback(
    (product: PosProduct) => {
      if (
        locked ||
        checkoutOpen ||
        product.available < 1 ||
        product.priceMinor <= 0 ||
        !Number.isSafeInteger(
          product.priceMinor,
        )
      ) {
        return;
      }

      setCart(rows => {
        const existing =
          rows.find(
            row =>
              row.product.id ===
              product.id,
          );

        if (
          !existing &&
          rows.length >= MAX_CART_LINES
        ) {
          setNotice({
            kind: 'error',
            message:
              'Maximum 40 different products per sale.',
          });

          return rows;
        }

        if (existing) {
          return rows.map(row =>
            row.product.id ===
              product.id
              ? {
                  ...row,

                  quantity:
                    Math.min(
                      row.quantity + 1,
                      MAX_PER_LINE,
                      row.product.available,
                    ),
                }
              : row,
          );
        }

        return [
          ...rows,
          {
            product,
            quantity: 1,
          },
        ];
      });
    },

    [
      locked,
      checkoutOpen,
    ],
  );

  /* =======================================================
     CHANGE PRODUCT QUANTITY
     ======================================================= */

  function quantity(
    id: string,
    delta: number,
  ) {
    if (
      locked ||
      checkoutOpen
    ) {
      return;
    }

    setCart(rows =>
      rows.flatMap(row => {
        if (
          row.product.id !== id
        ) {
          return [row];
        }

        const next =
          row.quantity + delta;

        if (next <= 0) {
          return [];
        }

        const permitted =
          Math.min(
            next,
            MAX_PER_LINE,
            row.product.available,
          );

        if (permitted <= 0) {
          return [];
        }

        return [
          {
            ...row,
            quantity:
              permitted,
          },
        ];
      }),
    );
  }

  /* =======================================================
     BARCODE AND EXACT SKU SEARCH
     ======================================================= */

  async function findBarcode(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key !== 'Enter' ||
      !search.trim() ||
      locked ||
      checkoutOpen
    ) {
      return;
    }

    event.preventDefault();

    const code =
      search.trim().toLowerCase();

    scanCount.current += 1;

    setScanning(true);

    try {
      const data =
        await loadPosCatalogue(
          code,
          locationId || null,
        );

      const matches =
        data.items.filter(
          item =>
            item.barcode?.toLowerCase() === code ||
            item.sku?.toLowerCase() === code,
        );

      if (matches.length > 1) {
        setNotice({
          kind: 'error',
          message:
            'Multiple products match this barcode or SKU. Select the intended product from the catalogue.',
        });

        return;
      }

      const exact =
        matches[0];

      if (
        exact &&
        exact.available > 0 &&
        exact.priceMinor > 0
      ) {
        add(exact);

        setSearch('');

      } else {
        setNotice({
          kind: 'info',
          message: exact
            ? 'This product is out of stock or has no valid selling price.'
            : 'No exact barcode or SKU match.',
        });
      }

    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Barcode search failed.',
      });

    } finally {
      scanCount.current -= 1;

      if (
        scanCount.current === 0
      ) {
        setScanning(false);
      }
    }
  }

  /* =======================================================
     LOAD MORE PRODUCTS
     ======================================================= */

  async function more() {
    if (
      !catalogue.hasMore ||
      loadingMore ||
      searching ||
      checkoutOpen
    ) {
      return;
    }

    const requestSearch =
      search;

    const requestLocation =
      locationId;

    const offset =
      catalogue.items.length;

    const sequence =
      searchSeq.current;

    setLoadingMore(true);

    try {
      const next =
        await loadPosCatalogue(
          requestSearch,
          requestLocation,
          offset,
        );

      if (
        sequence !==
        searchSeq.current
      ) {
        return;
      }

      setCatalogue(current => ({
        ...next,

        items: [
          ...current.items,
          ...next.items.filter(
            item =>
              !current.items.some(
                old =>
                  old.id === item.id,
              ),
          ),
        ],
      }));

    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not load more products.',
      });

    } finally {
      setLoadingMore(false);
    }
  }

  /* =======================================================
     REFRESH LIVE CATALOGUE
     ======================================================= */

  async function refreshCatalogue() {
    if (
      checkoutOpen ||
      searching
    ) {
      return;
    }

    const sequence =
      ++searchSeq.current;

    setSearching(true);

    try {
      const refreshed =
        await loadPosCatalogue(
          search,
          locationId || null,
        );

      if (
        sequence !==
        searchSeq.current
      ) {
        return;
      }

      setCatalogue(refreshed);

    } catch (error) {
      if (
        sequence ===
        searchSeq.current
      ) {
        setNotice({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Catalogue refresh failed.',
        });
      }

    } finally {
      if (
        sequence ===
        searchSeq.current
      ) {
        setSearching(false);
      }
    }
  }

  /* =======================================================
     COMPLETE PAYMENT
     ======================================================= */

  // Cash, bank transfer, physical card terminal,
  // and split payments use the same authenticated
  // atomic checkout path.

  async function pay(
    retry?: CashSaleRequest,
    payment?: SalePayment,
  ): Promise<boolean> {
    if (
      checkoutLock.current ||
      scanCount.current > 0 ||
      (
        !retry &&
        (
          !canOpenCheckout ||
          (
            !payment &&
            !canPay
          )
        )
      )
    ) {
      return false;
    }

    const allocation: SalePayment =
      payment ?? {
        method: 'cash',
        tenderedMinor: cashMinor ?? 0,
      };

    if (
      !retry &&
      (
        !validSalePayment(
          allocation,
          total,
        ) ||
        (
          allocation.payments !== undefined &&
          catalogue.paymentVersion !== 2
        )
      )
    ) {
      setNotice({
        kind: 'error',
        message:
          'Check the payment allocation and refresh the register.',
      });

      return false;
    }

    /*
     * Preserve the original transaction during retry
     * instead of generating another reference.
     */

    const request: CashSaleRequest =
      retry || {
        idempotencyKey:
          crypto.randomUUID(),

        locationId,

        ...allocation,

        items: cart.map(row => ({
          variantId:
            row.product.id,

          quantity:
            row.quantity,

          expectedPriceMinor:
            row.product.priceMinor,
        })),

        discountMinor:
          discountMinor ?? 0,
      };

    checkoutLock.current =
      true;

    /*
     * Persist the exact payment allocation and
     * transaction reference before dispatch.
     */

    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify(request),
      );

    } catch {
      checkoutLock.current =
        false;

      setNotice({
        kind: 'error',
        message:
          'Transaction storage is unavailable. No new sale was sent. Restore storage before confirming.',
      });

      return false;
    }

    setBusy(true);
    setPending(request);
    setNotice(null);

    try {
      const confirmed =
        await completeCashSale(request);

      try {
        sessionStorage.removeItem(
          PENDING_KEY,
        );
      } catch {
        // A stale confirmed reference remains
        // protected by backend idempotency.
      }

      setPending(null);
      setCart([]);
      setDiscount('0');
      setCash('');
      setReceipt(confirmed);
      setCheckoutOpen(false);
      setShowMobileCart(false);

      setNotice({
        kind: 'success',
        message:
          'Sale confirmed. The receipt was created and inventory was updated.',
      });

      try {
        setCatalogue(
          await loadPosCatalogue(
            search,
            locationId || null,
          ),
        );
      } catch {
        // A catalogue refresh failure does not
        // reverse a confirmed transaction.
      }

      return true;

    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Checkout was not confirmed.',
      });

      // Retain the transaction reference.
      // Do not automatically create another sale.

      return false;

    } finally {
      checkoutLock.current =
        false;

      setBusy(false);
    }
  }

  /* =======================================================
     CATALOGUE VIEW PREFERENCE
     ======================================================= */

  function chooseView(
    next: CatalogueView,
  ) {
    setCatalogueView(next);

    try {
      localStorage.setItem(
        VIEW_KEY,
        next,
      );
    } catch {
      // Optional preference.
    }
  }

  /* =======================================================
     CLEAR ACTIVE BASKET
     ======================================================= */

  function clearSale() {
    if (
      locked ||
      checkoutOpen ||
      scanCount.current > 0 ||
      !cart.length
    ) {
      return;
    }

    if (
      !window.confirm(
        'Clear all items from this unsaved sale?',
      )
    ) {
      return;
    }

    setCart([]);
    setDiscount('0');
    setCash('');

    setNotice({
      kind: 'info',
      message:
        'Unsaved basket cleared. No transaction was recorded.',
    });
  }

  /* =======================================================
     HOLD CURRENT TRANSACTION
     ======================================================= */

  function holdSale() {
    if (
      !canManageHeld ||
      checkoutLock.current ||
      scanCount.current > 0 ||
      !cart.length ||
      !locationId
    ) {
      return;
    }

    try {
      const held =
        makeHeldSale(
          crypto.randomUUID(),
          cart,
          locationId,
          discount,
        );

      const next =
        appendHeldBasket(
          heldSalesRef.current,
          held,
        );

      if (
        !saveHeldSales(next)
      ) {
        return;
      }

      setCart([]);
      setDiscount('0');
      setCash('');
      setSearch('');

      setNotice({
        kind: 'info',
        message:
          'Basket held. You can serve the next customer. No stock or payment was recorded.',
      });

      searchInputRef.current?.focus();

    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The basket could not be held.',
      });
    }
  }

  /* =======================================================
     OPEN RECALL MODAL
     ======================================================= */

  function openRecall() {
    if (
      !canManageHeld ||
      checkoutLock.current ||
      scanCount.current > 0
    ) {
      return;
    }

    setRecallOpen(true);
  }

  /* =======================================================
     RECALL OR SWAP HELD BASKET
     ======================================================= */

  function recallSale(
    id: string,
  ) {
    if (
      !canManageHeld ||
      checkoutLock.current ||
      scanCount.current > 0
    ) {
      return;
    }

    const result =
      takeHeldBasket(
        heldSalesRef.current,
        id,
      );

    if (!result) {
      setNotice({
        kind: 'error',
        message:
          'This held basket is no longer available.',
      });

      return;
    }

    if (
      !catalogue.locations.some(
        store =>
          store.id ===
          result.basket.locationId,
      )
    ) {
      setNotice({
        kind: 'error',
        message:
          'This basket belongs to a selling location that is no longer available.',
      });

      return;
    }

    try {
      /*
       * When another customer is active,
       * swap the baskets without overwriting
       * the active customer's products.
       */

      const next =
        cart.length
          ? appendHeldBasket(
              result.remaining,

              makeHeldSale(
                crypto.randomUUID(),
                cart,
                locationId,
                discount,
              ),
            )
          : result.remaining;

      if (
        !saveHeldSales(next)
      ) {
        return;
      }

      setLocationId(
        result.basket.locationId,
      );

      setCart(
        result.basket.cart,
      );

      setDiscount(
        result.basket.discount,
      );

      // A prior tender entry is not
      // evidence of received money.

      setCash('');
      setSearch('');
      setRecallOpen(false);

      setNotice({
        kind: 'info',
        message:
          'Basket recalled. Stock and prices will be verified at checkout; enter payment afresh.',
      });

    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The basket could not be recalled.',
      });
    }
  }

  /* =======================================================
     REMOVE UNPAID HELD TRANSACTION
     ======================================================= */

  function removeHeldSale(
    id: string,
  ) {
    if (
      !canManageHeld ||
      checkoutLock.current ||
      scanCount.current > 0
    ) {
      return;
    }

    const result =
      takeHeldBasket(
        heldSalesRef.current,
        id,
      );

    if (
      result &&
      saveHeldSales(
        result.remaining,
      )
    ) {
      setNotice({
        kind: 'info',
        message:
          'Unpaid held basket removed. No stock or payment was recorded.',
      });
    }
  }

  /* =======================================================
     RELEASE PENDING TRANSACTION AFTER REVIEW
     ======================================================= */

  function releasePending() {
    if (
      busy ||
      checkoutLock.current
    ) {
      return;
    }

    const approved =
      window.confirm(
        'First verify the sales records. A sale may have completed despite a lost response. Discard this transaction reference?',
      );

    if (!approved) {
      return;
    }

    try {
      sessionStorage.removeItem(
        PENDING_KEY,
      );

    } catch {
      setNotice({
        kind: 'error',
        message:
          'The saved transaction reference could not be removed safely. Contact the owner.',
      });

      return;
    }

    setPending(null);
    setCheckoutOpen(false);

    setNotice({
      kind: 'info',
      message:
        'Pending reference discarded after manual review. Check sales history before collecting payment again.',
    });
  }

  /* =======================================================
     OPEN CHECKOUT
     ======================================================= */

  function openCheckout() {
    if (
      !canOpenCheckout ||
      scanCount.current > 0
    ) {
      return;
    }

    setCheckoutOpen(true);
  }

  /* =======================================================
     REGISTER KEYBOARD SHORTCUTS
     ======================================================= */

  function onRegisterKey(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (
      checkoutOpen ||
      calculatorOpen ||
      recallOpen ||
      receipt
    ) {
      return;
    }

    if (
      event.key === 'F2'
    ) {
      event.preventDefault();

      searchInputRef.current?.focus();
      searchInputRef.current?.select();

      return;
    }

    if (
      event.key === 'F4' ||
      event.key === 'F6'
    ) {
      event.preventDefault();

      if (
        event.key === 'F4'
      ) {
        holdSale();
      } else {
        openRecall();
      }

      return;
    }

    if (
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key === 'Enter'
    ) {
      event.preventDefault();

      openCheckout();

      return;
    }

    if (
      event.key === 'Escape' &&
      showMobileCart
    ) {
      event.preventDefault();

      setShowMobileCart(false);
    }
  }

  /* =======================================================
     MAIN REGISTER INTERFACE
     ======================================================= */

  return (
    <ActionScope pending={busy}>
      <div
        className={
          'pos-screen' +
          (
            focusMode
              ? ' pos-focus-mode'
              : ''
          )
        }
        onKeyDown={onRegisterKey}
      >

        {/* ===============================================
            REGISTER NOTIFICATIONS
            =============================================== */}

        {notice && (
          <div
            className={
              'pos-toast ' +
              notice.kind
            }
            role={
              notice.kind === 'error'
                ? 'alert'
                : 'status'
            }
          >
            {notice.kind === 'error' ? (
              <AlertCircle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}

            <span>
              {notice.message}
            </span>

            <ActionButton
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setNotice(null)
              }
            >
              <X size={16} />
            </ActionButton>
          </div>
        )}

        {/* ===============================================
            REGISTER HEADER
            =============================================== */}

        <header className="pos-heading">
          <div>
            <p className="pos-eyebrow">
              RETAIL OPERATIONS / IN STORE
            </p>

            <h1>
              Point of Sale
              <span>.</span>
            </h1>

            <p>
              A dedicated fragrance counter,
              connected to your Golden Rose
              inventory.
            </p>
          </div>

          <div className="pos-heading-actions">
            <span className="pos-online">
              <i />
              Cash register
            </span>

            <ActionButton
              type="button"
              className="pos-secondary"
              disabled={busy || checkoutOpen}
              onClick={() =>
                setCalculatorOpen(true)
              }
            >
              <Calculator size={16} />
              Calculator
            </ActionButton>

            <Link
              href="/workspace/orders"
              className="pos-secondary"
            >
              <History size={16} />
              Sales history
            </Link>

            <ActionButton
              type="button"
              className="pos-secondary"
              aria-pressed={focusMode}
              onClick={() =>
                setFocusMode(
                  current => !current,
                )
              }
            >
              {focusMode ? (
                <Minimize2 size={16} />
              ) : (
                <Maximize2 size={16} />
              )}

              {focusMode
                ? 'Exit register view'
                : 'Register view'}
            </ActionButton>
          </div>
        </header>

        {/* ===============================================
            SELLING LOCATION
            =============================================== */}

        <section className="pos-store-bar">
          <label htmlFor="pos-location">
            Selling location
          </label>

          <div className="pos-select">
            <select
              id="pos-location"
              value={locationId}
              disabled={
                locked ||
                checkoutOpen ||
                scanning ||
                cart.length > 0
              }
              onChange={event => {
                setLocationId(
                  event.target.value,
                );

                setSearch('');
              }}
            >
              <option value="">
                Choose a store
              </option>

              {catalogue.locations.map(
                store => (
                  <option
                    key={store.id}
                    value={store.id}
                  >
                    {store.name}
                    {' · '}
                    {store.code}
                  </option>
                ),
              )}
            </select>

            <ChevronDown size={16} />
          </div>

          <span className="pos-store-caption">
            <ScanBarcode size={16} />
            Barcode-ready
          </span>

          <span className="pos-store-caption">
            <CheckCircle2 size={16} />
            Verified receipts
          </span>
        </section>

        {/* ===============================================
            MISSING STORE CONFIGURATION
            =============================================== */}

        {!locationId && (
          <div className="pos-setup-alert">
            <AlertCircle size={19} />

            <span>
              <b>
                No selling location configured
              </b>

              <small>
                Create an active location in
                Inventory before recording sales.
              </small>
            </span>

            <Link href="/workspace/inventory">
              Open inventory

              <ArrowRight size={15} />
            </Link>
          </div>
        )}

        {/* ===============================================
            INTERRUPTED PAYMENT RECOVERY
            =============================================== */}

        {pending && (
          <div className="pos-pending">
            <AlertCircle size={19} />

            <span>
              <b>
                Previous transaction not yet confirmed
              </b>

              <small>
                Recover the same reference.
                Starting another transaction
                could duplicate the sale.
              </small>
            </span>

            <ActionButton
              type="button"
              className="pos-primary"
              disabled={busy}
              onClick={() =>
                setCheckoutOpen(true)
              }
            >
              Recover payment
            </ActionButton>

            <ActionButton
              type="button"
              className="pos-text-button"
              disabled={busy}
              onClick={releasePending}
            >
              Discard after checking
            </ActionButton>
          </div>
        )}

        {/* ===============================================
            PRODUCT CATALOGUE AND CURRENT BASKET
            =============================================== */}

        <div className="pos-columns">
          <section
            className="pos-catalogue"
            aria-labelledby="pos-catalogue-title"
          >
            <div className="pos-section-title">
              <div>
                <p className="pos-eyebrow">
                  GOLDEN ROSE COLLECTION
                </p>

                <h2 id="pos-catalogue-title">
                  Find a fragrance
                </h2>
              </div>

              <span className="pos-counter">
                {catalogue.items.length}
                {' '}shown
              </span>
            </div>

            {/* ===========================================
                PRODUCT SEARCH
                =========================================== */}

            <div className="pos-search-row">
              <label className="pos-search">
                <Search size={19} />

                <input
                  type="search"
                  ref={searchInputRef}
                  value={search}
                  onChange={event =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  onKeyDown={findBarcode}
                  placeholder="Search name, SKU or scan barcode"
                  aria-label="Search products or scan barcode"
                  disabled={!locationId}
                  autoComplete="off"
                  maxLength={100}
                />

                {searching ? (
                  <small>
                    Searching…
                  </small>
                ) : (
                  <ScanBarcode size={19} />
                )}
              </label>

              <ActionButton
                type="button"
                className="pos-secondary pos-refresh"
                aria-label="Refresh catalogue"
                disabled={searching || checkoutOpen}
                onClick={() =>
                  void refreshCatalogue()
                }
              >
                <RefreshCw size={18} />
              </ActionButton>
            </div>

            {/* ===========================================
                PRODUCT FILTERS AND VIEW CONTROLS
                =========================================== */}

            <div className="pos-filter-row">
              <div className="pos-segments">
                <ActionButton
                  type="button"
                  className={
                    !inStockOnly
                      ? 'selected'
                      : ''
                  }
                  aria-pressed={!inStockOnly}
                  onClick={() =>
                    setInStockOnly(false)
                  }
                >
                  All fragrances
                </ActionButton>

                <ActionButton
                  type="button"
                  className={
                    inStockOnly
                      ? 'selected'
                      : ''
                  }
                  aria-pressed={inStockOnly}
                  onClick={() =>
                    setInStockOnly(true)
                  }
                >
                  In stock
                </ActionButton>
              </div>

              <div
                className="pos-view-choices"
                role="group"
                aria-label="Catalogue display format"
              >
                <ActionButton
                  type="button"
                  onClick={() =>
                    chooseView('table')
                  }
                  aria-pressed={
                    catalogueView ===
                    'table'
                  }
                >
                  <List size={16} />
                  Table
                </ActionButton>

                <ActionButton
                  type="button"
                  onClick={() =>
                    chooseView('grid')
                  }
                  aria-pressed={
                    catalogueView ===
                    'grid'
                  }
                >
                  <LayoutGrid size={16} />
                  Grid
                </ActionButton>
              </div>
            </div>

            {/* ===========================================
                PRODUCT TABLE / GRID
                =========================================== */}

            {filtered.length > 0 ? (
              catalogueView === 'table' ? (
                <div className="pos-product-table-wrap">
                  <table className="pos-product-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          Product / SKU
                        </th>

                        <th scope="col">
                          Barcode
                        </th>

                        <th scope="col">
                          Available
                        </th>

                        <th scope="col">
                          Price
                        </th>

                        <th scope="col">
                          <span className="pos-sr-only">
                            Add item
                          </span>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map(product => {
                        const selected =
                          cart.find(
                            row =>
                              row.product.id ===
                              product.id,
                          )?.quantity || 0;

                        const cannotAdd =
                          locked ||
                          checkoutOpen ||
                          product.priceMinor <= 0 ||
                          product.available <= selected ||
                          selected >= MAX_PER_LINE;

                        return (
                          <tr key={product.id}>
                            <td>
                              <div className="pos-table-product">
                                <ProductPhoto
                                  product={product}
                                />

                                <span>
                                  <strong>
                                    {product.name}
                                  </strong>

                                  <small>
                                    {product.brand ||
                                      'Golden Rose'}

                                    {' · '}

                                    {product.sizeMl
                                      ? product.sizeMl +
                                        ' ml'
                                      : 'Fragrance'}

                                    {' · '}

                                    {product.sku ||
                                      'No SKU'}
                                  </small>
                                </span>
                              </div>
                            </td>

                            <td className="pos-table-code">
                              {product.barcode ||
                                '—'}
                            </td>

                            <td>
                              <span
                                className={
                                  product.available > 0
                                    ? 'pos-instock'
                                    : 'pos-outstock'
                                }
                              >
                                {product.available}
                                {' '}available
                              </span>
                            </td>

                            <td className="pos-table-price">
                              {money(
                                product.priceMinor,
                              )}
                            </td>

                            <td>
                              <ActionButton
                                type="button"
                                className="pos-table-add"
                                disabled={cannotAdd}
                                onClick={() =>
                                  add(product)
                                }
                                aria-label={
                                  'Add ' +
                                  product.name +
                                  ' to sale'
                                }
                              >
                                <Plus size={15} />
                                Add
                              </ActionButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="pos-products">
                  {filtered.map(product => {
                    const selected =
                      cart.find(
                        row =>
                          row.product.id ===
                          product.id,
                      )?.quantity || 0;

                    const cannotAdd =
                      locked ||
                      checkoutOpen ||
                      product.priceMinor <= 0 ||
                      product.available <= selected ||
                      selected >= MAX_PER_LINE;

                    return (
                      <article
                        className="pos-product"
                        key={product.id}
                      >
                        <ProductPhoto
                          product={product}
                        />

                        <div className="pos-product-info">
                          <p className="pos-product-brand">
                            {product.brand ||
                              'GOLDEN ROSE'}
                          </p>

                          <h3>
                            {product.name}
                          </h3>

                          <p className="pos-product-detail">
                            {product.sizeMl
                              ? product.sizeMl +
                                ' ml'
                              : 'Fragrance'}

                            {' · '}

                            {product.sku ||
                              'No SKU'}
                          </p>

                          <div className="pos-product-price">
                            <b>
                              {money(
                                product.priceMinor,
                              )}
                            </b>

                            <small
                              className={
                                product.available > 0
                                  ? 'pos-instock'
                                  : 'pos-outstock'
                              }
                            >
                              {product.available}
                              {' '}in stock
                            </small>
                          </div>

                          <ActionButton
                            type="button"
                            disabled={cannotAdd}
                            onClick={() =>
                              add(product)
                            }
                          >
                            <Plus size={16} />
                            Add to sale
                          </ActionButton>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="pos-empty">
                <Package size={32} />

                <h3>
                  {search
                    ? 'No matching fragrances'
                    : 'The product catalogue is empty'}
                </h3>

                <p>
                  {search
                    ? 'Try another fragrance name, SKU or barcode.'
                    : 'Import products through Data Management and receive stock into the selected store.'}
                </p>

                {!search && (
                  <Link href="/workspace/migration">
                    Open Data Management

                    <ArrowRight size={15} />
                  </Link>
                )}
              </div>
            )}

            {/* ===========================================
                CATALOGUE PAGINATION
                =========================================== */}

            {catalogue.hasMore && (
              <ActionButton
                type="button"
                className="pos-more"
                disabled={
                  loadingMore ||
                  searching ||
                  checkoutOpen
                }
                pending={loadingMore}
                pendingLabel="Loading…"
                onClick={() =>
                  void more()
                }
              >
                Load more fragrances

                <ArrowRight size={15} />
              </ActionButton>
            )}

            <p className="pos-catalogue-foot">
              Stock belongs to the selected location.
              Prices and quantities are verified again
              during checkout.
            </p>
          </section>

          {/* =============================================
              CURRENT CUSTOMER BASKET
              ============================================= */}

          <aside
            className={
              'pos-cart' +
              (
                showMobileCart
                  ? ' pos-cart-open'
                  : ''
              )
            }
            aria-label="Current sale"
          >
            <header className="pos-cart-heading">
              <div>
                <p className="pos-eyebrow">
                  WALK-IN CUSTOMER
                </p>

                <h2>
                  Current sale
                </h2>
              </div>

              <span className="pos-counter">
                {itemCount}
                {' '}

                {itemCount === 1
                  ? 'item'
                  : 'items'}
              </span>
            </header>

            {/* ===========================================
                HOLD / RECALL / CLEAR
                =========================================== */}

            <div
              className="pos-basket-tools"
              role="group"
              aria-label="Unsaved sale actions"
            >
              <ActionButton
                type="button"
                disabled={
                  !canManageHeld ||
                  !cart.length ||
                  !locationId ||
                  heldSales.length >=
                    MAX_HELD_BASKETS
                }
                title="Hold sale (F4)"
                onClick={holdSale}
              >
                <PauseCircle size={15} />
                Hold
              </ActionButton>

              <ActionButton
                type="button"
                disabled={!canManageHeld}
                title="Recall sale (F6)"
                onClick={openRecall}
              >
                <RotateCcw size={15} />

                Recall ({heldSales.length})
              </ActionButton>

              <ActionButton
                type="button"
                disabled={
                  locked ||
                  scanning ||
                  checkoutOpen ||
                  !cart.length
                }
                onClick={clearSale}
              >
                <Trash2 size={15} />
                Clear
              </ActionButton>
            </div>

            {heldError ? (
              <p
                className="pos-held-note"
                role="alert"
              >
                {heldError}
              </p>
            ) : heldSales.length > 0 ? (
              <p
                className="pos-held-note"
                role="status"
              >
                {heldSales.length}
                {' '}unpaid{' '}

                {heldSales.length === 1
                  ? 'basket'
                  : 'baskets'}

                {' '}held in this tab.
                No stock reserved.

                {heldSales.length >=
                  MAX_HELD_BASKETS &&
                  ' Queue full: recall or remove a basket.'}
              </p>
            ) : null}

            {/* ===========================================
                CURRENT BASKET PRODUCTS
                =========================================== */}

            <div className="pos-cart-contents">
              {cart.length > 0 ? (
                cart.map(row => (
                  <article
                    className="pos-cart-item"
                    key={row.product.id}
                  >
                    <div className="pos-cart-item-main">
                      <div className="pos-cart-item-top">
                        <span>
                          <b>
                            {row.product.name}
                          </b>

                          <small>
                            {row.product.sku ||
                              'Fragrance'}

                            {' · '}

                            {money(
                              row.product.priceMinor,
                            )}

                            {' each'}
                          </small>
                        </span>

                        <ActionButton
                          type="button"
                          aria-label={
                            'Remove ' +
                            row.product.name
                          }
                          disabled={
                            locked ||
                            checkoutOpen
                          }
                          onClick={() =>
                            setCart(items =>
                              items.filter(
                                item =>
                                  item.product.id !==
                                  row.product.id,
                              ),
                            )
                          }
                        >
                          <X size={16} />
                        </ActionButton>
                      </div>

                      <div className="pos-cart-item-bottom">
                        <div className="pos-quantity">
                          <ActionButton
                            type="button"
                            aria-label="Decrease quantity"
                            disabled={
                              locked ||
                              checkoutOpen
                            }
                            onClick={() =>
                              quantity(
                                row.product.id,
                                -1,
                              )
                            }
                          >
                            <Minus size={14} />
                          </ActionButton>

                          <b>
                            {row.quantity}
                          </b>

                          <ActionButton
                            type="button"
                            aria-label="Increase quantity"
                            disabled={
                              locked ||
                              checkoutOpen ||
                              row.quantity >=
                                Math.min(
                                  row.product.available,
                                  MAX_PER_LINE,
                                )
                            }
                            onClick={() =>
                              quantity(
                                row.product.id,
                                1,
                              )
                            }
                          >
                            <Plus size={14} />
                          </ActionButton>
                        </div>

                        <strong>
                          {money(
                            row.quantity *
                              row.product.priceMinor,
                          )}
                        </strong>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="pos-cart-empty">
                  <ShoppingBag size={35} />

                  <h3>
                    No items yet
                  </h3>

                  <p>
                    Scan a barcode or select a
                    fragrance to begin this sale.
                  </p>
                </div>
              )}
            </div>

            {/* ===========================================
                SALE TOTALS AND CHECKOUT
                =========================================== */}

            <div className="pos-checkout">
              <div className="pos-summary-row">
                <span>
                  Subtotal
                </span>

                <strong>
                  {money(subtotal)}
                </strong>
              </div>

              {discountMinor !== null &&
                discountMinor > 0 && (
                  <div className="pos-summary-row">
                    <span>
                      Discount
                    </span>

                    <strong>
                      −{money(discountMinor)}
                    </strong>
                  </div>
                )}

              <div className="pos-summary-row pos-tax">
                <span>
                  Tax
                </span>

                <span>
                  Not configured
                </span>
              </div>

              <div className="pos-amount-due">
                <span>
                  TOTAL PAYABLE
                </span>

                <strong>
                  {money(total)}
                </strong>
              </div>

              {!validDiscount &&
                cart.length > 0 && (
                  <p className="pos-field-error">
                    Review the discount amount
                    before checkout.
                  </p>
                )}

              <ActionButton
                type="button"
                className="pos-primary pos-pay"
                disabled={!canOpenCheckout}
                onClick={openCheckout}
              >
                <span>
                  <ReceiptText size={19} />
                  Checkout
                </span>

                <span>
                  {money(total)}

                  <ArrowRight size={18} />
                </span>
              </ActionButton>

              <p className="pos-register-shortcuts">
                F2: Scan/search · F4: Hold ·
                F6: Recall · Ctrl+Enter: Checkout
              </p>

              <p className="pos-safe">
                <CheckCircle2 size={14} />

                The sale is recorded only after
                payment is confirmed.
              </p>
            </div>
          </aside>
        </div>

        {/* ===============================================
            MOBILE CART CONTROL
            =============================================== */}

        <ActionButton
          type="button"
          className="pos-mobile-cart-button"
          aria-expanded={showMobileCart}
          onClick={() =>
            setShowMobileCart(
              current => !current,
            )
          }
        >
          <ShoppingBag size={19} />

          {showMobileCart
            ? 'Browse fragrances'
            : 'View current sale'}

          <strong>
            {money(total)}
          </strong>
        </ActionButton>

        {/* ===============================================
            COMPLETE PAYMENT CHECKOUT
            =============================================== */}

        <PosCheckoutModal
          open={checkoutOpen}

          lines={
            cart.map(row => ({
              id:
                row.product.id,

              name:
                row.product.name,

              sku:
                row.product.sku,

              quantity:
                row.quantity,

              unitPriceMinor:
                row.product.priceMinor,
            }))
          }

          customerName=""

          paymentVersion={
            catalogue.paymentVersion
          }

          receivingAccount={
            catalogue.receivingAccount
          }

          pendingPayment={
            pending
          }

          subtotalMinor={
            subtotal
          }

          discountMinor={
            discountMinor ?? 0
          }

          discountNaira={
            discount
          }

          discountLimitPercent={
            discountLimit
          }

          validDiscount={
            validDiscount
          }

          onDiscountChange={
            setDiscount
          }

          totalMinor={
            total
          }

          taxMinor={null}

          cashNaira={cash}

          cashMinor={cashMinor}

          onCashChange={setCash}

          pendingReference={
            pending?.idempotencyKey ?? null
          }

          busy={busy}

          onClose={() => {
            if (!busy) {
              setCheckoutOpen(false);
            }
          }}

          onConfirmCash={payment =>
            pay(
              pending ?? undefined,
              payment,
            )
          }
        />

        {/* ===============================================
            HELD TRANSACTION RECALL MODAL
            =============================================== */}

        {recallOpen && (
          <HeldBasketDialog
            baskets={
              heldSales.map(sale => ({
                id:
                  sale.id,

                createdAt:
                  sale.createdAt,

                location:
                  catalogue.locations.find(
                    store =>
                      store.id ===
                      sale.locationId,
                  )?.name ??
                  'Unavailable selling location',

                discountMinor:
                  parseNaira(
                    sale.discount,
                  ),

                lines:
                  sale.cart.map(
                    ({
                      product,
                      quantity,
                    }) => ({
                      id:
                        product.id,

                      name:
                        product.name,

                      sku:
                        product.sku,

                      sizeMl:
                        product.sizeMl,

                      quantity,

                      priceMinor:
                        product.priceMinor,
                    }),
                  ),
              }))
            }

            hasActiveBasket={
              cart.length > 0
            }

            disabled={
              !canManageHeld
            }

            errorMessage={
              notice?.kind === 'error'
                ? notice.message
                : undefined
            }

            close={() =>
              setRecallOpen(false)
            }

            recall={
              recallSale
            }

            remove={
              removeHeldSale
            }
          />
        )}

        {/* ===============================================
            REGISTER CALCULATOR
            =============================================== */}

        {calculatorOpen && (
          <CalculatorDialog
            close={() =>
              setCalculatorOpen(false)
            }

            onUseValue={
              setCash
            }
          />
        )}

        {/* ===============================================
            COMPLETED SALES RECEIPT
            =============================================== */}

        {receipt && (
          <ReceiptDialog
            receipt={receipt}

            close={() =>
              setReceipt(null)
            }
          />
        )}
      </div>
    </ActionScope>
  );
}