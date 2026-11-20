
'use client';
import { ActionScope } from '@/src/components/action-feedback';
import { ActionButton } from '@/src/components/action-feedback';

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

type CatalogueView = 'grid' | 'table';

type HeldSale = {
  cart: CartItem[];
  locationId: string;
  discount: string;
  cash: string;
  createdAt: number;
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

          <ActionButton
            type="button"
            aria-label="Close calculator"
            className="pos-icon-btn"
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
              key={key}
              type="button"
              className={
                key === '=' ? 'pos-equals' : ''
              }
              onClick={() => press(key)}
            >
              {key}
            </ActionButton>
          ))}
        </div>

        <ActionButton
          type="button"
          className="pos-primary pos-wide"
          disabled={parseNaira(display) === null}
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
          <ActionButton
            className="pos-primary"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={17} />
            Print
          </ActionButton>

          <ActionButton
            className="pos-secondary"
            type="button"
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
  const [catalogueView, setCatalogueView] = useState<CatalogueView>('grid');
  // Open straight into the dedicated cashier workspace on desktop.
  const [focusMode, setFocusMode] = useState(true);
  const [heldSale, setHeldSale] = useState<HeldSale | null>(null);
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
  }, []);

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

  const filtered = inStockOnly
    ? catalogue.items.filter(
        item => item.available > 0,
      )
    : catalogue.items;

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
    if (locked || product.available < 1) {
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

    setCart(rows =>
      found
        ? rows.map(row =>
            row.product.id === product.id
              ? {
                  ...row,
                  quantity: Math.min(
                    row.quantity + 1,
                    MAX_PER_LINE,
                    row.product.available,
                  ),
                }
              : row,
          )
        : [
            ...rows,
            {
              product,
              quantity: 1,
            },
          ],
    );
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

      const exact = data.items.find(
        item =>
          item.barcode?.toLowerCase() === code ||
          item.sku?.toLowerCase() === code,
      );

      if (exact && exact.available > 0) {
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
    };
    setHeldSale(held);
    try { sessionStorage.setItem(HELD_KEY, JSON.stringify(held)); } catch { /* This tab still keeps it. */ }
    setCart([]);
    setDiscount('0');
    setCash('');
    setNotice({ kind: 'info', message: 'Sale held in this browser only. No stock is reserved or sold.' });
    searchInputRef.current?.focus();
  }

  function recallSale() {
    if (locked || !heldSale) return;
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

  function enterCashKey(key: string) {
    if (locked || !cart.length) return;
    setCash(current => {
      if (key === 'C') return '';
      if (key === '⌫') return current.slice(0, -1);
      if (key === '.') return current.includes('.') ? current : (current || '0') + '.';
      const next = current === '0' && key !== '00' ? key : current + key;
      return /^\d{0,10}(?:\.\d{0,2})?$/.test(next) ? next : current;
    });
  }

  function onRegisterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'F2') {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' &&
        !receipt && !calculatorOpen) {
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
    <ActionScope pending={busy}><div
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

          <ActionButton
            type="button"
            aria-label="Dismiss alert"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </ActionButton>
        </div>
      )}

      {/* Main heading */}
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
            Every fragrance. Every counter.
            One connected inventory.
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
            onClick={() =>
              setCalculatorOpen(true)
            }
          >
            <Calculator size={16} />
            Calculator
          </ActionButton>

          <Link href="/workspace/orders" className="pos-secondary pos-history-link">
            <History size={16} aria-hidden="true" />
            Sales history
          </Link>

          <ActionButton
            type="button"
            className="pos-secondary pos-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => setFocusMode(value => !value)}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {focusMode ? 'Exit register view' : 'Register view'}
          </ActionButton>

          <ActionButton
            type="button"
            className="pos-secondary"
            disabled={locked || !cart.length}
            onClick={clearSale}
          >
            <RefreshCw size={16} />
            Clear sale
          </ActionButton>
        </div>
      </header>

      {/* Active store / register location */}
      <section className="pos-store-bar">
        <label htmlFor="pos-location">
          Selling location
        </label>

        <div className="pos-select">
          <select
            id="pos-location"
            value={locationId}
            disabled={
              locked || !!cart.length
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
                  {store.name} · {store.code}
                </option>
              ),
            )}
          </select>

          <ChevronDown size={16} />
        </div>

        <span className="pos-store-caption">
          <ScanBarcode size={16} />
          Barcode-ready register
        </span>

        <span className="pos-store-caption">
          <CheckCircle2 size={16} />
          Verified cash receipts
        </span>
      </section>

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

          <ActionButton
            type="button"
            className="pos-primary"
            disabled={busy}
            onClick={() => pay(pending)}
          >
            Retry same sale
          </ActionButton>

          <ActionButton
            type="button"
            className="pos-text-button"
            onClick={releasePending}
            disabled={busy}
          >
            Discard after checking
          </ActionButton>
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
              <p className="pos-eyebrow">
                GOLDEN ROSE COLLECTION
              </p>

              <h2 id="pos-catalogue-title">
                Find a fragrance
              </h2>
            </div>

            <span className="pos-counter">
              {catalogue.items.length} shown
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
                placeholder="Search product, SKU or scan barcode"
                aria-label="Find product by name, barcode or SKU"
                disabled={!locationId}
              />

              {searching ? (
                <small>Searching…</small>
              ) : (
                <ScanBarcode size={20} />
              )}
            </label>

            <ActionButton
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
            </ActionButton>
          </div>

          {/* Catalogue filters */}
          <div className="pos-filter-row">
            <div className="pos-segments">
              <ActionButton
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
              </ActionButton>

              <ActionButton
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
              </ActionButton>
            </div>

            <div className="pos-view-choices" role="group" aria-label="Catalogue display format">
              <ActionButton type="button" onClick={() => chooseView('grid')}
                aria-pressed={catalogueView === 'grid'} title="Product grid">
                <LayoutGrid size={16} aria-hidden="true" /> Grid
              </ActionButton>
              <ActionButton type="button" onClick={() => chooseView('table')}
                aria-pressed={catalogueView === 'table'} title="Product table">
                <List size={16} aria-hidden="true" /> Table
              </ActionButton>
            </div>
          </div>

          {/* Live product grid */}
          {filtered.length ? (
            catalogueView === 'grid' ? (
            <div className="pos-products">
              {filtered.map(product => {
                const qty =
                  cart.find(
                    row =>
                      row.product.id ===
                      product.id,
                  )?.quantity || 0;

                const cannotAdd =
                  locked ||
                  product.available <= qty;

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
                          : 'Perfume'}
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
                            product.available
                              ? 'pos-instock'
                              : 'pos-outstock'
                          }
                        >
                          {product.available
                            ? product.available +
                              ' in stock'
                            : 'Out of stock'}
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
            ) : (
              <div className="pos-product-table-wrap">
                <table className="pos-product-table">
                  <thead>
                    <tr>
                      <th scope="col">Product / SKU</th>
                      <th scope="col">Barcode</th>
                      <th scope="col">Size</th>
                      <th scope="col">Available</th>
                      <th scope="col">Price</th>
                      <th scope="col"><span className="pos-sr-only">Add item</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(product => {
                      const qty = cart.find(row => row.product.id === product.id)?.quantity || 0;
                      const cannotAdd = locked || product.available <= qty;
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="pos-table-product">
                              <ProductPhoto product={product} />
                              <span><strong>{product.name}</strong><small>{product.brand || 'Golden Rose'} · {product.sku || 'No SKU'}</small></span>
                            </div>
                          </td>
                          <td className="pos-table-code">{product.barcode || '—'}</td>
                          <td>{product.sizeMl ? product.sizeMl + ' ml' : '—'}</td>
                          <td><span className={product.available > 0 ? 'pos-instock' : 'pos-outstock'}>
                            {product.available > 0 ? product.available : '0 available'}
                          </span></td>
                          <td className="pos-table-price">{money(product.priceMinor)}</td>
                          <td><ActionButton type="button" className="pos-table-add"
                            disabled={cannotAdd} onClick={() => add(product)}
                            aria-label={'Add ' + product.name + ' to sale'}>
                            <Plus size={15} aria-hidden="true" /> Add
                          </ActionButton></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                  ? 'Try a different fragrance name or barcode.'
                  : 'Import your products in Data Management, then receive stock at the selected store.'}
              </p>

              {!search && (
                <Link href="/workspace/migration">
                  Open Data Management
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}

          {/* Pagination */}
          {catalogue.hasMore && (
            <ActionButton
              type="button"
              className="pos-more"
              pending={loadingMore} pendingLabel="Loading…" disabled={loadingMore}
              onClick={more}
            >
              {loadingMore
                ? 'Loading…'
                : 'Load more fragrances'}

              <ArrowRight size={15} />
            </ActionButton>
          )}

          <p className="pos-catalogue-foot">
            Stock is location-specific. Zero available may mean stock has not been counted.
            Product availability is verified again when the sale is completed.
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
              <p className="pos-eyebrow">
                COUNTER CHECKOUT
              </p>

              <h2>
                Current sale
              </h2>
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

          <div className="pos-basket-tools" role="group" aria-label="Unsaved sale actions">
            <ActionButton type="button" disabled={locked || !cart.length} onClick={holdSale}>
              <PauseCircle size={15} aria-hidden="true" /> Hold
            </ActionButton>
            <ActionButton type="button" disabled={locked || !heldSale} onClick={recallSale}>
              <RotateCcw size={15} aria-hidden="true" /> Recall{heldSale ? ' (1)' : ''}
            </ActionButton>
            <ActionButton type="button" disabled={locked || !cart.length} onClick={clearSale}>
              <Trash2 size={15} aria-hidden="true" /> Clear
            </ActionButton>
          </div>
          {heldSale && <p className="pos-held-note" role="status">
            One local basket is on hold. It does not reserve stock.
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

                      <ActionButton
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
                      </ActionButton>
                    </div>

                    <div className="pos-cart-item-bottom">
                      <div className="pos-quantity">
                        <ActionButton
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
                        </ActionButton>

                        <b>
                          {row.quantity}
                        </b>

                        <ActionButton
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
                </div>
              ))
            ) : (
              <div className="pos-cart-empty">
                <ShoppingBag size={33} />

                <h3>
                  Ready for your first item
                </h3>

                <p>
                  Scan a barcode or add a
                  fragrance from the
                  collection to begin.
                </p>
              </div>
            )}
          </div>

          {/* Totals and payment */}
          <div className="pos-checkout">
            <div className="pos-summary-row">
              <span>Subtotal</span>

              <strong>
                {money(subtotal)}
              </strong>
            </div>

            {/* Discount */}
            <label className="pos-discount">
              <span>
                Discount
                <small>
                  Max {discountLimit}%
                </small>
              </span>

              <span className="pos-money-input">
                <i>₦</i>

                <input
                  type="text"
                  inputMode="decimal"
                  value={discount}
                  disabled={
                    locked || !cart.length
                  }
                  onChange={event =>
                    setDiscount(
                      event.target.value,
                    )
                  }
                  aria-label="Discount amount in naira"
                />
              </span>
            </label>

            {!validDiscount &&
              !!cart.length && (
                <p className="pos-field-error">
                  Invalid discount or
                  above your role limit.
                </p>
              )}

            <div className="pos-summary-row pos-tax">
              <span>Tax</span>
              <span>Not configured</span>
            </div>

            {/* Amount due */}
            <div className="pos-amount-due">
              <span>
                AMOUNT DUE
              </span>

              <strong>
                {money(total)}
              </strong>

              <small>
                Server verifies the latest
                price before recording.
              </small>
            </div>

            {/* Payment methods */}
            <div className="pos-payment">
              <p className="pos-eyebrow">
                PAYMENT METHOD
              </p>

              <div className="pos-payment-options">
                <span>
                  <Banknote size={18} />
                  Cash ✓
                </span>

                <span className="disabled">
                  Transfer / card
                  (not connected)
                </span>
              </div>
            </div>

            {/* Cash tender */}
            <label className="pos-cash-label">
              Cash received

              <span className="pos-money-input pos-cash-input">
                <i>₦</i>

                <input
                  type="text"
                  inputMode="decimal"
                  value={cash}
                  disabled={
                    locked || !cart.length
                  }
                  onChange={event =>
                    setCash(
                      event.target.value,
                    )
                  }
                  placeholder="0.00"
                />
              </span>
            </label>

            <div className="pos-tender-pad" role="group" aria-label="Cash amount keypad">
              {['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '.', '00', '0'].map(key => (
                <ActionButton type="button" key={key} onClick={() => enterCashKey(key)}
                  disabled={locked || !cart.length} aria-label={key === '⌫' ? 'Backspace' : key === 'C' ? 'Clear cash amount' : key}>
                  {key}
                </ActionButton>
              ))}
            </div>
            <div className="pos-shortcuts">
              <ActionButton
                type="button"
                disabled={
                  locked || !cart.length
                }
                onClick={() =>
                  setCash(
                    (total / 100).toFixed(2),
                  )
                }
              >
                Exact cash
              </ActionButton>

              <ActionButton
                type="button"
                onClick={() =>
                  setCalculatorOpen(true)
                }
              >
                <Calculator size={14} />
                Calculator
              </ActionButton>
            </div>

            {/* Change */}
            <div className="pos-summary-row pos-change">
              <span>
                Change to return
              </span>

              <strong>
                {change === null
                  ? '—'
                  : money(change)}
              </strong>
            </div>

            {cashMinor !== null &&
              cashMinor < total && (
                <p className="pos-field-error">
                  Cash received is less
                  than the total.
                </p>
              )}

            {/* Complete sale */}
            <ActionButton
              type="button"
              className="pos-primary pos-pay"
              disabled={!canPay}
              onClick={() => pay()}
            >
              <ReceiptText size={18} />

              {busy
                ? 'Recording sale…'
                : 'Complete cash sale'}

              <ArrowRight size={17} />
            </ActionButton>

            <p className="pos-register-shortcuts">F2: scan/search · Ctrl+Enter: complete eligible cash sale</p>
            <p className="pos-safe">
              <CheckCircle2 size={14} />
              A confirmed sale creates
              one receipt and deducts
              stock atomically.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile checkout */}
      <ActionButton
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
      </ActionButton>

      {/* Calculator */}
      {calculatorOpen && (
        <CalculatorDialog
          close={() =>
            setCalculatorOpen(false)
          }
          onUseValue={setCash}
        />
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
    </div></ActionScope>
  );
}
