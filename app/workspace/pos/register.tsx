
'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import Link from 'next/link';
import Image from 'next/image';

import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Calculator,
  CheckCircle2,
  FlaskConical,
  History,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  PauseCircle,
  RotateCcw,
  ChevronDown,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';

import {
  completeCashSale,
  loadPosCatalogue,
} from './actions';

import type {
  CashSaleRequest,
  PosCatalogue,
  PosProduct,
  PosReceipt,
} from './types';

const formatMoney = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (minor: number) =>
  formatMoney.format(minor / 100);

const PENDING_KEY = 'golden-rose-pos-pending-sale';
const HELD_KEY = 'golden-rose-pos-held-sale';
const VIEW_KEY = 'golden-rose-pos-catalogue-view';
const DEMO_MODE_KEY = 'golden-rose-pos-demo-mode';
const MAX_CART_LINES = 40;
const MAX_PER_LINE = 100;
const DEMO_STOCK_PER_QA_PRODUCT = 25;

type CartItem = {
  product: PosProduct;
  quantity: number;
};

type Alert = {
  kind: 'error' | 'success' | 'info';
  message: string;
};

type CatalogueView = 'grid' | 'table';

/**
 * Demo-only stock is never sent to Supabase. Genuine quantities remain unchanged.
 * Both the explicit test name and the fixture SKU must match.
 */
function isQaProduct(product: PosProduct): boolean {
  return /^QA TEST Fragrance \d+/i.test(product.name) &&
    /^GRQA-/i.test(product.sku || '');
}

type DemoReceipt = {
  reference: string;
  createdAt: string;
  locationName: string;
  items: CartItem[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
};

type HeldSale = {
  cart: CartItem[];
  locationId: string;
  discount: string;
  cash: string;
  createdAt: number;
  demo?: boolean;
};

function isHeldSale(value: unknown): value is HeldSale {
  if (!value || typeof value !== 'object') return false;
  const sale = value as Partial<HeldSale>;
  return (
    typeof sale.locationId === 'string' &&
    typeof sale.discount === 'string' &&
    typeof sale.cash === 'string' &&
    typeof sale.createdAt === 'number' &&
    Array.isArray(sale.cart) &&
    sale.cart.length > 0 &&
    sale.cart.length <= MAX_CART_LINES &&
    sale.cart.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as Partial<CartItem>;
      return (
        Number.isInteger(row.quantity) &&
        (row.quantity ?? 0) >= 1 &&
        (row.quantity ?? 0) <= MAX_PER_LINE &&
        !!row.product &&
        typeof row.product.id === 'string' &&
        typeof row.product.name === 'string' &&
        Number.isSafeInteger(row.product.priceMinor) &&
        Number.isSafeInteger(row.product.available) &&
        row.product.currency === 'NGN'
      );
    })
  );
}

/**
 * Convert entered naira to integer kobo.
 * Never calculate transaction totals using floating-point naira.
 */
function parseNaira(text: string): number | null {
  const clean = text.trim().replace(/,/g, '');

  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(clean)) {
    return null;
  }

  const [whole, decimal = ''] = clean.split('.');

  const minor =
    Number(whole) * 100 +
    Number(decimal.padEnd(2, '0'));

  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Product photograph:
 * Show the approved cloud image when available.
 * Otherwise use a neutral Golden Rose placeholder.
 */
