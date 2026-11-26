'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Wallet,
  X,
} from 'lucide-react';

import {
  WorkspaceNotice,
  WorkspacePanel,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

import {
  calculateWholesaleOrder,
  parseWholesaleMoney,
  wholesaleBalance,
  type WholesaleLineInput,
} from '@/src/lib/golden-rose/wholesale';

import {
  loadWholesaleCatalogue,
  loadWholesaleOrders,
  loadWholesaleDetails,
  createWholesaleSale,
  recordWholesalePayment,
  confirmWholesaleDispatch,
  type WholesaleLocation,
  type WholesaleProduct,
  type WholesaleOrderRecord,
  type WholesaleDetails,
  type WholesalePaymentMethod,
  type CreateWholesaleInput,
  type AdditionalPaymentInput,
  type DispatchWholesaleInput,
  type WholesaleResult,
} from './actions';

/* =========================================================
   GOLDEN ROSE — WHOLESALE WORKSPACE
   ========================================================= */

interface Props {
  staffId: string;
  mode: 'sales' | 'dispatch';
  locations: WholesaleLocation[];
  initialLocation: string;
  canDispatch: boolean;
  initialCatalogue: WholesaleProduct[];
  initialHasMore: boolean;
  initialOrders: WholesaleOrderRecord[];
  initialOrdersHasMore: boolean;
  initialError: string;
}

interface BasketLine {
  id: string;
  product: WholesaleProduct;
  packageId: string;
  quantity: string;
  price: string;
}

type PendingOperation =
  | {
      kind: 'sale';
      input: CreateWholesaleInput;
    }
  | {
      kind: 'payment';
      input: AdditionalPaymentInput;
    }
  | {
      kind: 'dispatch';
      input: DispatchWholesaleInput;
    };

type Feedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

const moneyFormatter = new Intl.NumberFormat(
  'en-NG',
  {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
);

function money(
  value: number | undefined,
): string {
  return value === undefined
    ? 'Restricted'
    : moneyFormatter.format(value / 100);
}

function naira(
  value: number,
): string {
  return (value / 100).toFixed(2);
}

function dateLabel(
  value: string | null,
): string {
  if (!value) return 'Not dispatched';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(
    'en-NG',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    },
  ).format(date);
}

function reference(id: string) {
  return `WH-${id.slice(0, 8).toUpperCase()}`;
}

function paymentLabel(
  method: WholesalePaymentMethod,
) {
  switch (method) {
    case 'cash':
      return 'Cash';

    case 'bank_transfer':
      return 'Bank transfer';

    case 'card':
      return 'Card / POS terminal';
  }
}

function selectedPackage(line: BasketLine) {
  return line.product.packages.find(
    item => item.id === line.packageId,
  );
}

function defaultPrice(
  product: WholesaleProduct,
  packageId: string,
): string {
  const factor =
    product.packages.find(
      item => item.id === packageId,
    )?.unitsPerPackage ?? 1;

  const amount =
    product.priceMinor * factor;

  return Number.isSafeInteger(amount)
    ? naira(amount)
    : '';
}

function prepareLines(
  basket: BasketLine[],
): WholesaleLineInput[] {
  return basket.map(line => {
    if (
      !/^[1-9]\d{0,6}$/.test(
        line.quantity.trim(),
      )
    ) {
      throw new Error(
        `Enter a valid quantity for ${line.product.name}.`,
      );
    }

    const packaging =
      selectedPackage(line);

    if (
      line.packageId &&
      !packaging
    ) {
      throw new Error(
        'The selected packaging is unavailable.',
      );
    }

    return {
      lineId: line.id,

      variantId: line.product.id,

      packageId:
        packaging?.id ?? null,

      unitsPerPackage:
        packaging?.unitsPerPackage ?? 1,

      packageQuantity:
        Number(line.quantity),

      retailUnitPriceMinor:
        line.product.priceMinor,

      agreedPackagePriceMinor:
        parseWholesaleMoney(line.price),
    };
  });
}

function orderPaymentStatus(
  order: WholesaleOrderRecord,
): string {
  if (
    order.total_minor === undefined ||
    order.paid_minor === undefined
  ) {
    return 'Restricted';
  }

  return order.paid_minor === 0
    ? 'Unpaid'
    : order.paid_minor === order.total_minor
      ? 'Fully paid'
      : 'Partially paid';
}

/* =========================================================
   PENDING TRANSACTION VALIDATION
   ========================================================= */

function isPendingOperation(
  value: unknown,
): value is PendingOperation {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    !('input' in value) ||
    !value.input ||
    typeof value.input !== 'object'
  ) {
    return false;
  }

  if (
    !('orderId' in value.input) ||
    typeof value.input.orderId !== 'string'
  ) {
    return false;
  }

  if (value.kind === 'sale') {
    return (
      'lines' in value.input &&
      Array.isArray(value.input.lines) &&
      'locationId' in value.input &&
      typeof value.input.locationId === 'string'
    );
  }

  if (value.kind === 'payment') {
    return (
      'paymentId' in value.input &&
      typeof value.input.paymentId === 'string'
    );
  }

  if (value.kind === 'dispatch') {
    return (
      'dispatchId' in value.input &&
      typeof value.input.dispatchId === 'string'
    );
  }

  return false;
}

/* =========================================================
   MAIN WORKSPACE
   ========================================================= */

