import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  Calculator,
  ChevronRight,
  ClipboardList,
  Grid2X2,
  History,
  List,
  LogOut,
  Minus,
  Monitor,
  Package,
  Pause,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import {
  ApiError,
  type DesktopApi,
  type StaffIdentity,
} from "./api";

import {
  addProduct,
  calculate,
  emptyDraft,
  emptyRegister,
  exactMatches,
  money,
  nairaToKobo,
  saleTotals,
  type PosCatalogue,
  type PosProduct,
  type PosReceipt,
  type RegisterState,
} from "./domain";

import {
  reconcileStock,
  registerStorage,
} from "./storage";

import {
  Modal,
  Receipt,
} from "./dialogs";

import {
  HeldBasketDialog,
} from "../../../src/components/held-basket-dialog";

import {
  appendHeldBasket,
  takeHeldBasket,
  MAX_HELD_BASKETS,
} from "../../../src/lib/golden-rose/held-baskets";

import {
  CheckoutDialog,
} from "./CheckoutDialog";

import {
  validSalePayment,
  type SalePayment,
} from "../../../src/lib/golden-rose/pos-payments";

import {
  useStockAutoRefresh,
} from "./pos/useStockAutoRefresh";

import {
  customerSale,
  displayChannelId,
  displayPublisher,
  openCustomerDisplay,
} from "./customer-display";

type Overlay =
  | "confirm"
  | "payment"
  | "recall"
  | "calculator"
  | "history"
  | "clear"
  | null;