function ProductPhoto({
  product,
}: {
  product: PosProduct;
}) {
  const [failed, setFailed] = useState(false);

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
          onError={() => setFailed(true)}
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

/**
 * Standalone business calculator.
 * Using the result fills the cash-received field.
 * Calculator actions never create a transaction.
 */
/** Simulated checkout, clearly not a real receipt or server transaction. */
function DemoReceiptDialog({
  receipt,
  close,
}: {
  receipt: DemoReceipt;
  close: () => void;
}) {
  return (
    <div className="pos-modal-backdrop pos-demo-layer">
      <section className="pos-receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-demo-receipt-title">
        <div className="pos-dialog-header">
          <div>
            <small>SIMULATED TRANSACTION · NO PAYMENT COLLECTED</small>
            <h2 id="pos-demo-receipt-title">Demo checkout completed</h2>
          </div>
          <button className="pos-icon-btn" type="button" onClick={close} aria-label="Close demo receipt"><X size={18} /></button>
        </div>
        <div className="pos-demo-receipt">
          <div className="pos-demo-receipt-mark">DEMO — NOT A VALID RECEIPT</div>
          <div className="pos-demo-receipt-meta">
            <span>{receipt.reference}</span>
            <span>{new Date(receipt.createdAt).toLocaleString('en-NG')}</span>
            <span>{receipt.locationName}</span>
          </div>
          {receipt.items.map(row => (
            <div className="pos-demo-receipt-line" key={row.product.id}>
              <span>{row.product.name} × {row.quantity}</span>
              <b>{money(row.product.priceMinor * row.quantity)}</b>
            </div>
          ))}
          <div className="pos-demo-receipt-totals">
            <span>Subtotal</span><b>{money(receipt.subtotalMinor)}</b>
            <span>Discount</span><b>−{money(receipt.discountMinor)}</b>
            <span>Total</span><b>{money(receipt.totalMinor)}</b>
            <span>Cash entered</span><b>{money(receipt.tenderedMinor)}</b>
            <span>Change</span><b>{money(receipt.changeMinor)}</b>
          </div>
          <p>Test only. No sale, payment, stock movement, invoice, or receipt was saved to the database.</p>
        </div>
        <button type="button" onClick={close} className="pos-primary pos-wide">Close demo and start another test</button>
      </section>
    </div>
  );
}

function CalculatorDialog({
  close,
  onUseValue,
}: {
  close: () => void;
  onUseValue: (value: string) => void;
}) {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [close]);

  function press(key: string) {
    if (key === 'C') {
      setDisplay('0');
      setStored(null);
      setOperator(null);
      setReplace(false);
      return;
    }

    if (key === '⌫') {
      setDisplay(value => value.slice(0, -1) || '0');
      return;
    }

    if (['+', '−', '×', '÷'].includes(key)) {
      setStored(Number(display));
      setOperator(key);
      setReplace(true);
      return;
    }

    if (key === '=') {
      if (stored === null || !operator) {
        return;
      }

      const value = Number(display);

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
          ? String(Number(result.toFixed(2)))
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

      if (replace || current === 'Error') {
        return key === '.' ? '0.' : key;
      }

      if (
        current.replace(/\D/g, '').length >= 12
      ) {
        return current;
      }

      if (current === '0' && key === '00') {
        return '0';
      }

      return current === '0' && key !== '.'
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
        if (event.target === event.currentTarget) {
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
            <small>WORKSPACE TOOL</small>
            <h2 id="pos-calc-title">
              Calculator
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close calculator"
            className="pos-icon-btn"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>

        <output className="pos-calc-display">
          {display}
        </output>

        <div className="pos-calc-grid">
          {keys.map(key => (
            <button
              key={key}
              type="button"
              className={
                key === '=' ? 'pos-equals' : ''
              }
              onClick={() => press(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="pos-primary pos-wide"
          disabled={parseNaira(display) === null}
          onClick={() => {
            onUseValue(display);
            close();
          }}
        >
          Use as cash received
        </button>
      </section>
    </div>
  );
}

/**
 * Printable receipt from a server-confirmed POS transaction.
 */
function ReceiptDialog({
  receipt,
  close,
}: {
  receipt: PosReceipt;
  close: () => void;
}) {
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
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
            <small>PAYMENT CONFIRMED</small>
            <h2>Sale completed</h2>
          </div>

          <button
            type="button"
            className="pos-icon-btn"
            aria-label="Close receipt"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="pos-receipt-paper"
          id="pos-print-receipt"
        >
          <div className="pos-receipt-brand">
            <strong>GOLDEN ROSE</strong>
            <small>BEAUTY OF FRAGRANCE</small>
          </div>

          <h2 id="pos-receipt-title">
            Sales receipt
          </h2>

          <div className="pos-receipt-meta">
            <span>Receipt</span>
            <b>
              GR-
              {String(receipt.saleNumber).padStart(
                7,
                '0',
              )}
            </b>

            <span>Date</span>
            <span>
              {new Date(
                receipt.createdAt,
              ).toLocaleString('en-NG')}
            </span>

            <span>Location</span>
            <span>{receipt.locationName}</span>

            <span>Payment</span>
            <span>Cash</span>
          </div>

          <div className="pos-receipt-lines">
            {receipt.items.map((line, index) => (
              <div key={index}>
                <span>
                  <b>{line.name}</b>
                  <small>
                    {line.quantity} ×{' '}
                    {money(line.unitPriceMinor)}
                    {' · '}
                    {line.sku || 'Perfume'}
                  </small>
                </span>

                <b>
                  {money(line.lineTotalMinor)}
                </b>
              </div>
            ))}
          </div>

          <div className="pos-receipt-totals">
            <div>
              <span>Subtotal</span>
              <span>
                {money(receipt.subtotalMinor)}
              </span>
            </div>

            <div>
              <span>Discount</span>
              <span>
                −{money(receipt.discountMinor)}
              </span>
            </div>

            <div>
              <span>Tax</span>
              <span>
                {money(receipt.taxMinor)}
              </span>
            </div>

            <div className="pos-receipt-grand">
              <b>Total</b>
              <b>
                {money(receipt.totalMinor)}
              </b>
            </div>

            <div>
              <span>Cash received</span>
              <span>
                {money(receipt.tenderedMinor)}
              </span>
            </div>

            <div>
              <b>Change</b>
              <b>
                {money(receipt.changeMinor)}
              </b>
            </div>
          </div>

          <p className="pos-receipt-thanks">
            Thank you for shopping with
            Golden Rose Perfume.
          </p>
        </div>

        <div className="pos-receipt-buttons pos-no-print">
          <button
            className="pos-primary"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={17} />
            Print
          </button>

          <button
            className="pos-secondary"
            type="button"
            onClick={close}
          >
            Start new sale
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * Full Golden Rose in-store register.
 *
 * Loads real products and stock.
 * Allows basket management and cash calculation.
 * Uses an idempotent server transaction for checkout.
 */
export function PosRegister({
  initial,
  loadError,
  role,
}: {
  initial: PosCatalogue;
  loadError: string | null;
  role: string;
}) {
  const [catalogue, setCatalogue] =
    useState(initial);

  const [locationId, setLocationId] =
    useState(initial.selectedLocationId || '');

  const [search, setSearch] = useState('');
  const [catalogueView, setCatalogueView] = useState<CatalogueView>('table');
  // Open straight into the dedicated cashier workspace on desktop.
  const [focusMode, setFocusMode] = useState(true);
  const [heldSale, setHeldSale] = useState<HeldSale | null>(null);
  const canTestQa = role === 'owner' || role === 'manager' || role === 'cashier';
  // Testing is opt-in. No simulated inventory is shown automatically.
  const [demoMode, setDemoMode] = useState(false);
  const [demoSold, setDemoSold] = useState<Record<string, number>>({});
  const [demoReceipt, setDemoReceipt] = useState<DemoReceipt | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'confirm' | 'payment'>('confirm');
  const paymentDialogRef = useRef<HTMLElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);
  const checkoutButtonRef = useRef<HTMLButtonElement>(null);
  const [inStockOnly, setInStockOnly] =
    useState(false);

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [discount, setDiscount] =
    useState('0');

  const [cash, setCash] =
    useState('');

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

  const [receipt, setReceipt] =
    useState<PosReceipt | null>(null);

  const [calculatorOpen, setCalculatorOpen] =
    useState(false);

  const [showMobileCart, setShowMobileCart] =
    useState(false);

  const [pending, setPending] =
    useState<CashSaleRequest | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);

  const searchSeq = useRef(0);
  const checkoutLock = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Preferences and unsold held baskets are local to this browser, not server reservations.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const view = localStorage.getItem(VIEW_KEY);
        if (view === 'grid' || view === 'table') setCatalogueView(view);
        if (canTestQa && !sessionStorage.getItem(PENDING_KEY)) {
          const savedMode = sessionStorage.getItem(DEMO_MODE_KEY);
          setDemoMode(savedMode === '1');
        }
        const raw = sessionStorage.getItem(HELD_KEY);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (isHeldSale(saved)) setHeldSale(saved);
          else sessionStorage.removeItem(HELD_KEY);
        }
      } catch {
        // Storage may be blocked in private browsing.
      }
    });
    return () => { cancelled = true; };
  }, [canTestQa]);

  const locked =
    !pendingLoaded || busy || pending !== null;

  const subtotal = cart.reduce(
    (sum, row) =>
      sum +
      row.product.priceMinor * row.quantity,
    0,
  );

  const discountMinor =
    parseNaira(discount);

  const cashMinor =
    parseNaira(cash);

  const discountLimit =
    role === 'owner' || role === 'manager'
      ? 30
      : 10;

  const validDiscount =
    discountMinor !== null &&
    discountMinor <=
      Math.floor(
        subtotal * discountLimit / 100,
      );

  const total =
    subtotal -
    (validDiscount ? discountMinor! : 0);

  const change =
    cashMinor === null
      ? null
      : Math.max(0, cashMinor - total);

  const canPay =
    !locked &&
    !!locationId &&
    cart.length > 0 &&
    validDiscount &&
    cashMinor !== null &&
    cashMinor >= total;

  const withVisibleStock = (item: PosProduct): PosProduct => {
    if (!demoMode || !isQaProduct(item)) return item;
    return {
      ...item,
      available: Math.max(
        0,
        DEMO_STOCK_PER_QA_PRODUCT - (demoSold[item.id] ?? 0),
      ),
    };
  };

  // QA fixtures stay out of normal production-facing product results.
  const visibleItems = catalogue.items
    .filter(item => demoMode ? isQaProduct(item) : !isQaProduct(item))
    .map(withVisibleStock);
  const filtered = inStockOnly
    ? visibleItems.filter(item => item.available > 0)
    : visibleItems;

  /**
   * Restore a previous transaction ID after an
   * interrupted network request or page refresh.
   */
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const saved: unknown = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' ||
            !('idempotencyKey' in saved) || typeof saved.idempotencyKey !== 'string' ||
            !('items' in saved) || !Array.isArray(saved.items)) return;
        setPending(saved as CashSaleRequest);
        setNotice({
          kind: 'info',
          message: 'A previous sale has an unconfirmed response. Retry the same reference before starting another.',
        });
      } catch {
        // Private browsing can block session storage.
      } finally {
        setPendingLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  /**
   * Live server-side catalogue search.
   * A sequence counter prevents stale results.
   */
  useEffect(() => {
    const id = ++searchSeq.current;

    const timer = setTimeout(async () => {
      setSearching(true);

      try {
        const data =
          await loadPosCatalogue(
            search,
            locationId || null,
          );

        if (id !== searchSeq.current) {
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
        if (id === searchSeq.current) {
          setNotice({
            kind: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Product search failed.',
          });
        }
      } finally {
        if (id === searchSeq.current) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      searchSeq.current = id + 1;
    };
  }, [search, locationId]);

  /**
   * Dismiss ordinary notifications automatically.
   * Pending-transaction warnings remain visible.
   */
  useEffect(() => {
    if (!notice || notice.kind === 'info') {
      return;
    }

    const timer = setTimeout(
      () => setNotice(null),
      6500,
    );

    return () => clearTimeout(timer);
  }, [notice]);

  function add(product: PosProduct) {
    if (locked || product.available < 1 || (demoMode && !isQaProduct(product))) {
      return;
    }

    const found = cart.find(
      row => row.product.id === product.id,
    );

    if (
      !found &&
      cart.length >= MAX_CART_LINES
    ) {
      setNotice({
        kind: 'error',
        message:
          'Maximum 40 different products per sale.',
      });
      return;
    }

    setCart(rows => {
      const existing = rows.find(row => row.product.id === product.id);
      if (existing) {
        return rows.map(row => row.product.id === product.id ? {
          ...row,
          quantity: Math.min(row.quantity + 1, MAX_PER_LINE, row.product.available),
        } : row);
      }
      if (rows.length >= MAX_CART_LINES) return rows;
      return [...rows, { product, quantity: 1 }];
    });
    setNotice({ kind: 'success', message: `${product.name} added to the sale. Repeated scans increase quantity.` });
  }

  function quantity(
    id: string,
    delta: number,
  ) {
    if (locked) {
      return;
    }

    setCart(rows =>
      rows.flatMap(row => {
        if (row.product.id !== id) {
          return [row];
        }

        const next =
          row.quantity + delta;

        if (next <= 0) {
          return [];
        }

        return [
          {
            ...row,
            quantity: Math.min(
              MAX_PER_LINE,
              row.product.available,
              next,
            ),
          },
        ];
      }),
    );
  }

  /**
   * A USB barcode scanner usually enters text
   * followed by Enter.
   */
  async function findBarcode(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key !== 'Enter' ||
      !search.trim()
    ) {
      return;
    }

    event.preventDefault();

    const code =
      search.trim().toLowerCase();

    try {
      const data =
        await loadPosCatalogue(
          code,
          locationId || null,
        );

      const match = data.items.find(
        item =>
          item.barcode?.toLowerCase() === code ||
          item.sku?.toLowerCase() === code,
      );
      const exact = match ? withVisibleStock(match) : null;

      if (exact && exact.available > 0 && (!demoMode || isQaProduct(exact))) {
        add(exact);
        setSearch('');
      } else {
        setNotice({
          kind: 'info',
          message: exact
            ? 'This item is out of stock.'
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
    }
  }

  /**
   * Paginate the live catalogue without
   * loading thousands of records at once.
   */
  async function more() {
    if (
      !catalogue.hasMore ||
      loadingMore
    ) {
      return;
    }

    const requestSearch = search;
    const requestLocation = locationId;
    const pageOffset = catalogue.items.length;
    const requestSequence = searchSeq.current;

    setLoadingMore(true);

    try {
      const next =
        await loadPosCatalogue(
          requestSearch,
          requestLocation,
          pageOffset,
        );

      if (
        requestSequence !== searchSeq.current
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
                old => old.id === item.id,
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

  /**
   * Submit or safely retry a cash sale.
   * Never create a new transaction ID for a retry.
   */
  async function pay(
    retry?: CashSaleRequest,
  ) {
    if (
      checkoutLock.current ||
      (!retry && !canPay)
    ) {
      return;
    }

    const request: CashSaleRequest =
      retry || {
        idempotencyKey:
          crypto.randomUUID(),

        locationId,
        method: 'cash',

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

        tenderedMinor:
          cashMinor ?? 0,
      };

    // DEMO NEVER invokes completeCashSale, even if a real register is connected.
    if (demoMode && !retry) {
      if (!cart.every(row => isQaProduct(row.product))) {
        setNotice({ kind: 'error', message: 'Demo checkout only accepts QA TEST products.' });
        return;
      }
      const record: DemoReceipt = {
        reference: `DEMO-${Date.now()}`,
        createdAt: new Date().toISOString(),
        locationName: catalogue.locations.find(store => store.id === locationId)?.name || 'Test register',
        items: cart.map(row => ({ ...row, product: { ...row.product } })),
        subtotalMinor: subtotal,
        discountMinor: discountMinor ?? 0,
        totalMinor: total,
        tenderedMinor: cashMinor ?? 0,
        changeMinor: change ?? 0,
      };
      setDemoSold(previous => {
        const next = { ...previous };
        cart.forEach(row => {
          next[row.product.id] = (next[row.product.id] ?? 0) + row.quantity;
        });
        return next;
      });
      setCart([]);
      setDiscount('0');
      setCash('');
      setDemoReceipt(record);
      setCheckoutOpen(false);
      setShowMobileCart(false);
      setNotice({ kind: 'success', message: 'Demo completed locally. No real stock or sale was changed.' });
      return;
    }

    checkoutLock.current = true;

    setBusy(true);
    setPending(request);
    setNotice(null);

    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify(request),
      );
    } catch {
      // Preserve the pending request in memory.
    }

    try {
      const result =
        await completeCashSale(request);

      try {
        sessionStorage.removeItem(
          PENDING_KEY,
        );
      } catch {
        // Optional browser storage.
      }

      setPending(null);
      setCart([]);
      setDiscount('0');
      setCash('');

      setReceipt(result);
      setCheckoutOpen(false);
      setShowMobileCart(false);

      setNotice({
        kind: 'success',
        message:
          'Cash sale recorded. Inventory and receipt are confirmed.',
      });

      try {
        setCatalogue(
          await loadPosCatalogue(
            search,
            locationId,
          ),
        );
      } catch {
        // The sale is already recorded.
        // A failed refresh must not reverse it.
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Checkout failed.',
      });
    } finally {
      checkoutLock.current = false;
      setBusy(false);
    }
  }

  function changeDemoMode() {
    if (!canTestQa || locked) return;
    if ((cart.length || heldSale) &&
        !window.confirm('Switching demo mode clears the current and held baskets. Continue?')) {
      return;
    }
    setCart([]);
    setDiscount('0');
    setCash('');
    setHeldSale(null);
    setDemoSold({});
    setDemoReceipt(null);
    setShowMobileCart(false);
    setCheckoutOpen(false);
    try {
      sessionStorage.removeItem(HELD_KEY);
      sessionStorage.setItem(DEMO_MODE_KEY, demoMode ? '0' : '1');
    } catch { /* Optional storage. */ }
    setDemoMode(current => !current);
    setNotice({ kind: 'info', message: demoMode
      ? 'Live stock rules restored. Only verified inventory can be sold.'
      : 'QA test mode active: products have simulated stock. Checkout never writes to the database.' });
  }

  function chooseView(next: CatalogueView) {
    setCatalogueView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* Optional preference. */ }
  }

  function clearSale() {
    if (locked || !cart.length) return;
    if (!window.confirm('Clear all items from this unsaved sale?')) return;
    setCart([]);
    setDiscount('0');
    setCash('');
    setCheckoutOpen(false);
    setNotice({ kind: 'info', message: 'Unsaved basket cleared. No transaction was recorded.' });
  }

  function holdSale() {
    if (locked || !cart.length) return;
    if (heldSale && !window.confirm('Replace the previously held sale on this browser?')) return;
    const held: HeldSale = {
      cart: cart.map(row => ({ ...row, product: { ...row.product } })),
      locationId,
      discount,
      cash,
      createdAt: Date.now(),
      demo: demoMode,
    };
    setHeldSale(held);
    try { sessionStorage.setItem(HELD_KEY, JSON.stringify(held)); } catch { /* This tab still keeps it. */ }
    setCart([]);
    setDiscount('0');
    setCash('');
    setCheckoutOpen(false);
    setNotice({ kind: 'info', message: 'Sale held in this browser only. No stock is reserved or sold.' });
    searchInputRef.current?.focus();
  }

  function recallSale() {
    if (locked || !heldSale) return;
    if (!!heldSale.demo !== demoMode) {
      setNotice({ kind: 'error', message: 'Held basket belongs to a different register mode.' });
      return;
    }
    if (cart.length && !window.confirm('Replace the current unsaved basket with the held sale?')) return;
    if (!catalogue.locations.some(store => store.id === heldSale.locationId)) {
      setNotice({ kind: 'error', message: 'The held sale belongs to a location no longer available.' });
      return;
    }
    setLocationId(heldSale.locationId);
    setCart(heldSale.cart);
    setDiscount(heldSale.discount);
    setCash(heldSale.cash);
    setHeldSale(null);
    try { sessionStorage.removeItem(HELD_KEY); } catch { /* Optional storage. */ }
    setNotice({ kind: 'info', message: 'Sale recalled. Stock and prices are verified by the server at checkout.' });
  }

  // Payment is a separate step. Cart totals stay visible on the main register.
  function openCheckout() {
    if (locked || !cart.length || !locationId) return;
    setShowMobileCart(false);
    setPaymentStep('confirm');
    setCheckoutOpen(true);
  }

  useEffect(() => {
    if (!checkoutOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      const first = paymentDialogRef.current?.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled)');
      (paymentStep === 'payment' ? cashInputRef.current : first)?.focus();
    });
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Tab') {
        const controls = [...(paymentDialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? [])];
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); paymentDialogRef.current?.focus(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === 'Escape' && !checkoutLock.current && !busy) {
        event.preventDefault();
        setCheckoutOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [checkoutOpen, busy, paymentStep]);

  function onRegisterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'F2' && !checkoutOpen && !receipt && !demoReceipt && !calculatorOpen) {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    if (event.key === 'F12' && !calculatorOpen && !checkoutOpen) {
      event.preventDefault();
      openCheckout();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' &&
        checkoutOpen && paymentStep === 'payment' && !receipt && !demoReceipt && !calculatorOpen) {
      event.preventDefault();
      if (canPay) void pay();
    }
    if (event.key === 'Escape' && showMobileCart) {
      event.preventDefault();
      setShowMobileCart(false);
    }
  }

  function releasePending() {
    const approved = confirm(
      'First check the sales record. ' +
      'A sale may have been completed despite ' +
      'a lost response. Discard this pending transaction?',
    );

    if (!approved) {
      return;
    }

    try {
      sessionStorage.removeItem(
        PENDING_KEY,
      );
    } catch {
      // Optional browser storage.
    }

    setPending(null);

    setNotice({
      kind: 'info',
      message:
        'Transaction reference discarded. Verify previous sales before collecting payment again.',
    });
  }

  return (
    <div
      className={'pos-screen' + (focusMode ? ' pos-focus-mode' : '')}
      onKeyDown={onRegisterKey}
    >
      {/* Professional top-right notifications */}
      {notice && (
        <div
          role={
            notice.kind === 'error'
              ? 'alert'
              : 'status'
          }
          className={
            'pos-toast ' + notice.kind
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

          <button
            type="button"
            aria-label="Dismiss alert"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* One compact toolbar. Location is automatically selected by the backend. */}
      <header className="pos-heading">
        <div className="pos-heading-identity">
          <Image className="pos-register-logo" src="/assets/brand/golden-rose-logo.png" width={36} height={40} alt="Golden Rose Perfume" /><h1>Golden Rose</h1>
          <p className="pos-heading-subtitle">
            <span className="pos-cash-dot" aria-hidden="true" /> Cash register
            {locationId && catalogue.locations.some(store => store.id === locationId) && (
              <span className="pos-heading-store">
                · {catalogue.locations.find(store => store.id === locationId)?.name}
              </span>
            )}
            {demoMode && <strong className="pos-heading-demo">· PRACTICE (NO REAL SALES)</strong>}
          </p>
        </div>

        <div className="pos-heading-actions" aria-label="Cashier controls">
          {catalogue.locations.length > 1 && (
            <label className="pos-location-compact">
              <span className="pos-sr-only">Active selling store</span>
              <select
                value={locationId}
                disabled={locked || !!cart.length}
                onChange={event => { setLocationId(event.target.value); setSearch(''); }}
              >
                {catalogue.locations.map(store => (
                  <option key={store.id} value={store.id}>{store.name} · {store.code}</option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          )}
          {canTestQa && (
            <button
              type="button"
              className={'pos-secondary pos-demo-toggle' + (demoMode ? ' is-active' : '')}
              onClick={changeDemoMode}
              disabled={locked}
              aria-pressed={demoMode}
            >
              <FlaskConical size={15} aria-hidden="true" />
              {demoMode ? 'Exit practice' : 'Practice register'}
            </button>
          )}
          <button type="button" className="pos-secondary" disabled={locked || !cart.length} onClick={holdSale}>
            <PauseCircle size={15} aria-hidden="true" /> Hold
          </button>
          <button type="button" className="pos-secondary" disabled={locked || !heldSale} onClick={recallSale}>
            <RotateCcw size={15} aria-hidden="true" /> Recall{heldSale ? ' (1)' : ''}
          </button>
          <button type="button" className="pos-secondary" disabled={locked || !cart.length} onClick={clearSale}>
            <Trash2 size={15} aria-hidden="true" /> Clear
          </button>
          <button type="button" className="pos-secondary pos-utility" onClick={() => setCalculatorOpen(true)}>
            <Calculator size={15} aria-hidden="true" /> Calculator
          </button>
          <Link href="/workspace/orders" className="pos-secondary pos-history-link pos-utility">
            <History size={15} aria-hidden="true" /> Sales history
          </Link>
          <button
            type="button"
            className="pos-secondary pos-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => setFocusMode(value => !value)}
          >
            {focusMode ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
            {focusMode ? 'Dashboard view' : 'Focus view'}
          </button>
        </div>
      </header>

      {demoMode && (
        <div className="pos-demo-banner" role="status">
          <FlaskConical size={16} aria-hidden="true" />
          <strong>TRAINING REGISTER · NO REAL SALES</strong>
          <span>Uses isolated QA fixtures with simulated quantities. Never records payments or live stock.</span>
        </div>
      )}

      {/* First-time store setup */}
      {!locationId && (
        <div className="pos-setup-alert">
          <AlertCircle size={19} />

          <span>
            <b>
              No selling location configured
            </b>

            <small>
              Create an active store
              location in Inventory
              before recording sales.
            </small>
          </span>

          <Link href="/workspace/inventory">
            Open inventory
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Safe recovery of a pending transaction */}
      {pending && (
        <div className="pos-pending">
          <AlertCircle size={19} />

          <span>
            <b>
              Previous transaction
              not yet confirmed
            </b>

            <small>
              Retry its original
              reference. A second
              transaction could
              duplicate the sale.
            </small>
          </span>

          <button
            type="button"
            className="pos-primary"
            disabled={busy}
            onClick={() => pay(pending)}
          >
            Retry same sale
          </button>

          <button
            type="button"
            className="pos-text-button"
            onClick={releasePending}
            disabled={busy}
          >
            Discard after checking
          </button>
        </div>
      )}

      <div className="pos-columns">
        {/* Left: catalogue */}
        <section
          className="pos-catalogue"
          aria-labelledby="pos-catalogue-title"
        >
          <div className="pos-section-title">
            <div>
              <h2 id="pos-catalogue-title">Fragrances</h2>
            </div>

            <span className="pos-counter">
              {visibleItems.length} shown
            </span>
          </div>

          {/* Search and barcode lookup */}
          <div className="pos-search-row">
            <label className="pos-search">
              <Search size={19} />

              <input
                type="search"
                ref={searchInputRef}
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                onKeyDown={findBarcode}
                placeholder="Search product, SKU or scan barcode (F2)"
                aria-label="Find product by name, barcode or SKU"
                disabled={!locationId}
              />

              {searching ? (
                <small>Searching…</small>
              ) : (
                <ScanBarcode size={20} />
              )}
            </label>

            <button
              type="button"
              className="pos-secondary pos-refresh"
              aria-label="Refresh catalogue"
              onClick={() =>
                loadPosCatalogue(
                  search,
                  locationId || null,
                )
                  .then(setCatalogue)
                  .catch(error =>
                    setNotice({
                      kind: 'error',
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Refresh failed.',
                    }),
                  )
              }
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {/* Catalogue filters */}
          <div className="pos-filter-row">
            <div className="pos-segments">
              <button
                type="button"
                aria-pressed={!inStockOnly}
                className={
                  !inStockOnly
                    ? 'selected'
                    : ''
                }
                onClick={() =>
                  setInStockOnly(false)
                }
              >
                All fragrances
              </button>

              <button
                type="button"
                aria-pressed={inStockOnly}
                className={
                  inStockOnly
                    ? 'selected'
                    : ''
                }
                onClick={() =>
                  setInStockOnly(true)
                }
              >
                In stock
              </button>
            </div>

            <div className="pos-view-choices" role="group" aria-label="Catalogue display format">
              <button type="button" onClick={() => chooseView('grid')}
                aria-pressed={catalogueView === 'grid'} title="Product grid">
                <LayoutGrid size={16} aria-hidden="true" /> Grid
              </button>
              <button type="button" onClick={() => chooseView('table')}
                aria-pressed={catalogueView === 'table'} title="Product table">
                <List size={16} aria-hidden="true" /> Table
              </button>
            </div>
          </div>

          {/* Live catalogue: cashier chooses grid or detailed table. */}
          {filtered.length === 0 ? (
            <div className="pos-empty" role="status">
              <Package size={32} aria-hidden="true" />
              <h3>
                {search
                  ? 'No matching fragrances'
                  : inStockOnly
                    ? 'No available fragrances on this page'
                    : 'No sellable products yet'}
              </h3>
              <p>
                {search
                  ? 'Try a different fragrance name, SKU, or barcode.'
                  : inStockOnly
                    ? 'Products without a verified positive stock balance cannot be sold. Check Inventory or show all fragrances.'
                    : 'The imported QA fixtures are hidden from live selling. Import the owner’s genuine catalogue and record stock, or open Practice register for a safe rehearsal.'}
              </p>
              {!search && (
                <Link href="/workspace/inventory">
                  Review inventory <ArrowRight size={15} aria-hidden="true" />
                </Link>
              )}
            </div>
          ) : catalogueView === 'grid' ? (
            <div className="pos-products" aria-label="Product grid">
              {filtered.map(product => {
                const quantityInCart = cart.find(
                  row => row.product.id === product.id,
                )?.quantity ?? 0;
                const cannotAdd =
                  locked || product.available <= quantityInCart ||
                  (demoMode && !isQaProduct(product));

                return (
                  <article className="pos-product" key={product.id}>
                    <ProductPhoto product={product} />
                    <div className="pos-product-info">
                      <p className="pos-product-brand">
                        {product.brand || 'GOLDEN ROSE'}
                      </p>
                      <h3>{product.name}</h3>
                      <p className="pos-product-detail">
                        {product.sizeMl ? `${product.sizeMl} ml` : 'Perfume'}
                        {' · '}
                        {product.sku || 'No SKU'}
                      </p>
                      <div className="pos-product-price">
                        <b>{money(product.priceMinor)}</b>
                        <small className={
                          product.available > 0 ? 'pos-instock' : 'pos-outstock'
                        }>
                          {demoMode && isQaProduct(product)
                            ? `${product.available} DEMO units`
                            : product.available > 0
                              ? `${product.available} available`
                              : 'Stock not available'}
                        </small>
                      </div>
                      <button
                        type="button"
                        disabled={cannotAdd}
                        onClick={() => add(product)}
                        aria-label={`Add ${product.name} to current sale`}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Add to sale
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pos-product-table-wrap" role="region" aria-label="Product table" tabIndex={0}>
              <table className="pos-product-table">
                <thead>
                  <tr>
                    <th scope="col">Product / SKU</th>
                    <th scope="col">Barcode</th>
                    <th scope="col">Size</th>
                    <th scope="col">Available</th>
                    <th scope="col">Price</th>
                    <th scope="col"><span className="pos-sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(product => {
                    const quantityInCart = cart.find(
                      row => row.product.id === product.id,
                    )?.quantity ?? 0;
                    const cannotAdd =
                      locked || product.available <= quantityInCart ||
                      (demoMode && !isQaProduct(product));

                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="pos-table-product">
                            <ProductPhoto product={product} />
                            <span>
                              <strong>{product.name}</strong>
                              <small>
                                {product.brand || 'Golden Rose'}
                                {' · '}
                                {product.sku || 'No SKU'}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td className="pos-table-code">{product.barcode || '—'}</td>
                        <td>{product.sizeMl ? `${product.sizeMl} ml` : '—'}</td>
                        <td>
                          <span className={
                            product.available > 0 ? 'pos-instock' : 'pos-outstock'
                          }>
                            {demoMode && isQaProduct(product)
                              ? `${product.available} DEMO`
                              : product.available > 0
                                ? product.available
                                : 'Unavailable'}
                          </span>
                        </td>
                        <td className="pos-table-price">{money(product.priceMinor)}</td>
                        <td>
                          <button
                            type="button"
                            className="pos-table-add"
                            disabled={cannotAdd}
                            onClick={() => add(product)}
                            aria-label={`Add ${product.name} to current sale`}
                          >
                            <Plus size={15} aria-hidden="true" /> Add
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {catalogue.hasMore && (
            <button
              type="button"
              className="pos-more"
              disabled={loadingMore}
              onClick={more}
            >
              {loadingMore
                ? 'Loading…'
                : 'Load more fragrances'}

              <ArrowRight size={15} />
            </button>
          )}

          <p className="pos-catalogue-foot">
            {demoMode
              ? 'DEMO ONLY: stock is simulated in your browser. Neither checkout nor hold changes the real database.'
              : 'Real stock is location-specific. Uncounted products cannot be sold; the server checks stock and prices on checkout.'}
          </p>
        </section>

        {/* Right: checkout basket */}
        <aside
          className={
            'pos-cart ' +
            (showMobileCart
              ? 'pos-cart-open'
              : '')
          }
          aria-label="Current sale"
        >
          <header className="pos-cart-heading">
            <div>
              <h2>Current sale</h2>
            </div>

            <span className="pos-counter">
              {cart.reduce(
                (count, row) =>
                  count + row.quantity,
                0,
              )}{' '}
              items
            </span>
          </header>

          {heldSale && <p className="pos-held-note" role="status">
            One unsold basket is on hold in this browser. Use Recall in the top toolbar.
          </p>}

          {/* Basket products */}
          <div className="pos-cart-contents">
            {cart.length ? (
              cart.map(row => (
                <div
                  className="pos-cart-item"
                  key={row.product.id}
                >
                  <ProductPhoto
                    product={row.product}
                  />

                  <div className="pos-cart-item-main">
                    <div className="pos-cart-item-top">
                      <span>
                        <b>
                          {row.product.name}
                        </b>

                        <small>
                          {row.product.sizeMl
                            ? row.product.sizeMl +
                              ' ml · '
                            : ''}
                          {row.product.sku ||
                            'Perfume'}
                        </small>
                      </span>

                      <button
                        type="button"
                        aria-label={
                          'Remove ' +
                          row.product.name
                        }
                        disabled={locked}
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
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="pos-cart-item-bottom">
                      <div className="pos-quantity">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={locked}
                          onClick={() =>
                            quantity(
                              row.product.id,
                              -1,
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>

                        <b>
                          {row.quantity}
                        </b>

                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={
                            locked ||
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
                        </button>
                      </div>

                      <strong>
                        {money(
                          row.quantity *
                            row.product.priceMinor,
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="pos-cart-empty">
                <ShoppingBag size={18} aria-hidden="true" />
                <span>Scan an item to begin. You can review the basket and checkout when ready.</span>
              </div>
            )}
          </div>

          {/* Always-visible basket summary. Payment details belong in the modal. */}
          <div className="pos-checkout pos-checkout-summary">
            <div className="pos-summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="pos-summary-row"><span>Discount</span><strong>−{money(validDiscount ? (discountMinor ?? 0) : 0)}</strong></div>
            <div className="pos-summary-row pos-checkout-total"><span>Amount due</span><strong>{money(total)}</strong></div>
            <button
              ref={checkoutButtonRef}
              type="button"
              className="pos-primary pos-pay"
              disabled={locked || !cart.length || !locationId}
              onClick={openCheckout}
            >
              <ReceiptText size={18} aria-hidden="true" />
              Checkout <ArrowRight size={18} aria-hidden="true" />
            </button>
            <p className="pos-register-shortcuts">F2 scan · F12 checkout · Ctrl+Enter confirm inside payment</p>
          </div>

        </aside>
      </div>

      {/* Mobile checkout */}
      <button
        type="button"
        className="pos-mobile-cart-button"
        aria-expanded={showMobileCart}
        onClick={() =>
          setShowMobileCart(
            value => !value,
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
      </button>


      {/* Cash settlement is separate from the product and basket columns. */}
      {checkoutOpen && (
        <div className="pos-modal-backdrop pos-payment-layer" onMouseDown={event => {
          if (event.target === event.currentTarget && !busy) setCheckoutOpen(false);
        }}>
          <section ref={paymentDialogRef} tabIndex={-1} className="pos-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title">
            <header className="pos-payment-dialog-head">
              <div>
                <span className="pos-eyebrow">{paymentStep === 'confirm' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</span>
                <h2 id="pos-payment-title">{paymentStep === 'confirm' ? 'Confirm sale' : 'Payment details'}</h2>
                <p>{paymentStep === 'confirm' ? 'Review the items and choose a payment method.' : 'Cash payment · Confirm the amount received.'}</p>
              </div>
              <button type="button" className="pos-icon-btn" disabled={busy}
                onClick={() => setCheckoutOpen(false)} aria-label="Close payment window"><X size={18} /></button>
            </header>
            <div className="pos-payment-dialog-body">
              {demoMode && <p className="pos-payment-demo-flag" role="status">PRACTICE MODE — no payment or stock change will be recorded.</p>}
              {paymentStep === 'confirm' ? <>
              <div className="pos-payment-recap">
                <div><span>Sell to</span><b>Cash Customer</b></div>
                <div><span>{cart.reduce((count, row) => count + row.quantity, 0)} items · Subtotal</span><b>{money(subtotal)}</b></div>
                <label className="pos-payment-discount">
                  <span>Discount <small>max {discountLimit}%</small></span>
                  <span className="pos-payment-money-field"><span>₦</span>
                    <input type="text" inputMode="decimal" value={discount}
                      onChange={event => setDiscount(event.target.value)} disabled={locked}
                      aria-label="Discount in naira" /></span>
                </label>
                {!validDiscount && <p className="pos-field-error" role="alert">Discount exceeds your role limit or is invalid.</p>}
                <div className="pos-payment-total"><span>Amount due</span><strong>{money(total)}</strong></div>
              </div>
              <div className="pos-payment-methods" role="group" aria-label="Payment methods">
                <button type="button" className="is-selected" disabled={locked || !validDiscount} onClick={() => setPaymentStep('payment')}>
                  <Banknote size={18} aria-hidden="true" /> Cash payment
                </button>
                <button type="button" disabled title="Transfer payment verification is not connected yet">
                  Bank transfer <small>Not connected</small>
                </button>
                <button type="button" disabled title="Card confirmation is not connected">POS terminal</button>
              </div>
              <p className="pos-payment-transfer-note">Cash payment is available. Other methods require verified payment confirmation.</p>
              </> : <>
              <div className="pos-payment-total"><span>Amount payable</span><strong>{money(total)}</strong></div>
              <label className="pos-payment-cash-field">
                Cash received
                <span className="pos-payment-money-field"><span>₦</span>
                  <input ref={cashInputRef} type="text" inputMode="decimal"
                    value={cash} onChange={event => setCash(event.target.value)}
                    placeholder="Enter amount received" disabled={locked} />
                </span>
              </label>
              <div className="pos-cash-denominations" role="group" aria-label="Quick cash amounts">
                {[1000, 2000, 5000, 10000, 20000, 50000].map(amount => (
                  <button key={amount} type="button" disabled={locked}
                    onClick={() => setCash(String(amount))}>{money(amount * 100).replace('.00', '')}</button>
                ))}
                <button type="button" className="is-exact" disabled={locked}
                  onClick={() => setCash((total / 100).toFixed(2))}>Exact amount</button>
                <button type="button" disabled={locked} onClick={() => setCash('')}>Clear amount</button>
              </div>
              <div className="pos-payment-change"><span>Change to return</span>
                <strong>{change === null ? '—' : money(change)}</strong>
              </div>
              {cashMinor !== null && cashMinor < total && (
                <p className="pos-field-error" role="alert">Cash received is below the amount due.</p>
              )}
              </>}
            </div>
            <footer className="pos-payment-dialog-actions">
              <button type="button" className="pos-secondary" disabled={busy}
                onClick={() => paymentStep === 'payment' ? setPaymentStep('confirm') : setCheckoutOpen(false)}>{paymentStep === 'payment' ? 'Back' : 'Cancel'}</button>
              {paymentStep === 'payment' && <button type="button" className="pos-primary" disabled={!canPay}
                onClick={() => void pay()}>
                <CheckCircle2 size={18} aria-hidden="true" />
                {busy ? 'Recording…' : demoMode ? 'Finish practice sale' : 'Confirm cash sale'}
              </button>}
            </footer>
          </section>
        </div>
      )}

      {/* Calculator */}
      {calculatorOpen && (
        <CalculatorDialog
          close={() =>
            setCalculatorOpen(false)
          }
          onUseValue={value => { setCash(value); if (cart.length) setCheckoutOpen(true); }}
        />
      )}

      {demoReceipt && (
        <DemoReceiptDialog receipt={demoReceipt} close={() => setDemoReceipt(null)} />
      )}

      {/* Confirmed receipt */}
      {receipt && (
        <ReceiptDialog
          receipt={receipt}
          close={() =>
            setReceipt(null)
          }
        />
      )}
    </div>
  );
}
