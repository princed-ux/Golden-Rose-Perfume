
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
  useValue,
}: {
  close: () => void;
  useValue: (value: string) => void;
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
            useValue(display);
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

  const searchSeq = useRef(0);
  const checkoutLock = useRef(false);

  const locked =
    busy || pending !== null;

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
    try {
      const raw =
        sessionStorage.getItem(PENDING_KEY);

      if (!raw) return;

      const saved: unknown =
        JSON.parse(raw);

      if (
        !saved ||
        typeof saved !== 'object' ||
        !('idempotencyKey' in saved) ||
        typeof saved.idempotencyKey !==
          'string' ||
        !('items' in saved) ||
        !Array.isArray(saved.items)
      ) {
        return;
      }

      setPending(saved as CashSaleRequest);

      setNotice({
        kind: 'info',
        message:
          'A previous sale has an unconfirmed response. Retry the same reference before starting another.',
      });
    } catch {
      // Private browsing can block session storage.
    }
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
      searchSeq.current++;
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
    <div className="pos-screen">
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

          <button
            type="button"
            className="pos-secondary"
            onClick={() =>
              setCalculatorOpen(true)
            }
          >
            <Calculator size={16} />
            Calculator
          </button>

          <button
            type="button"
            className="pos-secondary"
            disabled={
              locked || !cart.length
            }
            onClick={() => {
              setCart([]);
              setDiscount('0');
              setCash('');
            }}
          >
            <RefreshCw size={16} />
            Clear sale
          </button>
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

            <small>
              Press Enter to add an exact
              SKU or barcode
            </small>
          </div>

          {/* Live product grid */}
          {filtered.length ? (
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

                      <button
                        type="button"
                        disabled={cannotAdd}
                        onClick={() =>
                          add(product)
                        }
                      >
                        <Plus size={16} />
                        Add to sale
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
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
            Only real products and inventory
            from the Golden Rose database
            appear here.
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

            <div className="pos-shortcuts">
              <button
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
              </button>

              <button
                type="button"
                onClick={() =>
                  setCalculatorOpen(true)
                }
              >
                <Calculator size={14} />
                Calculator
              </button>
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
            <button
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
            </button>

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

      {/* Calculator */}
      {calculatorOpen && (
        <CalculatorDialog
          close={() =>
            setCalculatorOpen(false)
          }
          useValue={setCash}
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
    </div>
  );
}