export function WholesaleWorkspace({
  staffId,
  mode,
  locations,
  initialLocation,
  canDispatch,
  initialCatalogue,
  initialHasMore,
  initialOrders,
  initialOrdersHasMore,
  initialError,
}: Props) {
  const salesMode =
    mode === 'sales';

  const storageKey =
    `golden-rose-wholesale-pending:${staffId}`;

  /* Business details */

  const [businessName, setBusinessName] =
    useState('');

  const [contact, setContact] =
    useState('');

  const [address, setAddress] =
    useState('');

  const [notes, setNotes] =
    useState('');

  /* Product catalogue */

  const [locationId, setLocationId] =
    useState(initialLocation);

  const [catalogue, setCatalogue] =
    useState(initialCatalogue);

  const [hasMore, setHasMore] =
    useState(initialHasMore);

  const [search, setSearch] =
    useState('');

  const [appliedSearch, setAppliedSearch] =
    useState('');

  /* Sale basket */

  const [basket, setBasket] =
    useState<BasketLine[]>([]);

  const [initialPayment, setInitialPayment] =
    useState('0');

  const [paymentMethod, setPaymentMethod] =
    useState<WholesalePaymentMethod>('cash');

  const [paymentReference, setPaymentReference] =
    useState('');

  const [paymentConfirmed, setPaymentConfirmed] =
    useState(false);

  const [dispatchNow, setDispatchNow] =
    useState(canDispatch);

  /* Sales register */

  const [orders, setOrders] =
    useState(initialOrders);

  const [ordersHasMore, setOrdersHasMore] =
    useState(initialOrdersHasMore);

  const [orderSearch, setOrderSearch] =
    useState('');

  const [appliedOrderSearch, setAppliedOrderSearch] =
    useState('');

  const [details, setDetails] =
    useState<WholesaleDetails | null>(null);

  /* Subsequent payment */

  const [additionalAmount, setAdditionalAmount] =
    useState('');

  const [additionalMethod, setAdditionalMethod] =
    useState<WholesalePaymentMethod>('cash');

  const [additionalReference, setAdditionalReference] =
    useState('');

  const [additionalConfirmed, setAdditionalConfirmed] =
    useState(false);

  /* Requests and recovery */

  const [busy, setBusy] =
    useState(false);

  const requestLock =
    useRef(false);

  const [ready, setReady] =
    useState(false);

  const [storageError, setStorageError] =
    useState('');

  const [pending, setPending] =
    useState<PendingOperation | null>(null);

  const [feedback, setFeedback] =
    useState<Feedback | null>(
      initialError
        ? {
            kind: 'error',
            message: initialError,
          }
        : null,
    );

  const mutationDisabled =
    !ready ||
    busy ||
    Boolean(pending) ||
    Boolean(storageError);

  /* =======================================================
     RESTORE INTERRUPTED TRANSACTIONS

     The storage key is scoped to the authenticated employee.
     No transaction is automatically submitted on mount.
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      try {
        const raw =
          sessionStorage.getItem(storageKey);

        if (raw) {
          const saved: unknown =
            JSON.parse(raw);

          if (!isPendingOperation(saved)) {
            throw new Error(
              'Invalid saved transaction.',
            );
          }

          setPending(saved);

          setFeedback({
            kind: 'info',
            message:
              'An earlier transaction requires confirmation. Recover its original reference before recording another sale or payment.',
          });
        }

      } catch {
        setStorageError(
          'The saved transaction record could not be restored safely. Contact the owner before recording further transactions.',
        );

      } finally {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  /* =======================================================
     LIVE CALCULATIONS
     ======================================================= */

  let calculation:
    | ReturnType<typeof calculateWholesaleOrder>
    | null = null;

  let calculationError = '';

  let paidMinor = 0;

  let balanceMinor = 0;

  let stockError = '';

  if (basket.length > 0) {
    try {
      calculation =
        calculateWholesaleOrder(
          prepareLines(basket),
        );

      paidMinor =
        parseWholesaleMoney(
          initialPayment || '0',
        );

      balanceMinor =
        wholesaleBalance(
          calculation.totalMinor,
          paidMinor,
        ).balanceMinor;

      for (
        const required
        of calculation.stockRequired
      ) {
        const product =
          catalogue.find(
            item => item.id === required.variantId,
          ) ??

          basket.find(
            line =>
              line.product.id === required.variantId,
          )?.product;

        if (
          product &&
          required.quantity > product.available
        ) {
          stockError =
            `${product.name}: ${required.quantity} bottles requested, ${product.available} available.`;

          break;
        }
      }

    } catch (error) {
      calculationError =
        error instanceof Error
          ? error.message
          : 'Check quantities and selling prices.';
    }
  }

  const canSave =
    salesMode &&
    !mutationDisabled &&
    Boolean(locationId) &&
    businessName.trim().length >= 2 &&
    calculation !== null &&
    !calculationError &&
    (
      !dispatchNow ||
      !stockError
    ) &&
    (
      paidMinor === 0 ||
      paymentConfirmed
    );

  /* =======================================================
     REQUEST LOCK
     ======================================================= */

  async function read(
    task: () => Promise<void>,
  ) {
    if (requestLock.current) return;

    requestLock.current = true;

    setBusy(true);
    setFeedback(null);

    try {
      await task();

    } catch {
      setFeedback({
        kind: 'error',
        message:
          'The requested records could not be loaded. Please retry.',
      });

    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  /* =======================================================
     PRODUCT SEARCH
     ======================================================= */

  async function findProducts(
    query = search,
    append = false,
    store = locationId,
  ) {
    if (
      !salesMode ||
      !store
    ) {
      return;
    }

    await read(async () => {
      const result =
        await loadWholesaleCatalogue(
          store,
          query,
          append ? catalogue.length : 0,
        );

      if (!result.ok) {
        setFeedback({
          kind: 'error',
          message: result.message,
        });

        return;
      }

      setAppliedSearch(query);

      setHasMore(
        result.data.hasMore,
      );

      setCatalogue(current =>
        append
          ? [
              ...current,
              ...result.data.items.filter(
                item =>
                  !current.some(
                    existing => existing.id === item.id,
                  ),
              ),
            ]
          : result.data.items,
      );

      setBasket(current =>
        current.map(line => {
          const refreshed =
            result.data.items.find(
              item =>
                item.id === line.product.id,
            );

          /*
           * Preserve the original negotiated price
           * and original catalogue snapshot.
           * The database detects changed prices or
           * packaging before saving.
           */

          return refreshed
            ? {
                ...line,

                product: {
                  ...line.product,

                  available:
                    refreshed.available,
                },
              }
            : line;
        }),
      );
    });
  }

  function changeStore(next: string) {
    if (
      mutationDisabled ||
      basket.length > 0
    ) {
      return;
    }

    setLocationId(next);
    setCatalogue([]);
    setHasMore(false);
    setSearch('');
    setAppliedSearch('');

    if (next) {
      void findProducts(
        '',
        false,
        next,
      );
    }
  }

  /* =======================================================
     BASKET MANAGEMENT
     ======================================================= */

  function addProduct(
    product: WholesaleProduct,
  ) {
    if (mutationDisabled) return;

    const newLine: BasketLine = {
      id: crypto.randomUUID(),
      product,
      packageId: '',
      quantity: '1',
      price: naira(product.priceMinor),
    };

    setBasket(current => {
      if (current.length >= 100) {
        return current;
      }

      const matching =
        current.find(
          line =>
            line.product.id === product.id &&
            line.packageId === '' &&
            line.price === newLine.price,
        );

      if (
        matching &&
        /^[1-9]\d{0,6}$/.test(
          matching.quantity,
        ) &&
        Number(matching.quantity) < 1_000_000
      ) {
        return current.map(line =>
          line.id === matching.id
            ? {
                ...line,

                quantity: String(
                  Number(line.quantity) + 1,
                ),
              }
            : line,
        );
      }

      return [
        ...current,
        newLine,
      ];
    });
  }

  function addSeparateLine(
    product: WholesaleProduct,
  ) {
    if (mutationDisabled) return;

    const line: BasketLine = {
      id: crypto.randomUUID(),
      product,
      packageId: '',
      quantity: '1',
      price: naira(product.priceMinor),
    };

    setBasket(current =>
      current.length < 100
        ? [...current, line]
        : current,
    );
  }

  function updateLine(
    id: string,
    patch: Partial<BasketLine>,
  ) {
    if (mutationDisabled) return;

    setBasket(current =>
      current.map(line =>
        line.id === id
          ? {
              ...line,
              ...patch,
            }
          : line,
      ),
    );
  }

  function choosePackage(
    id: string,
    packageId: string,
  ) {
    const line =
      basket.find(
        item => item.id === id,
      );

    if (!line) return;

    updateLine(
      id,
      {
        packageId,

        price: defaultPrice(
          line.product,
          packageId,
        ),
      },
    );
  }

  function removeLine(id: string) {
    if (mutationDisabled) return;

    setBasket(current =>
      current.filter(
        line => line.id !== id,
      ),
    );
  }

  /* =======================================================
     WHOLESALE REGISTER
     ======================================================= */

  async function findOrders(
    query = orderSearch,
    append = false,
  ) {
    await read(async () => {
      const result =
        await loadWholesaleOrders(
          query,
          append ? orders.length : 0,
        );

      if (!result.ok) {
        setFeedback({
          kind: 'error',
          message: result.message,
        });

        return;
      }

      setAppliedOrderSearch(query);

      setOrdersHasMore(
        result.data.hasMore,
      );

      setOrders(current =>
        append
          ? [
              ...current,
              ...result.data.items.filter(
                item =>
                  !current.some(
                    existing => existing.id === item.id,
                  ),
              ),
            ]
          : result.data.items,
      );
    });
  }

  async function openOrder(
    orderId: string,
  ) {
    await read(async () => {
      const result =
        await loadWholesaleDetails(orderId);

      if (!result.ok) {
        setFeedback({
          kind: 'error',
          message: result.message,
        });

        return;
      }

      setDetails(result.data);

      setAdditionalAmount('');
      setAdditionalReference('');
      setAdditionalConfirmed(false);
    });
  }

  /* =======================================================
     EXECUTE AND RECOVER A TRANSACTION

     Preserve the original request before submission.
     Retrying uses the same identifiers and payload.
     ======================================================= */

  async function executeOperation(
    operation: PendingOperation,
    recovering = false,
  ) {
    if (
      requestLock.current ||
      !ready ||
      storageError ||
      (
        !recovering &&
        pending
      )
    ) {
      return;
    }

    requestLock.current = true;

    setBusy(true);
    setFeedback(null);

    try {
      try {
        const existing =
          sessionStorage.getItem(storageKey);

        if (
          existing &&
          !recovering
        ) {
          const saved: unknown =
            JSON.parse(existing);

          if (isPendingOperation(saved)) {
            setPending(saved);
          }

          setFeedback({
            kind: 'error',
            message:
              'A saved transaction already exists. Recover it before creating another.',
          });

          return;
        }

        sessionStorage.setItem(
          storageKey,
          JSON.stringify(operation),
        );

      } catch {
        setStorageError(
          'Transaction storage is unavailable. No new transaction has been submitted.',
        );

        return;
      }

      setPending(operation);

      let result:
        WholesaleResult<WholesaleDetails>;

      switch (operation.kind) {
        case 'sale':
          result =
            await createWholesaleSale(
              operation.input,
            );

          break;

        case 'payment':
          result =
            await recordWholesalePayment(
              operation.input,
            );

          break;

        case 'dispatch':
          result =
            await confirmWholesaleDispatch(
              operation.input,
            );

          break;
      }

      if (!result.ok) {
        setFeedback({
          kind: 'error',
          message: result.message,
        });

        return;
      }

      setDetails(result.data);

      const confirmedOrder =
        result.data.order;

      setOrders(current => [
        confirmedOrder,

        ...current.filter(
          item =>
            item.id !== confirmedOrder.id,
        ),
      ]);

      if (operation.kind === 'sale') {
        setBasket([]);
        setBusinessName('');
        setContact('');
        setAddress('');
        setNotes('');
        setInitialPayment('0');
        setPaymentReference('');
        setPaymentConfirmed(false);
      }

      setAdditionalAmount('');
      setAdditionalReference('');
      setAdditionalConfirmed(false);

      try {
        sessionStorage.removeItem(
          storageKey,
        );

        setPending(null);

      } catch {
        setStorageError(
          'The transaction succeeded, but its local recovery reference could not be cleared. Do not repeat the transaction.',
        );
      }

      setFeedback({
        kind: 'success',

        message:
          operation.kind === 'sale'
            ? 'Wholesale sale successfully recorded.'

            : operation.kind === 'payment'
              ? 'Payment successfully recorded.'

              : 'Dispatch confirmed. Inventory has been updated.',
      });

      if (
        salesMode &&
        locationId
      ) {
        try {
          const refreshed =
            await loadWholesaleCatalogue(
              locationId,
              appliedSearch,
            );

          if (refreshed.ok) {
            setCatalogue(
              refreshed.data.items,
            );

            setHasMore(
              refreshed.data.hasMore,
            );
          }

        } catch {
          // A failed catalogue refresh must never
          // invalidate a completed transaction.
        }
      }

    } catch {
      setFeedback({
        kind: 'error',
        message:
          'The transaction response could not be confirmed. Recover the original reference before continuing.',
      });

    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  /* =======================================================
     SUBMIT WHOLESALE SALE
     ======================================================= */

  function saveSale(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !canSave ||
      !calculation
    ) {
      return;
    }

    if (
      dispatchNow &&
      !window.confirm(
        'Confirm that the listed goods are being handed over or dispatched now. Stock will be deducted once the sale succeeds.',
      )
    ) {
      return;
    }

    const operation: PendingOperation = {
      kind: 'sale',

      input: {
        orderId: crypto.randomUUID(),
        locationId,
        businessName,
        contact,

        deliveryAddress: address,

        notes,

        lines:
          prepareLines(basket),

        initialPaymentMinor:
          paidMinor,

        paymentMethod,

        paymentReference,

        paymentConfirmed,

        dispatchNow,
      },
    };

    void executeOperation(operation);
  }

  /* =======================================================
     SUBSEQUENT PAYMENT
     ======================================================= */

  function saveAdditionalPayment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      mutationDisabled ||
      !details ||
      !additionalConfirmed
    ) {
      return;
    }

    try {
      const amount =
        parseWholesaleMoney(
          additionalAmount,
        );

      const balance =
        details.order.balance_minor;

      if (
        balance === undefined ||
        amount <= 0 ||
        amount > balance
      ) {
        throw new Error(
          'Enter a payment within the outstanding balance.',
        );
      }

      void executeOperation({
        kind: 'payment',

        input: {
          orderId: details.order.id,

          paymentId:
            crypto.randomUUID(),

          amountMinor: amount,

          method: additionalMethod,

          reference:
            additionalReference,

          confirmed: true,
        },
      });

    } catch (error) {
      setFeedback({
        kind: 'error',

        message:
          error instanceof Error
            ? error.message
            : 'Invalid payment amount.',
      });
    }
  }

  /* =======================================================
     DISPATCH CONFIRMATION
     ======================================================= */

  function dispatchOrder() {
    if (
      mutationDisabled ||
      !canDispatch ||
      !details ||
      details.order.dispatched_at
    ) {
      return;
    }

    if (
      !window.confirm(
        `Confirm dispatch of all remaining goods for ${details.order.business_name}? Inventory will be deducted.`,
      )
    ) {
      return;
    }

    void executeOperation({
      kind: 'dispatch',

      input: {
        orderId: details.order.id,

        dispatchId:
          crypto.randomUUID(),
      },
    });
  }

  /* =======================================================
     MANUAL RECOVERY RELEASE

     Do not silently discard an uncertain transaction.
     The owner must first review the actual sale,
     payment and stock records.
     ======================================================= */

  function releasePendingAfterReview() {
    if (
      busy ||
      !pending ||
      requestLock.current
    ) {
      return;
    }

    if (
      !window.confirm(
        'Release this recovery reference only after the owner has checked whether the sale, payment or dispatch already completed. This does not cancel or reverse a transaction. Continue?',
      )
    ) {
      return;
    }

    try {
      sessionStorage.removeItem(
        storageKey,
      );

      setPending(null);

      setFeedback({
        kind: 'info',
        message:
          'Recovery reference released after manual review. Check the existing transaction before recording another payment.',
      });

    } catch {
      setStorageError(
        'The recovery reference could not be cleared.',
      );
    }
  }

  /* =======================================================
     INTERFACE
     ======================================================= */

  return (
    <div className="grid min-w-0 gap-6">

      {/* REQUEST FEEDBACK */}

      {feedback && (
        <div
          role={
            feedback.kind === 'error'
              ? 'alert'
              : 'status'
          }
          className={
            'flex items-start gap-3 rounded-xl border p-4 text-sm ' +

            (
              feedback.kind === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'

                : feedback.kind === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'

                  : 'border-[#e5d5bf] bg-[#fff8ed] text-[#765331]'
            )
          }
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2
              size={19}
              className="shrink-0"
            />
          ) : (
            <AlertCircle
              size={19}
              className="shrink-0"
            />
          )}

          <span className="flex-1">
            {feedback.message}
          </span>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() =>
              setFeedback(null)
            }
          >
            <X size={17} />
          </button>
        </div>
      )}

      {storageError && (
        <WorkspaceNotice
          tone="error"
          title="Transaction protection"
        >
          {storageError}
        </WorkspaceNotice>
      )}

      {/* RECOVERY PANEL */}

      {pending && (
        <WorkspaceNotice
          tone="pending"
          title="A transaction requires confirmation"
        >
          <div className="grid gap-3">
            <p>
              Recover the existing{' '}
              {pending.kind} transaction.
              Do not collect payment or deduct
              inventory a second time.
            </p>

            <code className="break-all text-xs">
              {pending.input.orderId}
            </code>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={workspacePrimary}
                disabled={busy || Boolean(storageError)}
                onClick={() =>
                  void executeOperation(
                    pending,
                    true,
                  )
                }
              >
                <RefreshCw size={16} />
                Recover original transaction
              </button>

              <button
                type="button"
                className={workspaceSecondary}
                disabled={busy}
                onClick={() =>
                  void openOrder(
                    pending.input.orderId,
                  )
                }
              >
                Check existing sale
              </button>

              <button
                type="button"
                className={workspaceSecondary}
                disabled={busy}
                onClick={releasePendingAfterReview}
              >
                Release after owner review
              </button>
            </div>
          </div>
        </WorkspaceNotice>
      )}

      {/* NEW WHOLESALE SALE */}

      {salesMode && (
        <>
          <WorkspacePanel className="grid gap-5">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <Building2 size={23} />
              Business customer
            </h2>

            <fieldset
              disabled={mutationDisabled}
              className="grid gap-4 md:grid-cols-2"
            >
              <label className={workspaceLabel}>
                Business or customer name *

                <input
                  className={workspaceInput}
                  value={businessName}
                  maxLength={180}
                  placeholder="Enter business name"
                  onChange={event =>
                    setBusinessName(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className={workspaceLabel}>
                Business contact

                <input
                  className={workspaceInput}
                  value={contact}
                  maxLength={254}
                  placeholder="Phone number or email"
                  onChange={event =>
                    setContact(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className={workspaceLabel}>
                Selling location *

                <select
                  className={workspaceInput}
                  value={locationId}
                  disabled={basket.length > 0}
                  onChange={event =>
                    changeStore(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select store
                  </option>

                  {locations.map(location => (
                    <option
                      key={location.id}
                      value={location.id}
                    >
                      {location.name}
                      {' · '}
                      {location.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className={workspaceLabel}>
                Delivery address

                <input
                  className={workspaceInput}
                  value={address}
                  maxLength={500}
                  placeholder="Optional for collection"
                  onChange={event =>
                    setAddress(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className={`${workspaceLabel} md:col-span-2`}>
                Transaction notes

                <textarea
                  className={workspaceInput}
                  value={notes}
                  maxLength={1000}
                  rows={2}
                  placeholder="Optional delivery instructions or sales reference"
                  onChange={event =>
                    setNotes(
                      event.target.value,
                    )
                  }
                />
              </label>
            </fieldset>
          </WorkspacePanel>

          {/* PRODUCT CATALOGUE */}

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <Package size={22} />
              Select fragrances
            </h2>

            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={event => {
                event.preventDefault();

                void findProducts();
              }}
            >
              <label className={`${workspaceLabel} min-w-0 flex-1`}>
                Search products

                <input
                  className={workspaceInput}
                  type="search"
                  value={search}
                  maxLength={100}
                  placeholder="Product name, SKU or barcode"
                  disabled={!locationId || busy}
                  onChange={event =>
                    setSearch(
                      event.target.value,
                    )
                  }
                />
              </label>

              <button
                type="submit"
                className={workspacePrimary}
                disabled={!locationId || busy}
              >
                <Search size={16} />
                Find products
              </button>
            </form>

            <div className="max-h-[420px] overflow-auto rounded-xl border border-[#ebdfd9]">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="sticky top-0 bg-[#f7efe9] text-[#54213a]">
                  <tr>
                    <th className="p-3">
                      Product
                    </th>

                    <th className="p-3">
                      Bottle price
                    </th>

                    <th className="p-3">
                      Available
                    </th>

                    <th className="p-3">
                      Packaging
                    </th>

                    <th className="p-3">
                      Add
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {catalogue.map(product => (
                    <tr
                      key={product.id}
                      className="border-t border-[#ebdfd9]"
                    >
                      <td className="p-3">
                        <strong className="text-[#54213a]">
                          {product.name}
                        </strong>

                        <p className="text-xs text-[#796570]">
                          {product.sku || 'No SKU'}
                          {product.sizeMl
                            ? ` · ${product.sizeMl} ml`
                            : ''}
                        </p>
                      </td>

                      <td className="p-3 tabular-nums">
                        {money(product.priceMinor)}
                      </td>

                      <td className="p-3 tabular-nums">
                        {product.available}
                      </td>

                      <td className="p-3 text-xs">
                        {product.packages.length
                          ? product.packages.map(
                              item =>
                                `${item.unitName} × ${item.unitsPerPackage}`,
                            ).join(', ')
                          : 'Individual bottles'}
                      </td>

                      <td className="p-3">
                        <button
                          type="button"
                          className={workspaceSecondary}
                          disabled={
                            mutationDisabled ||
                            basket.length >= 100
                          }
                          onClick={() =>
                            addProduct(product)
                          }
                        >
                          <Plus size={15} />
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!catalogue.length && (
                <p className="p-5 text-sm text-[#796570]">
                  {locationId
                    ? 'No matching products are available.'
                    : 'Select a selling location first.'}
                </p>
              )}
            </div>

            {hasMore && (
              <button
                type="button"
                className={workspaceSecondary}
                disabled={busy}
                onClick={() =>
                  void findProducts(
                    appliedSearch,
                    true,
                  )
                }
              >
                Load more products
              </button>
            )}
          </WorkspacePanel>

          {/* BASKET AND PAYMENT FORM */}

          <form
            className="grid gap-6"
            onSubmit={saveSale}
          >
            <WorkspacePanel className="grid gap-4">
              <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
                <ClipboardList size={22} />
                Wholesale sale
              </h2>

              {!basket.length && (
                <p className="text-sm text-[#796570]">
                  Add the fragrances the business
                  customer wants to purchase.
                </p>
              )}

              {basket.map(line => {
                const packaging =
                  selectedPackage(line);

                const factor =
                  packaging?.unitsPerPackage ?? 1;

                const bottles =
                  Number(line.quantity || 0) *
                  factor;

                let lineTotal:
                  number | undefined;

                try {
                  lineTotal =
                    parseWholesaleMoney(line.price) *
                    Number(line.quantity);

                  if (
                    !Number.isSafeInteger(lineTotal) ||
                    lineTotal < 0
                  ) {
                    lineTotal = undefined;
                  }

                } catch {
                  lineTotal = undefined;
                }

                return (
                  <article
                    key={line.id}
                    className="grid gap-3 rounded-xl border border-[#eaded8] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-[#54213a]">
                          {line.product.name}
                        </h3>

                        <p className="text-xs text-[#796570]">
                          {line.product.sku || 'No SKU'}
                          {' · '}
                          {line.product.available}
                          {' bottles available'}
                        </p>
                      </div>

                      <button
                        type="button"
                        aria-label={
                          `Remove ${line.product.name}`
                        }
                        disabled={mutationDisabled}
                        className={workspaceSecondary}
                        onClick={() =>
                          removeLine(line.id)
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <fieldset
                      disabled={mutationDisabled}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      <label className={workspaceLabel}>
                        Selling unit

                        <select
                          className={workspaceInput}
                          value={line.packageId}
                          onChange={event =>
                            choosePackage(
                              line.id,
                              event.target.value,
                            )
                          }
                        >
                          <option value="">
                            Individual bottle
                          </option>

                          {line.product.packages.map(
                            item => (
                              <option
                                key={item.id}
                                value={item.id}
                              >
                                {item.unitName}
                                {' · '}
                                {item.unitsPerPackage}
                                {' bottles'}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label className={workspaceLabel}>
                        Quantity

                        <input
                          className={workspaceInput}
                          inputMode="numeric"
                          value={line.quantity}
                          maxLength={7}
                          onChange={event =>
                            updateLine(
                              line.id,
                              {
                                quantity:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>

                      <label className={workspaceLabel}>
                        Agreed unit price (₦)

                        <input
                          className={workspaceInput}
                          inputMode="decimal"
                          value={line.price}
                          maxLength={18}
                          onChange={event =>
                            updateLine(
                              line.id,
                              {
                                price:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>
                    </fieldset>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e6df] pt-3">
                      <span className="text-sm text-[#796570]">
                        {Number.isSafeInteger(bottles) &&
                        bottles > 0
                          ? `${bottles} individual bottles`
                          : 'Check quantity'}
                      </span>

                      <strong className="tabular-nums text-[#54213a]">
                        {lineTotal === undefined
                          ? 'Check price'
                          : money(lineTotal)}
                      </strong>

                      <button
                        type="button"
                        className="text-sm font-semibold text-[#946a37] underline disabled:opacity-50"
                        disabled={
                          mutationDisabled ||
                          basket.length >= 100
                        }
                        onClick={() =>
                          addSeparateLine(
                            line.product,
                          )
                        }
                      >
                        Add another packaging line
                      </button>
                    </div>
                  </article>
                );
              })}

              {calculationError && (
                <WorkspaceNotice
                  tone="error"
                  title="Check sale details"
                >
                  {calculationError}
                </WorkspaceNotice>
              )}

              {stockError && (
                <WorkspaceNotice
                  tone={dispatchNow ? 'error' : 'pending'}
                  title="Available stock"
                >
                  {stockError}

                  {!dispatchNow && (
                    <p>
                      Stock must be available before
                      confirming dispatch.
                    </p>
                  )}
                </WorkspaceNotice>
              )}
            </WorkspacePanel>

            {/* PAYMENT AND TOTALS */}

            <WorkspacePanel className="grid gap-5">
              <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
                <Wallet size={22} />
                Payment and dispatch
              </h2>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#eaded8] bg-white p-4">
                  <p className="text-xs text-[#796570]">
                    Total bottles
                  </p>

                  <strong className="text-xl tabular-nums text-[#54213a]">
                    {calculation?.bottleCount ?? 0}
                  </strong>
                </div>

                <div className="rounded-xl border border-[#eaded8] bg-white p-4">
                  <p className="text-xs text-[#796570]">
                    Total sale
                  </p>

                  <strong className="text-xl tabular-nums text-[#54213a]">
                    {money(calculation?.totalMinor ?? 0)}
                  </strong>
                </div>

                <div className="rounded-xl border border-[#eaded8] bg-white p-4">
                  <p className="text-xs text-[#796570]">
                    Outstanding balance
                  </p>

                  <strong className="text-xl tabular-nums text-[#946a37]">
                    {calculationError
                      ? '—'
                      : money(balanceMinor)}
                  </strong>
                </div>
              </div>

              <fieldset
                disabled={mutationDisabled}
                className="grid gap-4 md:grid-cols-2"
              >
                <label className={workspaceLabel}>
                  Amount received (₦)

                  <input
                    className={workspaceInput}
                    inputMode="decimal"
                    maxLength={18}
                    value={initialPayment}
                    onChange={event => {
                      setInitialPayment(
                        event.target.value,
                      );

                      setPaymentConfirmed(false);
                    }}
                  />
                </label>

                <label className={workspaceLabel}>
                  Payment method

                  <select
                    className={workspaceInput}
                    value={paymentMethod}
                    onChange={event => {
                      setPaymentMethod(
                        event.target.value as WholesalePaymentMethod,
                      );

                      setPaymentConfirmed(false);
                    }}
                  >
                    <option value="cash">
                      Cash
                    </option>

                    <option value="bank_transfer">
                      Bank transfer
                    </option>

                    <option value="card">
                      Physical POS terminal
                    </option>
                  </select>
                </label>

                <label className={`${workspaceLabel} md:col-span-2`}>
                  Payment reference (optional)

                  <input
                    className={workspaceInput}
                    value={paymentReference}
                    maxLength={120}
                    onChange={event =>
                      setPaymentReference(
                        event.target.value,
                      )
                    }
                  />
                </label>

                {paidMinor > 0 && (
                  <label className="flex items-start gap-3 rounded-xl border border-[#e8d8c7] p-4 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[#54213a]"
                      checked={paymentConfirmed}
                      onChange={event =>
                        setPaymentConfirmed(
                          event.target.checked,
                        )
                      }
                    />

                    <span>
                      I confirm that this payment has
                      actually been received.
                      Bank and card payments must be
                      verified independently before recording.
                    </span>
                  </label>
                )}

                {canDispatch && (
                  <label className="flex items-start gap-3 rounded-xl border border-[#e8d8c7] p-4 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[#54213a]"
                      checked={dispatchNow}
                      onChange={event =>
                        setDispatchNow(
                          event.target.checked,
                        )
                      }
                    />

                    <span>
                      <strong className="block">
                        Dispatch goods now
                      </strong>

                      Deduct the actual number of bottles
                      from inventory when this sale succeeds.
                      Leave unchecked to dispatch later.
                    </span>
                  </label>
                )}
              </fieldset>

              <button
                type="submit"
                className={workspacePrimary}
                disabled={!canSave}
              >
                {busy
                  ? 'Recording transaction…'
                  : dispatchNow
                    ? 'Record sale and dispatch'
                    : 'Record wholesale sale'}

                <ArrowRight size={18} />
              </button>

              <p className="text-xs leading-5 text-[#796570]">
                Recording a sale does not automatically
                charge a customer or initiate a bank transfer.
                Undispatched goods are not reserved in this
                version.
              </p>
            </WorkspacePanel>
          </form>
        </>
      )}

      {/* SALES AND DISPATCH REGISTER */}

      <WorkspacePanel className="grid gap-4">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
          {salesMode ? (
            <ClipboardList size={22} />
          ) : (
            <Truck size={22} />
          )}

          {salesMode
            ? 'Wholesale sales history'
            : 'Wholesale dispatch queue'}
        </h2>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={event => {
            event.preventDefault();

            void findOrders();
          }}
        >
          <label className={`${workspaceLabel} min-w-0 flex-1`}>
            Find a business or transaction

            <input
              type="search"
              className={workspaceInput}
              value={orderSearch}
              maxLength={100}
              placeholder="Business name, contact or reference"
              onChange={event =>
                setOrderSearch(
                  event.target.value,
                )
              }
            />
          </label>

          <button
            type="submit"
            className={workspacePrimary}
            disabled={busy}
          >
            <Search size={16} />
            Search
          </button>

          <button
            type="button"
            className={workspaceSecondary}
            disabled={busy}
            onClick={() => {
              setOrderSearch('');

              void findOrders('');
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </form>

        {orders.length === 0 ? (
          <p className="rounded-xl bg-[#faf5f1] p-5 text-sm text-[#796570]">
            No recorded wholesale transactions
            match the current search.
          </p>
        ) : (
          <div className="grid gap-3">
            {orders.map(order => (
              <article
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#eaded8] bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold text-[#54213a]">
                    {order.business_name}
                  </h3>

                  <p className="text-xs text-[#796570]">
                    {reference(order.id)}
                    {' · '}
                    {dateLabel(order.created_at)}
                  </p>

                  <p className="mt-2 text-xs">
                    {order.dispatched_at
                      ? 'Dispatched'
                      : 'Awaiting dispatch'}
                  </p>
                </div>

                {salesMode &&
                  order.total_minor !== undefined && (
                    <div className="text-sm">
                      <strong className="tabular-nums text-[#54213a]">
                        {money(order.total_minor)}
                      </strong>

                      <p>
                        {orderPaymentStatus(order)}
                      </p>

                      <p className="text-xs text-[#946a37]">
                        Balance:{' '}
                        {money(order.balance_minor)}
                      </p>
                    </div>
                  )}

                <button
                  type="button"
                  className={workspaceSecondary}
                  disabled={busy}
                  onClick={() =>
                    void openOrder(order.id)
                  }
                >
                  View details
                  <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        )}

        {ordersHasMore && (
          <button
            type="button"
            className={workspaceSecondary}
            disabled={busy}
            onClick={() =>
              void findOrders(
                appliedOrderSearch,
                true,
              )
            }
          >
            Load more transactions
          </button>
        )}
      </WorkspacePanel>

      {/* SELECTED TRANSACTION */}

      {details && (
        <WorkspacePanel className="grid gap-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#a17940]">
                {reference(details.order.id)}
              </p>

              <h2 className="font-serif text-2xl text-[#54213a]">
                {details.order.business_name}
              </h2>

              <p className="text-sm text-[#796570]">
                {dateLabel(
                  details.order.created_at,
                )}
              </p>
            </div>

            <button
              type="button"
              className={workspaceSecondary}
              onClick={() =>
                setDetails(null)
              }
              aria-label="Close sale details"
            >
              <X size={17} />
            </button>
          </header>

          <div className="grid gap-3 rounded-xl bg-[#faf5f1] p-4 text-sm sm:grid-cols-2">
            <p>
              <strong>Contact:</strong>{' '}
              {details.order.contact || 'Not provided'}
            </p>

            <p>
              <strong>Delivery address:</strong>{' '}
              {details.order.delivery_address || 'Collection / not provided'}
            </p>

            <p>
              <strong>Dispatch:</strong>{' '}
              {dateLabel(
                details.order.dispatched_at,
              )}
            </p>

            <p>
              <strong>Notes:</strong>{' '}
              {details.order.notes || 'None'}
            </p>
          </div>

          {/* PRODUCT SNAPSHOTS */}

          <div className="overflow-auto rounded-xl border border-[#eaded8]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-[#f7efe9] text-[#54213a]">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Packaging</th>
                  <th className="p-3">Bottles</th>

                  {salesMode && (
                    <th className="p-3">Amount</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {details.lines.map(line => (
                  <tr
                    key={line.line_id}
                    className="border-t border-[#eaded8]"
                  >
                    <td className="p-3">
                      <strong>
                        {line.product_name}
                      </strong>

                      <p className="text-xs text-[#796570]">
                        {line.sku || 'No SKU'}
                      </p>
                    </td>

                    <td className="p-3">
                      {line.package_quantity}
                      {' × '}
                      {line.unit_name}
                      {' ('}
                      {line.units_per_package}
                      {' each)'}
                    </td>

                    <td className="p-3 tabular-nums">
                      {line.base_quantity}
                    </td>

                    {salesMode && (
                      <td className="p-3 tabular-nums">
                        {money(
                          line.line_total_minor,
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FINANCIAL HISTORY */}

          {salesMode &&
            details.order.total_minor !== undefined && (
              <>
                <dl className="grid gap-3 rounded-xl border border-[#eaded8] bg-white p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>Order value</dt>

                    <dd className="font-semibold tabular-nums">
                      {money(
                        details.order.total_minor,
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-3">
                    <dt>Amount received</dt>

                    <dd className="tabular-nums">
                      {money(
                        details.order.paid_minor,
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-3 border-t border-[#eaded8] pt-3">
                    <dt>Outstanding</dt>

                    <dd className="font-semibold tabular-nums text-[#946a37]">
                      {money(
                        details.order.balance_minor,
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-3">
                    <dt>Payment status</dt>

                    <dd>
                      {orderPaymentStatus(
                        details.order,
                      )}
                    </dd>
                  </div>
                </dl>

                <h3 className="font-semibold text-[#54213a]">
                  Payment history
                </h3>

                {details.payments.length === 0 ? (
                  <p className="text-sm text-[#796570]">
                    No payments have been recorded.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {details.payments.map(payment => (
                      <div
                        key={payment.id}
                        className="flex flex-wrap justify-between gap-3 rounded-xl border border-[#eaded8] p-3 text-sm"
                      >
                        <div>
                          <strong>
                            {paymentLabel(
                              payment.method,
                            )}
                          </strong>

                          <p className="text-xs text-[#796570]">
                            {dateLabel(payment.created_at)}
                          </p>

                          {payment.reference && (
                            <p className="break-all text-xs">
                              {payment.reference}
                            </p>
                          )}
                        </div>

                        <strong className="tabular-nums">
                          {money(
                            payment.amount_minor,
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}

                {(details.order.balance_minor ?? 0) > 0 && (
                  <form
                    className="grid gap-4 rounded-xl border border-[#e8d8c7] bg-[#fffaf4] p-4"
                    onSubmit={saveAdditionalPayment}
                  >
                    <h3 className="font-semibold text-[#54213a]">
                      Record another payment
                    </h3>

                    <fieldset
                      disabled={mutationDisabled}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <label className={workspaceLabel}>
                        Amount received (₦)

                        <input
                          className={workspaceInput}
                          inputMode="decimal"
                          value={additionalAmount}
                          maxLength={18}
                          required
                          onChange={event => {
                            setAdditionalAmount(
                              event.target.value,
                            );

                            setAdditionalConfirmed(false);
                          }}
                        />
                      </label>

                      <label className={workspaceLabel}>
                        Payment method

                        <select
                          className={workspaceInput}
                          value={additionalMethod}
                          onChange={event => {
                            setAdditionalMethod(
                              event.target.value as WholesalePaymentMethod,
                            );

                            setAdditionalConfirmed(false);
                          }}
                        >
                          <option value="cash">
                            Cash
                          </option>

                          <option value="bank_transfer">
                            Bank transfer
                          </option>

                          <option value="card">
                            POS terminal
                          </option>
                        </select>
                      </label>

                      <label className={`${workspaceLabel} sm:col-span-2`}>
                        Reference (optional)

                        <input
                          className={workspaceInput}
                          value={additionalReference}
                          maxLength={120}
                          onChange={event =>
                            setAdditionalReference(
                              event.target.value,
                            )
                          }
                        />
                      </label>

                      <label className="flex items-start gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={additionalConfirmed}
                          className="mt-1 accent-[#54213a]"
                          onChange={event =>
                            setAdditionalConfirmed(
                              event.target.checked,
                            )
                          }
                        />

                        Confirmed payment has been received.
                      </label>
                    </fieldset>

                    <button
                      type="submit"
                      className={workspacePrimary}
                      disabled={
                        mutationDisabled ||
                        !additionalConfirmed
                      }
                    >
                      Record payment
                    </button>
                  </form>
                )}
              </>
            )}

          {/* DISPATCH MANAGEMENT */}

          <div className="grid gap-3 rounded-xl border border-[#eaded8] p-4">
            <h3 className="flex items-center gap-2 font-semibold text-[#54213a]">
              <Truck size={19} />
              Goods dispatch
            </h3>

            {details.order.dispatched_at ? (
              <>
                <p className="flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 size={16} />

                  Dispatched successfully
                </p>

                <p className="text-xs text-[#796570]">
                  {dateLabel(
                    details.order.dispatched_at,
                  )}
                </p>

                {details.dispatches.map(dispatch => (
                  <p
                    key={dispatch.id}
                    className="break-all text-xs text-[#796570]"
                  >
                    Dispatch reference: {dispatch.id}
                  </p>
                ))}
              </>
            ) : (
              <>
                <p className="text-sm text-[#796570]">
                  These goods have not yet been
                  dispatched. Confirming dispatch
                  deducts all listed bottle quantities
                  from the selling location.
                </p>

                {canDispatch ? (
                  <button
                    type="button"
                    className={workspacePrimary}
                    disabled={mutationDisabled}
                    onClick={dispatchOrder}
                  >
                    <Truck size={17} />

                    Confirm goods dispatched
                  </button>
                ) : (
                  <p className="text-xs text-[#946a37]">
                    An employee with dispatch
                    permission must confirm handover.
                  </p>
                )}
              </>
            )}
          </div>
        </WorkspacePanel>
      )}

      {busy && (
        <p
          role="status"
          className="text-sm text-[#796570]"
        >
          Processing request…
        </p>
      )}
    </div>
  );
}