export function Register({
  api,
  staff,
  logout,
}: {
  api: DesktopApi;
  staff: StaffIdentity;
  logout: () => Promise<void>;
}) {
  const [storage] = useState(
    () => registerStorage(staff.id),
  );

  const [initial] = useState(() => {
    try {
      return {
        state: storage.load(),
        error: "",
      };
    } catch {
      return {
        state: emptyRegister(),
        error:
          "Saved register data could not be restored safely. Contact the owner before using this register.",
      };
    }
  });

  const [state, setState] = useState(initial.state);
  const stateRef = useRef(state);

  const [catalogue, setCatalogue] =
    useState<PosCatalogue | null>(null);

  const [search, setSearch] = useState("");

  const [view, setView] =
    useState<"table" | "grid">("table");

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState(initial.error);

  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const [overlay, setOverlay] =
    useState<Overlay>(null);

  const [receipt, setReceipt] =
    useState<PosReceipt | null>(null);

  const [receiptIsCurrent, setReceiptIsCurrent] =
    useState(false);

  const [cash, setCash] = useState("");
  const [expression, setExpression] = useState("");
  const [answer, setAnswer] = useState("");

  const searchInput = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const catalogueLoadedOnce = useRef(false);
  const paymentLock = useRef(false);

  const scanQueue = useRef(Promise.resolve());
  const scanCount = useRef(0);

  const [scanning, setScanning] = useState(false);

  const [displayChannel] = useState(displayChannelId);

  const display = useRef<
    ReturnType<typeof displayPublisher> | null
  >(null);

  const draft = state.draft;
  const pending = Boolean(draft.pending);


  /* =======================================================
     LIVE STOCK REFRESH
     ======================================================= */

  useStockAutoRefresh(
    () => {
      if (
        !paymentLock.current &&
        scanCount.current === 0
      ) {
        setRefresh(value => value + 1);
      }
    },

    !busy &&
      !pending &&
      !scanning &&
      overlay === null &&
      !receipt,

    15_000,
  );

  const store = catalogue?.locations.find(
    location =>
      location.id === draft.locationId,
  );

  const discountMinor =
    draft.discount.trim()
      ? nairaToKobo(draft.discount)
      : 0;

  let totals = {
    subtotalMinor: 0,
    discountMinor: 0,
    totalMinor: 0,
  };

  let totalsError = "";

  try {
    if (discountMinor === null) {
      throw new Error(
        "Enter a valid NGN discount.",
      );
    }

    totals = saleTotals(
      draft.lines,
      discountMinor,
    );

  } catch (issue) {
    totalsError =
      issue instanceof Error
        ? issue.message
        : "Invalid sale totals.";
  }

  const tendered =
    pending
      ? draft.pending!.tenderedMinor
      : nairaToKobo(cash);

  const change =
    tendered !== null &&
    tendered >= totals.totalMinor
      ? tendered - totals.totalMinor
      : null;


  /* =======================================================
     CUSTOMER-FACING SECOND SCREEN
     ======================================================= */

  const customerSnapshot = useMemo(() => {
    if (receipt && receiptIsCurrent) {
      return customerSale(
        receipt.items.map(item => ({
          quantity: item.quantity,

          product: {
            name: item.name,
            priceMinor: item.unitPriceMinor,
          },
        })),

        receipt.subtotalMinor,
        receipt.discountMinor,
        receipt.totalMinor,
        "complete",
      );
    }

    return customerSale(
      draft.lines,
      totals.subtotalMinor,
      totals.discountMinor,
      totals.totalMinor,

      pending
        ? "confirming"
        : draft.lines.length
          ? "shopping"
          : "idle",
    );
  }, [
    receipt,
    receiptIsCurrent,
    draft.lines,
    totals.subtotalMinor,
    totals.discountMinor,
    totals.totalMinor,
    pending,
  ]);

  useEffect(() => {
    const publisher =
      displayPublisher(displayChannel);

    display.current = publisher;

    return () => {
      publisher.dispose();
      display.current = null;
    };
  }, [displayChannel]);

  useEffect(() => {
    void display.current?.publish(
      customerSnapshot,
    );
  }, [customerSnapshot]);


  /* =======================================================
     PERSISTENT REGISTER STORAGE
     ======================================================= */

  const commit = useCallback(
    (next: RegisterState): boolean => {
      if (initial.error) {
        return false;
      }

      try {
        storage.save(next);

        stateRef.current = next;

        setState(next);

        return true;

      } catch {
        setError(
          "Device storage is unavailable. The sale cannot proceed until the transaction reference can be saved safely.",
        );

        return false;
      }
    },

    [
      initial.error,
      storage,
    ],
  );


  /* =======================================================
     CATALOGUE LOADING
     ======================================================= */

  useEffect(() => {
    const sequence = ++requestSeq.current;

    let cancelled = false;

    const timer = window.setTimeout(
      async () => {
        if (!catalogueLoadedOnce.current) {
          setLoading(true);
        }

        try {
          const result = await api.catalogue(
            search,
            draft.locationId,
          );

          if (
            cancelled ||
            sequence !== requestSeq.current
          ) {
            return;
          }

          setCatalogue(result);

          catalogueLoadedOnce.current = true;

          const current = stateRef.current;

          if (!current.draft.pending) {
            commit({
              ...current,

              draft: {
                ...reconcileStock(
                  result.items,
                  current.draft,
                ),

                locationId:
                  result.selectedLocationId,
              },
            });
          }
        } catch (issue) {
          if (
            !cancelled &&
            sequence === requestSeq.current
          ) {
            setError(
              issue instanceof Error
                ? issue.message
                : "Catalogue unavailable.",
            );
          }
        } finally {
          if (
            !cancelled &&
            sequence === requestSeq.current
          ) {
            setLoading(false);
          }
        }
      },

      200,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    api,
    search,
    draft.locationId,
    refresh,
    commit,
  ]);


  /* =======================================================
     KEYBOARD AND BARCODE SCANNER SUPPORT
     ======================================================= */

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (overlay || receipt) {
        return;
      }

      if (event.key === "F2") {
        event.preventDefault();

        searchInput.current?.focus();
        searchInput.current?.select();
      }

      if (event.key === "F12") {
        event.preventDefault();

        document
          .querySelector<HTMLButtonElement>(
            ".checkout-button",
          )
          ?.click();
      }

      if (
        event.key === "F4" ||
        event.key === "F6"
      ) {
        event.preventDefault();

        document
          .querySelector<HTMLButtonElement>(
            event.key === "F4"
              ? '[data-shortcut="hold"]'
              : '[data-shortcut="recall"]',
          )
          ?.click();
      }

      if (event.key === "F8") {
        event.preventDefault();

        setOverlay("calculator");
      }

      // HID scanners type into the search field.
      // Focus it when typing elsewhere.

      const target = event.target as HTMLElement;

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest(
          "input,textarea,select,[contenteditable]",
        )
      ) {
        event.preventDefault();

        searchInput.current?.focus();

        setSearch(
          value => value + event.key,
        );
      }
    }

    window.addEventListener(
      "keydown",
      keyboard,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        keyboard,
      );
    };
  }, [
    overlay,
    receipt,
  ]);


  /* =======================================================
     ADD PRODUCT
     ======================================================= */

  function add(product: PosProduct) {
    if (
      pending ||
      busy ||
      initial.error
    ) {
      return;
    }

    try {
      const current = stateRef.current;

      const lines = addProduct(
        current.draft.lines,
        product,
      );

      if (
        commit({
          ...current,

          draft: {
            ...current.draft,
            lines,
          },
        })
      ) {
        setError("");

        setNotice(
          product.name + " added to sale.",
        );
      }

    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "The item could not be added.",
      );
    }
  }


  /* =======================================================
     BARCODE SCANNING
     ======================================================= */

  function scan(event: FormEvent) {
    event.preventDefault();

    const code = search.trim();

    const current = stateRef.current;

    if (
      !code ||
      current.draft.pending ||
      paymentLock.current ||
      initial.error
    ) {
      return;
    }

    const location =
      current.draft.locationId;

    setSearch("");
    setError("");

    const matches = exactMatches(
      catalogue?.items ?? [],
      code,
    );

    if (
      !scanCount.current &&
      matches.length === 1 &&
      catalogue?.selectedLocationId === location
    ) {
      add(matches[0]);

      searchInput.current?.focus();

      return;
    }

    scanCount.current++;

    setScanning(true);

    scanQueue.current =
      scanQueue.current.then(async () => {
        try {
          const result = await api.catalogue(
            code,
            location,
          );

          const latest = stateRef.current;

          if (
            latest.draft.locationId !== location ||
            latest.draft.pending
          ) {
            throw new Error(
              "The selling location changed. Scan the item again.",
            );
          }

          const exact = exactMatches(
            result.items,
            code,
          );

          if (exact.length !== 1) {
            throw new Error(
              exact.length
                ? "Multiple variants match this code. Select the intended product."
                : "No exact barcode or SKU match. Search the catalogue.",
            );
          }

          const lines = addProduct(
            latest.draft.lines,
            exact[0],
          );

          if (
            commit({
              ...latest,

              draft: {
                ...latest.draft,
                lines,
              },
            })
          ) {
            setNotice(
              exact[0].name + " added to sale.",
            );
          }

        } catch (issue) {
          setError(
            issue instanceof Error
              ? issue.message
              : "Barcode lookup failed.",
          );
        } finally {
          scanCount.current--;

          setScanning(
            scanCount.current > 0,
          );

          searchInput.current?.focus();
        }
      });
  }


  /* =======================================================
     UPDATE PRODUCT QUANTITY
     ======================================================= */

  function quantity(
    id: string,
    value: number,
  ) {
    if (pending || busy) {
      return;
    }

    const current = stateRef.current;

    const line = current.draft.lines.find(
      item => item.product.id === id,
    );

    if (
      !line ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > Math.min(
        100,
        line.product.available,
      )
    ) {
      setError(
        "Quantity must be within the verified available stock and the 100-unit line limit.",
      );

      return;
    }

    commit({
      ...current,

      draft: {
        ...current.draft,

        lines: current.draft.lines.map(
          item =>
            item.product.id === id
              ? {
                  ...item,
                  quantity: value,
                }
              : item,
        ),
      },
    });
  }


  /* =======================================================
     HOLD MULTIPLE UNPAID BASKETS
     ======================================================= */

  function hold() {
    const current = stateRef.current;

    if (
      current.draft.pending ||
      paymentLock.current ||
      busy ||
      scanning ||
      scanCount.current ||
      initial.error ||
      !current.draft.lines.length ||
      !current.draft.locationId
    ) {
      return;
    }

    try {
      const held = appendHeldBasket(
        current.held,
        {
          id: crypto.randomUUID(),

          createdAt:
            new Date().toISOString(),

          draft:
            current.draft,
        },
      );

      if (
        commit({
          ...current,
          held,

          draft: {
            ...emptyDraft(),

            locationId:
              current.draft.locationId,
          },
        })
      ) {
        setCash("");
        setSearch("");
        setError("");

        setNotice(
          "Basket held. You can serve the next customer. Stock is not reserved.",
        );

        searchInput.current?.focus();
      }

    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "The basket could not be held.",
      );
    }
  }


  /* =======================================================
     RECALL OR SWAP HELD BASKET
     ======================================================= */

  function recall(id: string) {
    const current = stateRef.current;

    if (
      current.draft.pending ||
      paymentLock.current ||
      busy ||
      scanning ||
      scanCount.current ||
      initial.error
    ) {
      return;
    }

    const result = takeHeldBasket(
      current.held,
      id,
    );

    if (!result) {
      setError(
        "This held basket is no longer available.",
      );

      return;
    }

    const saved = result.basket;

    if (
      saved.draft.pending ||
      !saved.draft.locationId ||
      !catalogue?.locations.some(
        location =>
          location.id === saved.draft.locationId,
      )
    ) {
      setError(
        "This basket cannot be recalled at the currently available selling locations.",
      );

      return;
    }

    try {
      const held =
        current.draft.lines.length

          ? appendHeldBasket(
              result.remaining,
              {
                id: crypto.randomUUID(),

                createdAt:
                  new Date().toISOString(),

                draft:
                  current.draft,
              },
            )

          : result.remaining;

      if (
        commit({
          ...current,

          draft:
            saved.draft,

          held,
        })
      ) {
        setCash("");
        setSearch("");
        setError("");

        setOverlay(null);

        setRefresh(value => value + 1);

        setNotice(
          "Basket recalled. Stock and prices will be checked again at checkout. Enter payment afresh.",
        );
      }

    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "The basket could not be recalled.",
      );
    }
  }


  /* =======================================================
     REMOVE HELD BASKET
     ======================================================= */

  function removeHeld(id: string) {
    const current = stateRef.current;

    if (
      current.draft.pending ||
      paymentLock.current ||
      busy ||
      scanning ||
      scanCount.current ||
      initial.error
    ) {
      return;
    }

    const result = takeHeldBasket(
      current.held,
      id,
    );

    if (
      result &&
      commit({
        ...current,

        held:
          result.remaining,
      })
    ) {
      setError("");

      setNotice(
        "Unpaid held basket removed. No payment or stock movement recorded.",
      );
    }
  }


  /* =======================================================
     COMPLETE SALE / RECOVER PENDING PAYMENT
     ======================================================= */

  async function payment(
    allocation?: SalePayment,
  ): Promise<boolean> {
    if (
      paymentLock.current ||
      scanCount.current ||
      initial.error
    ) {
      return false;
    }

    paymentLock.current = true;

    setBusy(true);
    setError("");

    const current = stateRef.current;

    const retry =
      Boolean(current.draft.pending);

    try {
      let request =
        current.draft.pending;

      if (!request) {
        if (
          !current.draft.locationId ||
          !current.draft.lines.length ||
          totalsError
        ) {
          throw new Error(
            "Check the store, items and discount.",
          );
        }

        const payment: SalePayment =
          allocation ?? {
            method: "cash",
            tenderedMinor: tendered ?? 0,
          };

        if (
          !validSalePayment(
            payment,
            totals.totalMinor,
          ) ||
          (
            payment.payments !== undefined &&
            catalogue?.paymentVersion !== 2
          )
        ) {
          throw new Error(
            "Check the payment allocation or refresh the register.",
          );
        }

        request = {
          idempotencyKey:
            crypto.randomUUID(),

          locationId:
            current.draft.locationId,

          ...payment,

          items:
            current.draft.lines.map(line => ({
              variantId:
                line.product.id,

              quantity:
                line.quantity,

              expectedPriceMinor:
                line.product.priceMinor,
            })),

          discountMinor:
            totals.discountMinor,
        };

        // Persist the reference before sending
        // the financial transaction to the server.

        if (
          !commit({
            ...current,

            draft: {
              ...current.draft,
              pending: request,
            },
          })
        ) {
          return false;
        }
      }

      const confirmed =
        await api.checkout(request);

      setReceiptIsCurrent(true);
      setReceipt(confirmed);
      setOverlay(null);

      const latest = stateRef.current;

      commit({
        ...latest,

        draft: {
          ...emptyDraft(),

          locationId:
            request.locationId,
        },

        receipts: [
          confirmed,

          ...latest.receipts.filter(
            item =>
              item.saleId !== confirmed.saleId,
          ),
        ].slice(0, 100),
      });

      setCash("");

      setNotice(
        "Sale recorded. Stock and receipt are confirmed.",
      );

      setRefresh(value => value + 1);

      return true;

    } catch (issue) {

      // A first definitive rejection can be corrected.
      // An uncertain older request remains frozen even
      // after an authorization error on a subsequent retry.

      if (
        !retry &&
        issue instanceof ApiError &&
        issue.rejected
      ) {
        const latest = stateRef.current;

        commit({
          ...latest,

          draft: {
            ...latest.draft,
            pending: null,
          },
        });
      }

      setError(
        issue instanceof Error
          ? issue.message
          : "Confirmation unavailable. Retry the same transaction reference.",
      );

      return false;

    } finally {
      paymentLock.current = false;

      setBusy(false);
    }
  }


  /* =======================================================
     CATALOGUE PAGINATION
     ======================================================= */

  async function more() {
    if (
      loading ||
      !catalogue?.hasMore
    ) {
      return;
    }

    const sequence =
      requestSeq.current;

    setLoading(true);

    try {
      const result =
        await api.catalogue(
          search,
          draft.locationId,
          catalogue.items.length,
        );

      if (
        sequence === requestSeq.current
      ) {
        setCatalogue({
          ...result,

          items: [
            ...catalogue.items,

            ...result.items.filter(
              item =>
                !catalogue.items.some(
                  existing =>
                    existing.id === item.id,
                ),
            ),
          ],
        });
      }

    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "Could not load more products.",
      );

    } finally {
      if (
        sequence === requestSeq.current
      ) {
        setLoading(false);
      }
    }
  }


  /* =======================================================
     CHANGE SELLING STORE
     ======================================================= */

  const changeStore = (
    locationId: string,
  ) => {
    if (
      draft.lines.length ||
      pending ||
      scanning
    ) {
      setError(
        "Hold or clear the current sale before changing stores.",
      );

      return;
    }

    setLoading(true);
    setCatalogue(null);

    commit({
      ...stateRef.current,

      draft: {
        ...draft,
        locationId,
      },
    });
  };


  /* =======================================================
     REGISTER INTERFACE
     ======================================================= */

  return (
    <div className="register">
      <header className="register-topbar">
        <div className="register-brand">
          <img
            src="/golden-rose-logo.png"
            alt="Golden Rose Perfume"
          />

          <div>
            <strong>
              Golden Rose
            </strong>

            <label className="store-selector">
              <span className="sr-only">
                Active store
              </span>

              <select
                value={draft.locationId ?? ""}
                onChange={event =>
                  changeStore(event.target.value)
                }
                disabled={
                  busy ||
                  pending ||
                  Boolean(draft.lines.length)
                }
              >
                <option value="" disabled>
                  Select store
                </option>

                {catalogue?.locations.map(location => (
                  <option
                    key={location.id}
                    value={location.id}
                  >
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>


        {/* REGISTER ACTIONS */}

        <div className="register-actions">
          <button
            data-shortcut="hold"
            disabled={
              !draft.lines.length ||
              !draft.locationId ||
              pending ||
              busy ||
              scanning ||
              Boolean(initial.error) ||
              state.held.length >= MAX_HELD_BASKETS
            }
            title={
              state.held.length >= MAX_HELD_BASKETS
                ? "Hold queue is full"
                : "Hold sale (F4)"
            }
            onClick={hold}
          >
            <Pause size={16} />
            Hold
          </button>

          <button
            data-shortcut="recall"
            disabled={
              pending ||
              busy ||
              scanning ||
              Boolean(initial.error)
            }
            title="Recall sale (F6)"
            onClick={() => setOverlay("recall")}
          >
            <ClipboardList size={16} />

            Recall
            {state.held.length
              ? " (" + state.held.length + ")"
              : ""}
          </button>

          <button
            disabled={
              !draft.lines.length ||
              pending ||
              busy ||
              scanning
            }
            onClick={() => setOverlay("clear")}
          >
            <Trash2 size={16} />
            Clear
          </button>

          <button
            onClick={() => setOverlay("calculator")}
            title="Calculator (F8)"
          >
            <Calculator size={16} />
            Calculator
          </button>

          <button
            onClick={() => {
              void openCustomerDisplay(
                displayChannel,
              ).catch(issue =>
                setError(
                  issue instanceof Error
                    ? issue.message
                    : "Customer display unavailable.",
                ),
              );
            }}
            title="Open the customer-facing second screen"
          >
            <Monitor size={16} />
            Customer display
          </button>

          <button
            onClick={() => setOverlay("history")}
          >
            <History size={16} />
            Sales history
          </button>
        </div>

        <div className="identity">
          <span>
            <strong>
              {staff.name}
            </strong>

            <small>
              {staff.role === "owner"
                ? "Owner"
                : staff.role === "manager"
                  ? "Manager"
                  : "Cashier"}
            </small>
          </span>

          <button
            aria-label="Sign out"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>


      {/* REGISTER NOTIFICATIONS */}

      <div
        className="register-message"
        aria-live="polite"
      >
        {error ? (
          <p
            className="notice error"
            role="alert"
          >
            {error}

            <button
              aria-label="Dismiss error"
              onClick={() =>
                !initial.error &&
                setError("")
              }
            >
              ×
            </button>
          </p>
        ) : notice ? (
          <p className="notice success">
            {notice}
          </p>
        ) : (
          <p>
            Live stock · Automatic updates every
            15 seconds · Register payments ·{" "}

            {store?.name ??
              "Select your selling store"}
          </p>
        )}
      </div>


      {/* CATALOGUE AND CURRENT SALE */}

      <div className="register-columns">
        <section
          className="products-area"
          aria-labelledby="products-title"
        >
          <div className="products-heading">
            <div>
              <span className="eyebrow">
                Catalogue
              </span>

              <h1 id="products-title">
                Find a fragrance
              </h1>
            </div>

            <button
              className="icon-button"
              aria-label="Refresh stock"
              disabled={loading}
              onClick={() =>
                setRefresh(value => value + 1)
              }
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="catalogue-tools">
            <form
              onSubmit={scan}
              className="search-box"
            >
              <Search size={20} />

              <input
                ref={searchInput}
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                aria-label="Search products or scan barcode"
                placeholder="Scan barcode, search name or SKU…"
                maxLength={100}
                autoFocus
                autoComplete="off"
              />

              <kbd>F2</kbd>

              <button
                type="submit"
                disabled={pending}
              >
                Find / Add
              </button>
            </form>

            <div
              className="view-toggle"
              aria-label="Product view"
            >
              <button
                aria-label="Table view"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <List size={19} />
              </button>

              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <Grid2X2 size={18} />
              </button>
            </div>
          </div>

          <div className="catalogue-status">
            <span>
              {catalogue?.items.length ?? 0}
              {" "}variants loaded

              {catalogue?.hasMore
                ? " · More available"
                : ""}
            </span>

            <span>
              {scanning
                ? "Reading barcode…"
                : loading
                  ? "Checking products and stock…"
                  : "Prices in NGN"}
            </span>
          </div>

          {!catalogue?.items.length && !loading ? (
            <div className="empty-state">
              <Package size={35} />

              <h2>
                {search
                  ? "No matching products"
                  : "No products available"}
              </h2>

              <p>
                {search
                  ? "Try another name, SKU or barcode."
                  : "Published status does not create stock. The owner must record real inventory at this store."}
              </p>
            </div>
          ) : view === "table" ? (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU / Barcode</th>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Stock</th>

                    <th>
                      <span className="sr-only">
                        Add
                      </span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {catalogue?.items.map(product => (
                    <tr key={product.id}>
                      <td>
                        <strong>
                          {product.name}
                        </strong>

                        <small>
                          {product.brand || "—"}
                        </small>
                      </td>

                      <td>
                        <span className="code">
                          {product.sku || "—"}
                        </span>

                        <small className="code">
                          {product.barcode ||
                            "No barcode"}
                        </small>
                      </td>

                      <td>
                        {product.sizeMl
                          ? product.sizeMl + " ml"
                          : "—"}
                      </td>

                      <td className="price">
                        {money(product.priceMinor)}
                      </td>

                      <td>
                        <span
                          className={
                            product.available > 0
                              ? "stock in-stock"
                              : "stock no-stock"
                          }
                        >
                          {product.available > 0
                            ? product.available + " available"
                            : "Unavailable"}
                        </span>
                      </td>

                      <td>
                        <button
                          aria-label={
                            "Add " + product.name
                          }
                          className="add-button"
                          disabled={
                            pending ||
                            busy ||
                            initial.error !== "" ||
                            product.available <= 0 ||
                            product.priceMinor <= 0
                          }
                          onClick={() => add(product)}
                        >
                          <Plus size={17} />

                          <span>
                            Add
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="product-grid">
              {catalogue?.items.map(product => (
                <article key={product.id}>
                  <div className="product-monogram">
                    <Package size={32} />
                  </div>

                  <small>
                    {product.brand || "Perfume"}
                  </small>

                  <h3>
                    {product.name}
                  </h3>

                  <p>
                    {product.sizeMl
                      ? product.sizeMl + " ml · "
                      : ""}

                    {product.sku}
                  </p>

                  <strong>
                    {money(product.priceMinor)}
                  </strong>

                  <span
                    className={
                      product.available > 0
                        ? "stock in-stock"
                        : "stock no-stock"
                    }
                  >
                    {product.available > 0
                      ? product.available + " available"
                      : "Unavailable"}
                  </span>

                  <button
                    disabled={
                      pending ||
                      busy ||
                      Boolean(initial.error) ||
                      product.available <= 0 ||
                      product.priceMinor <= 0
                    }
                    onClick={() => add(product)}
                  >
                    <Plus size={17} />
                    Add to sale
                  </button>
                </article>
              ))}
            </div>
          )}

          <footer className="catalogue-footer">
            <span>
              F2 search · Repeated scans
              increase quantity
            </span>

            {catalogue?.hasMore ? (
              <button
                disabled={loading}
                onClick={() => void more()}
              >
                {loading
                  ? "Loading…"
                  : "Load more products"}
              </button>
            ) : (
              <span>
                {catalogue?.items.length ?? 0}
                {" "}variants
              </span>
            )}
          </footer>
        </section>


        {/* CURRENT SALE BASKET */}

        <aside
          className="basket"
          aria-labelledby="sale-title"
        >
          <header>
            <div>
              <span className="eyebrow">
                Register
              </span>

              <h2 id="sale-title">
                Current sale
              </h2>
            </div>

            <span className="basket-count">
              {draft.lines.reduce(
                (sum, line) => sum + line.quantity,
                0,
              )}
              {" "}items
            </span>
          </header>

          {pending && (
            <p className="notice pending">
              Confirmation pending. This basket
              is locked until the same transaction
              is confirmed.

              <small className="code">
                {draft.pending?.idempotencyKey}
              </small>

              <button
                onClick={() =>
                  setOverlay(
                    pending
                      ? "payment"
                      : "confirm",
                  )
                }
              >
                Recover transaction

                <ChevronRight size={16} />
              </button>
            </p>
          )}

          <div className="basket-lines">
            {!draft.lines.length ? (
              <div className="empty-state">
                <ShoppingBag size={36} />

                <h3>
                  Your sale starts here
                </h3>

                <p>
                  Scan a barcode or add a
                  fragrance from the catalogue.
                </p>
              </div>
            ) : (
              draft.lines.map(line => (
                <article
                  className="basket-line"
                  key={line.product.id}
                >
                  <div className="basket-line-top">
                    <div>
                      <h3>
                        {line.product.name}
                      </h3>

                      <small>
                        {line.product.sizeMl
                          ? line.product.sizeMl + " ml · "
                          : ""}

                        {line.product.sku || "No SKU"}
                      </small>
                    </div>

                    <button
                      className="remove-line"
                      aria-label={
                        "Remove " + line.product.name
                      }
                      disabled={pending || busy}
                      onClick={() =>
                        commit({
                          ...stateRef.current,

                          draft: {
                            ...draft,

                            lines: draft.lines.filter(
                              item =>
                                item.product.id !==
                                line.product.id,
                            ),
                          },
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="basket-line-bottom">
                    <div className="quantity-control">
                      <button
                        aria-label={
                          "Decrease " +
                          line.product.name
                        }
                        disabled={
                          pending ||
                          busy ||
                          line.quantity === 1
                        }
                        onClick={() =>
                          quantity(
                            line.product.id,
                            line.quantity - 1,
                          )
                        }
                      >
                        <Minus size={13} />
                      </button>

                      <input
                        aria-label={
                          "Quantity for " +
                          line.product.name
                        }
                        value={line.quantity}
                        type="number"
                        min={1}
                        max={
                          Math.min(
                            100,
                            line.product.available,
                          )
                        }
                        disabled={pending || busy}
                        onChange={event =>
                          quantity(
                            line.product.id,
                            Number(event.target.value),
                          )
                        }
                      />

                      <button
                        aria-label={
                          "Increase " +
                          line.product.name
                        }
                        disabled={
                          pending ||
                          busy ||
                          line.quantity >=
                            line.product.available
                        }
                        onClick={() =>
                          quantity(
                            line.product.id,
                            line.quantity + 1,
                          )
                        }
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    <span>
                      {money(line.product.priceMinor)}

                      <strong>
                        {money(
                          line.product.priceMinor *
                            line.quantity,
                        )}
                      </strong>
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="sale-summary">
            <dl>
              <div>
                <dt>Subtotal</dt>

                <dd>
                  {money(totals.subtotalMinor)}
                </dd>
              </div>

              {totals.discountMinor > 0 && (
                <div>
                  <dt>Discount</dt>

                  <dd>
                    −{money(totals.discountMinor)}
                  </dd>
                </div>
              )}

              <div className="sale-total">
                <dt>Total</dt>

                <dd>
                  {totalsError
                    ? "—"
                    : money(totals.totalMinor)}
                </dd>
              </div>
            </dl>

            {totalsError && (
              <p
                role="alert"
                className="field-error"
              >
                {totalsError}
              </p>
            )}

            <button
              className="primary checkout-button"
              disabled={
                busy ||
                scanning ||
                Boolean(initial.error) ||
                (
                  !pending &&
                  (
                    !draft.lines.length ||
                    !draft.locationId
                  )
                )
              }
              onClick={() => {
                setError("");

                setOverlay(
                  pending
                    ? "payment"
                    : "confirm",
                );
              }}
            >
              <span>
                {pending
                  ? "Recover payment"
                  : "Checkout"}
              </span>

              <span>
                {money(totals.totalMinor)}

                <ChevronRight size={18} />
              </span>
            </button>

            <small className="checkout-note">
              F2 search · F4 hold · F6 recall ·
              F8 calculator · F12 checkout
            </small>
          </div>
        </aside>
      </div>


      {/* ===================================================
          PAYMENT MODAL
          =================================================== */}

      {(
        overlay === "confirm" ||
        overlay === "payment"
      ) && (
        <CheckoutDialog
          step={overlay}
          count={
            draft.lines.reduce(
              (sum, line) => sum + line.quantity,
              0,
            )
          }
          subtotal={totals.subtotalMinor}
          total={totals.totalMinor}
          discount={draft.discount}
          setDiscount={value =>
            commit({
              ...stateRef.current,

              draft: {
                ...stateRef.current.draft,
                discount: value,
              },
            })
          }
          cash={cash}
          setCash={setCash}
          tendered={tendered}
          change={change}
          pendingReference={
            draft.pending?.idempotencyKey
          }
          pendingPayment={draft.pending}
          paymentVersion={
            catalogue?.paymentVersion
          }
          bankAccount={
            catalogue?.receivingAccount
          }
          busy={busy}
          error={error}
          totalsError={totalsError}
          close={() =>
            !busy &&
            setOverlay(null)
          }
          back={() => setOverlay("confirm")}
          next={() => setOverlay("payment")}
          pay={payment}
        />
      )}


      {/* ===================================================
          CLEAR BASKET
          =================================================== */}

      {overlay === "clear" && (
        <Modal
          title="Clear this basket?"
          close={() => setOverlay(null)}
        >
          <p>
            The items will be removed
            from this device’s current sale.
          </p>

          <button
            className="primary"
            onClick={() => {
              if (
                commit({
                  ...stateRef.current,

                  draft: {
                    ...emptyDraft(),

                    locationId:
                      draft.locationId,
                  },
                })
              ) {
                setOverlay(null);
              }
            }}
          >
            Clear basket
          </button>
        </Modal>
      )}


      {/* ===================================================
          RECALL HELD TRANSACTIONS
          =================================================== */}

      {overlay === "recall" && (
        <HeldBasketDialog
          baskets={
            state.held.map(held => ({
              id:
                held.id,

              createdAt:
                held.createdAt,

              location:
                catalogue?.locations.find(
                  location =>
                    location.id === held.draft.locationId,
                )?.name ??
                "Unavailable selling location",

              discountMinor:
                held.draft.discount.trim()
                  ? nairaToKobo(held.draft.discount)
                  : 0,

              lines:
                held.draft.lines.map(
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
            draft.lines.length > 0
          }
          disabled={
            pending ||
            busy ||
            scanning ||
            Boolean(initial.error)
          }
          errorMessage={
            error || undefined
          }
          close={() => setOverlay(null)}
          recall={recall}
          remove={removeHeld}
        />
      )}


      {/* ===================================================
          CALCULATOR
          =================================================== */}

      {overlay === "calculator" && (
        <Modal
          title="Calculator"
          close={() => setOverlay(null)}
        >
          <form
            onSubmit={event => {
              event.preventDefault();

              try {
                setAnswer(
                  String(calculate(expression)),
                );
              } catch (issue) {
                setAnswer(
                  issue instanceof Error
                    ? issue.message
                    : "Invalid calculation",
                );
              }
            }}
          >
            <label>
              Calculation

              <input
                autoFocus
                aria-label="Calculation"
                value={expression}
                onChange={event =>
                  setExpression(event.target.value)
                }
                placeholder="Quantity × unit price, e.g. 3 × 12500"
              />
            </label>

            <button className="primary">
              Calculate
            </button>

            <output className="calculator-result">
              {answer || "—"}
            </output>
          </form>
        </Modal>
      )}


      {/* ===================================================
          VERIFIED RECEIPT HISTORY
          =================================================== */}

      {overlay === "history" && (
        <Modal
          title="Sales history"
          close={() => setOverlay(null)}
        >
          <p>
            Confirmed receipts from this
            account on this device.
          </p>

          {state.receipts.length ? (
            state.receipts.map(item => (
              <button
                className="history-row"
                key={item.saleId}
                onClick={async () => {
                  setBusy(true);

                  try {
                    const verified =
                      await api.receipt(item.saleId);

                    setReceiptIsCurrent(false);

                    setReceipt(verified);

                    setOverlay(null);

                  } catch (issue) {
                    setError(
                      issue instanceof Error
                        ? issue.message
                        : "Receipt unavailable.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                <span>
                  <strong>
                    Sale #{item.saleNumber}
                  </strong>

                  <small>
                    {new Date(
                      item.createdAt,
                    ).toLocaleString()}
                  </small>
                </span>

                <strong>
                  {money(item.totalMinor)}
                </strong>
              </button>
            ))
          ) : (
            <p>
              No confirmed receipts on
              this device yet.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="notice error"
            >
              {error}
            </p>
          )}
        </Modal>
      )}

      {receipt && (
        <Receipt
          receipt={receipt}
          close={() => setReceipt(null)}
        />
      )}
    </div>
  );
}