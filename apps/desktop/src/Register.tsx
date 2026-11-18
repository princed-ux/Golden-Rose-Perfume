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
import { ApiError, type DesktopApi, type StaffIdentity } from "./api";
import {
  addProduct,
  calculate,
  cashChange,
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
import { reconcileStock, registerStorage } from "./storage";
import { Modal, Receipt } from "./dialogs";
import { CheckoutDialog } from "./CheckoutDialog";
import { useStockAutoRefresh } from "./pos/useStockAutoRefresh";
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
  const [storage] = useState(() => registerStorage(staff.id));
  const [initial] = useState(() => {
    try {
      return { state: storage.load(), error: "" };
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
  const [catalogue, setCatalogue] = useState<PosCatalogue | null>(null);
  const [search, setSearch] = useState(""),
    [view, setView] = useState<"table" | "grid">("table");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(initial.error),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0),
    [overlay, setOverlay] = useState<Overlay>(null);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [receiptIsCurrent, setReceiptIsCurrent] = useState(false);
  const [cash, setCash] = useState(""),
    [expression, setExpression] = useState(""),
    [answer, setAnswer] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const catalogueLoadedOnce = useRef(false);
  const paymentLock = useRef(false);
  const scanQueue = useRef(Promise.resolve());
  const scanCount = useRef(0);
  const [scanning, setScanning] = useState(false);
  const [displayChannel] = useState(displayChannelId);
  const display = useRef<ReturnType<typeof displayPublisher> | null>(null);
  const draft = state.draft;
  const pending = Boolean(draft.pending);

  // Keep current stock fresh while the cashier is working.
  // The same authenticated catalogue loader remains in use.
  useStockAutoRefresh(
    () => {
      if (!paymentLock.current && scanCount.current === 0) {
        setRefresh((value) => value + 1);
      }
    },
    !busy && !pending && !scanning && overlay === null && !receipt,
    15_000,
  );
  const store = catalogue?.locations.find(
    (location) => location.id === draft.locationId,
  );
  const discountMinor = draft.discount.trim() ? nairaToKobo(draft.discount) : 0;
  let totals = { subtotalMinor: 0, discountMinor: 0, totalMinor: 0 },
    totalsError = "";
  try {
    if (discountMinor === null) throw new Error("Enter a valid NGN discount.");
    totals = saleTotals(draft.lines, discountMinor);
  } catch (issue) {
    totalsError =
      issue instanceof Error ? issue.message : "Invalid sale totals.";
  }
  const tendered = pending ? draft.pending!.tenderedMinor : nairaToKobo(cash);
  const change =
    tendered !== null && tendered >= totals.totalMinor
      ? tendered - totals.totalMinor
      : null;

  const customerSnapshot = useMemo(() => {
    if (receipt && receiptIsCurrent)
      return customerSale(
        receipt.items.map((item) => ({
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
    return customerSale(
      draft.lines,
      totals.subtotalMinor,
      totals.discountMinor,
      totals.totalMinor,
      pending ? "confirming" : draft.lines.length ? "shopping" : "idle",
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
    const publisher = displayPublisher(displayChannel);
    display.current = publisher;
    return () => {
      publisher.dispose();
      display.current = null;
    };
  }, [displayChannel]);
  useEffect(() => {
    void display.current?.publish(customerSnapshot);
  }, [customerSnapshot]);

  const commit = useCallback(
    (next: RegisterState): boolean => {
      if (initial.error) return false;
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
    [initial.error, storage],
  );

  useEffect(() => {
    const sequence = ++requestSeq.current;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!catalogueLoadedOnce.current) {
        setLoading(true);
      }
      try {
        const result = await api.catalogue(search, draft.locationId);
        if (cancelled || sequence !== requestSeq.current) return;
        setCatalogue(result);
        catalogueLoadedOnce.current = true;
        const current = stateRef.current;
        if (!current.draft.pending) {
          commit({
            ...current,
            draft: {
              ...reconcileStock(result.items, current.draft),
              locationId: result.selectedLocationId,
            },
          });
        }
      } catch (issue) {
        if (!cancelled && sequence === requestSeq.current)
          setError(
            issue instanceof Error ? issue.message : "Catalogue unavailable.",
          );
      } finally {
        if (!cancelled && sequence === requestSeq.current) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, search, draft.locationId, refresh, commit]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (overlay || receipt) return;
      if (event.key === "F2") {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
      if (event.key === "F12") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>(".checkout-button")?.click();
      }
      if (event.key === "F4" || event.key === "F6") {
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
      // HID scanners type into the search field. Focus it when typing elsewhere.
      const target = event.target as HTMLElement;
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest("input,textarea,select,[contenteditable]")
      ) {
        event.preventDefault();
        searchInput.current?.focus();
        setSearch((value) => value + event.key);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [overlay, receipt]);

  function add(product: PosProduct) {
    if (pending || busy || initial.error) return;
    try {
      const current = stateRef.current;
      const lines = addProduct(current.draft.lines, product);
      if (commit({ ...current, draft: { ...current.draft, lines } })) {
        setError("");
        setNotice(product.name + " added to sale.");
      }
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "The item could not be added.",
      );
    }
  }

  function scan(event: FormEvent) {
    event.preventDefault();
    const code = search.trim();
    const current = stateRef.current;
    if (!code || current.draft.pending || paymentLock.current || initial.error)
      return;
    const location = current.draft.locationId;
    setSearch("");
    setError("");
    const matches = exactMatches(catalogue?.items ?? [], code);
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
    scanQueue.current = scanQueue.current.then(async () => {
      try {
        const result = await api.catalogue(code, location);
        const latest = stateRef.current;
        if (latest.draft.locationId !== location || latest.draft.pending)
          throw new Error("The selling location changed. Scan the item again.");
        const exact = exactMatches(result.items, code);
        if (exact.length !== 1)
          throw new Error(
            exact.length
              ? "Multiple variants match this code. Select the intended product."
              : "No exact barcode or SKU match. Search the catalogue.",
          );
        const lines = addProduct(latest.draft.lines, exact[0]);
        if (commit({ ...latest, draft: { ...latest.draft, lines } }))
          setNotice(exact[0].name + " added to sale.");
      } catch (issue) {
        setError(
          issue instanceof Error ? issue.message : "Barcode lookup failed.",
        );
      } finally {
        scanCount.current--;
        setScanning(scanCount.current > 0);
        searchInput.current?.focus();
      }
    });
  }

  function quantity(id: string, value: number) {
    if (pending || busy) return;
    const current = stateRef.current;
    const line = current.draft.lines.find((item) => item.product.id === id);
    if (
      !line ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > Math.min(100, line.product.available)
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
        lines: current.draft.lines.map((item) =>
          item.product.id === id ? { ...item, quantity: value } : item,
        ),
      },
    });
  }

  function hold() {
    const current = stateRef.current;
    if (pending || busy || scanning || !current.draft.lines.length) return;
    if (current.held.length >= 10) {
      setError("Recall or remove a held basket before holding another.");
      return;
    }
    if (
      commit({
        ...current,
        held: [
          ...current.held,
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            draft: current.draft,
          },
        ],
        draft: { ...emptyDraft(), locationId: current.draft.locationId },
      })
    )
      setNotice("Basket held on this device. Stock is not reserved.");
  }

  function recall(id: string) {
    const current = stateRef.current;
    if (current.draft.lines.length || pending) {
      setError(
        "Hold or clear the current sale before recalling another basket.",
      );
      return;
    }
    const saved = current.held.find((item) => item.id === id);
    if (
      saved &&
      commit({
        ...current,
        draft: saved.draft,
        held: current.held.filter((item) => item.id !== id),
      })
    ) {
      setOverlay(null);
      setRefresh((value) => value + 1);
      setNotice(
        "Basket recalled. Stock and prices will be rechecked at checkout.",
      );
    }
  }

  async function payment() {
    if (paymentLock.current || scanCount.current || initial.error) return;
    paymentLock.current = true;
    setBusy(true);
    setError("");
    const current = stateRef.current;
    const retry = Boolean(current.draft.pending);
    try {
      let request = current.draft.pending;
      if (!request) {
        if (
          !current.draft.locationId ||
          !current.draft.lines.length ||
          totalsError ||
          tendered === null
        )
          throw new Error("Check the store, items, discount and cash amount.");
        cashChange(totals.totalMinor, tendered);
        request = {
          idempotencyKey: crypto.randomUUID(),
          locationId: current.draft.locationId,
          method: "cash",
          items: current.draft.lines.map((line) => ({
            variantId: line.product.id,
            quantity: line.quantity,
            expectedPriceMinor: line.product.priceMinor,
          })),
          discountMinor: totals.discountMinor,
          tenderedMinor: tendered,
        };
        if (
          !commit({ ...current, draft: { ...current.draft, pending: request } })
        )
          return;
      }
      const confirmed = await api.checkout(request);
      setReceiptIsCurrent(true);
      setReceipt(confirmed);
      setOverlay(null);
      const latest = stateRef.current;
      commit({
        ...latest,
        draft: { ...emptyDraft(), locationId: request.locationId },
        receipts: [
          confirmed,
          ...latest.receipts.filter((item) => item.saleId !== confirmed.saleId),
        ].slice(0, 100),
      });
      setCash("");
      setNotice("Cash sale recorded. Stock and receipt are confirmed.");
      setRefresh((value) => value + 1);
    } catch (issue) {
      // A first definitive rejection can be corrected. An uncertain older request
      // remains frozen even after an authorization error on a subsequent retry.
      if (!retry && issue instanceof ApiError && issue.rejected) {
        const latest = stateRef.current;
        commit({ ...latest, draft: { ...latest.draft, pending: null } });
      }
      setError(
        issue instanceof Error
          ? issue.message
          : "Confirmation unavailable. Retry the same transaction reference.",
      );
    } finally {
      paymentLock.current = false;
      setBusy(false);
    }
  }

  async function more() {
    if (loading || !catalogue?.hasMore) return;
    const sequence = requestSeq.current;
    setLoading(true);
    try {
      const result = await api.catalogue(
        search,
        draft.locationId,
        catalogue.items.length,
      );
      if (sequence === requestSeq.current)
        setCatalogue({
          ...result,
          items: [
            ...catalogue.items,
            ...result.items.filter(
              (item) =>
                !catalogue.items.some((existing) => existing.id === item.id),
            ),
          ],
        });
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "Could not load more products.",
      );
    } finally {
      if (sequence === requestSeq.current) setLoading(false);
    }
  }

  const changeStore = (locationId: string) => {
    if (draft.lines.length || pending || scanning) {
      setError("Hold or clear the current sale before changing stores.");
      return;
    }
    setLoading(true);
    setCatalogue(null);
    commit({ ...stateRef.current, draft: { ...draft, locationId } });
  };

  return (
    <div className="register">
      <header className="register-topbar">
        <div className="register-brand">
          <img src="/golden-rose-logo.png" alt="Golden Rose Perfume" />
          <div>
            <strong>Golden Rose</strong>
            <label className="store-selector">
              <span className="sr-only">Active store</span>
              <select
                value={draft.locationId ?? ""}
                onChange={(event) => changeStore(event.target.value)}
                disabled={busy || pending || Boolean(draft.lines.length)}
              >
                <option value="" disabled>
                  Select store
                </option>
                {catalogue?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="register-actions">
          <button
            data-shortcut="hold"
            disabled={!draft.lines.length || pending || busy || scanning}
            title="Hold sale (F4)"
            onClick={hold}
          >
            <Pause size={16} />
            Hold
          </button>
          <button
            data-shortcut="recall"
            disabled={pending || busy || scanning}
            title="Recall sale (F6)"
            onClick={() => setOverlay("recall")}
          >
            <ClipboardList size={16} />
            Recall{state.held.length ? " (" + state.held.length + ")" : ""}
          </button>
          <button
            disabled={!draft.lines.length || pending || busy || scanning}
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
              void openCustomerDisplay(displayChannel).catch((issue) =>
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
          <button onClick={() => setOverlay("history")}>
            <History size={16} />
            Sales history
          </button>
        </div>
        <div className="identity">
          <span>
            <strong>{staff.name}</strong>
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
      <div className="register-message" aria-live="polite">
        {error ? (
          <p className="notice error" role="alert">
            {error}
            <button
              aria-label="Dismiss error"
              onClick={() => !initial.error && setError("")}
            >
              ×
            </button>
          </p>
        ) : notice ? (
          <p className="notice success">{notice}</p>
        ) : (
          <p>
            Live stock · Automatic updates every 15 seconds · Cash payments ·{" "}
            {store?.name ?? "Select your selling store"}
          </p>
        )}
      </div>
      <div className="register-columns">
        <section className="products-area" aria-labelledby="products-title">
          <div className="products-heading">
            <div>
              <span className="eyebrow">Catalogue</span>
              <h1 id="products-title">Find a fragrance</h1>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh stock"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="catalogue-tools">
            <form onSubmit={scan} className="search-box">
              <Search size={20} />
              <input
                ref={searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search products or scan barcode"
                placeholder="Scan barcode, search name or SKU…"
                maxLength={100}
                autoFocus
                autoComplete="off"
              />
              <kbd>F2</kbd>
              <button type="submit" disabled={pending}>
                Find / Add
              </button>
            </form>
            <div className="view-toggle" aria-label="Product view">
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
              {catalogue?.items.length ?? 0} variants loaded
              {catalogue?.hasMore ? " · More available" : ""}
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
                {search ? "No matching products" : "No products available"}
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
                      <span className="sr-only">Add</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue?.items.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.name}</strong>
                        <small>{product.brand || "—"}</small>
                      </td>
                      <td>
                        <span className="code">{product.sku || "—"}</span>
                        <small className="code">
                          {product.barcode || "No barcode"}
                        </small>
                      </td>
                      <td>{product.sizeMl ? product.sizeMl + " ml" : "—"}</td>
                      <td className="price">{money(product.priceMinor)}</td>
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
                          aria-label={"Add " + product.name}
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
                          <span>Add</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="product-grid">
              {catalogue?.items.map((product) => (
                <article key={product.id}>
                  <div className="product-monogram">
                    <Package size={32} />
                  </div>
                  <small>{product.brand || "Perfume"}</small>
                  <h3>{product.name}</h3>
                  <p>
                    {product.sizeMl ? product.sizeMl + " ml · " : ""}
                    {product.sku}
                  </p>
                  <strong>{money(product.priceMinor)}</strong>
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
            <span>F2 search · Repeated scans increase quantity</span>
            {catalogue?.hasMore ? (
              <button disabled={loading} onClick={() => void more()}>
                {loading ? "Loading…" : "Load more products"}
              </button>
            ) : (
              <span>{catalogue?.items.length ?? 0} variants</span>
            )}
          </footer>
        </section>
        <aside className="basket" aria-labelledby="sale-title">
          <header>
            <div>
              <span className="eyebrow">Register</span>
              <h2 id="sale-title">Current sale</h2>
            </div>
            <span className="basket-count">
              {draft.lines.reduce((sum, line) => sum + line.quantity, 0)} items
            </span>
          </header>
          {pending && (
            <p className="notice pending">
              Confirmation pending. This basket is locked until the same
              transaction is confirmed.
              <small className="code">{draft.pending?.idempotencyKey}</small>
              <button
                onClick={() => setOverlay(pending ? "payment" : "confirm")}
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
                <h3>Your sale starts here</h3>
                <p>Scan a barcode or add a fragrance from the catalogue.</p>
              </div>
            ) : (
              draft.lines.map((line) => (
                <article className="basket-line" key={line.product.id}>
                  <div className="basket-line-top">
                    <div>
                      <h3>{line.product.name}</h3>
                      <small>
                        {line.product.sizeMl
                          ? line.product.sizeMl + " ml · "
                          : ""}
                        {line.product.sku || "No SKU"}
                      </small>
                    </div>
                    <button
                      className="remove-line"
                      aria-label={"Remove " + line.product.name}
                      disabled={pending || busy}
                      onClick={() =>
                        commit({
                          ...stateRef.current,
                          draft: {
                            ...draft,
                            lines: draft.lines.filter(
                              (item) => item.product.id !== line.product.id,
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
                        aria-label={"Decrease " + line.product.name}
                        disabled={pending || busy || line.quantity === 1}
                        onClick={() =>
                          quantity(line.product.id, line.quantity - 1)
                        }
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        aria-label={"Quantity for " + line.product.name}
                        value={line.quantity}
                        type="number"
                        min={1}
                        max={Math.min(100, line.product.available)}
                        disabled={pending || busy}
                        onChange={(event) =>
                          quantity(line.product.id, Number(event.target.value))
                        }
                      />
                      <button
                        aria-label={"Increase " + line.product.name}
                        disabled={
                          pending ||
                          busy ||
                          line.quantity >= line.product.available
                        }
                        onClick={() =>
                          quantity(line.product.id, line.quantity + 1)
                        }
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <span>
                      {money(line.product.priceMinor)}
                      <strong>
                        {money(line.product.priceMinor * line.quantity)}
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
                <dd>{money(totals.subtotalMinor)}</dd>
              </div>
              {totals.discountMinor > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{money(totals.discountMinor)}</dd>
                </div>
              )}
              <div className="sale-total">
                <dt>Total</dt>
                <dd>{totalsError ? "—" : money(totals.totalMinor)}</dd>
              </div>
            </dl>
            {totalsError && (
              <p role="alert" className="field-error">
                {totalsError}
              </p>
            )}
            <button
              className="primary checkout-button"
              disabled={
                busy ||
                scanning ||
                Boolean(initial.error) ||
                (!pending && (!draft.lines.length || !draft.locationId))
              }
              onClick={() => {
                setError("");
                setOverlay(pending ? "payment" : "confirm");
              }}
            >
              <span>{pending ? "Recover payment" : "Checkout"}</span>
              <span>
                {money(totals.totalMinor)}
                <ChevronRight size={18} />
              </span>
            </button>
            <small className="checkout-note">
              F2 search · F4 hold · F6 recall · F8 calculator · F12 checkout
            </small>
          </div>
        </aside>
      </div>
      {(overlay === "confirm" || overlay === "payment") && (
        <CheckoutDialog
          step={overlay}
          count={draft.lines.reduce((sum, line) => sum + line.quantity, 0)}
          subtotal={totals.subtotalMinor}
          total={totals.totalMinor}
          discount={draft.discount}
          setDiscount={(value) =>
            commit({
              ...stateRef.current,
              draft: { ...stateRef.current.draft, discount: value },
            })
          }
          cash={cash}
          setCash={setCash}
          tendered={tendered}
          change={change}
          pendingReference={draft.pending?.idempotencyKey}
          busy={busy}
          error={error}
          totalsError={totalsError}
          close={() => !busy && setOverlay(null)}
          back={() => setOverlay("confirm")}
          next={() => setOverlay("payment")}
          pay={() => void payment()}
        />
      )}
      {overlay === "clear" && (
        <Modal title="Clear this basket?" close={() => setOverlay(null)}>
          <p>The items will be removed from this device’s current sale.</p>
          <button
            className="primary"
            onClick={() => {
              if (
                commit({
                  ...stateRef.current,
                  draft: { ...emptyDraft(), locationId: draft.locationId },
                })
              )
                setOverlay(null);
            }}
          >
            Clear basket
          </button>
        </Modal>
      )}
      {overlay === "recall" && (
        <Modal title="Held baskets" close={() => setOverlay(null)}>
          {state.held.length ? (
            state.held.map((held) => (
              <div className="held-row" key={held.id}>
                <span>
                  <strong>
                    {held.draft.lines.reduce(
                      (sum, line) => sum + line.quantity,
                      0,
                    )}{" "}
                    items
                  </strong>
                  <small>{new Date(held.createdAt).toLocaleString()}</small>
                </span>
                <button onClick={() => recall(held.id)}>Recall</button>
                <button
                  aria-label="Remove held basket"
                  onClick={() =>
                    commit({
                      ...stateRef.current,
                      held: stateRef.current.held.filter(
                        (item) => item.id !== held.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <p>No held baskets on this device.</p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {overlay === "calculator" && (
        <Modal title="Calculator" close={() => setOverlay(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                setAnswer(String(calculate(expression)));
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
                onChange={(event) => setExpression(event.target.value)}
                placeholder="Quantity × unit price, e.g. 3 × 12500"
              />
            </label>
            <button className="primary">Calculate</button>
            <output className="calculator-result">{answer || "—"}</output>
          </form>
        </Modal>
      )}
      {overlay === "history" && (
        <Modal title="Sales history" close={() => setOverlay(null)}>
          <p>Confirmed receipts from this account on this device.</p>
          {state.receipts.length ? (
            state.receipts.map((item) => (
              <button
                className="history-row"
                key={item.saleId}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const verified = await api.receipt(item.saleId);
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
                  <strong>Sale #{item.saleNumber}</strong>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </span>
                <strong>{money(item.totalMinor)}</strong>
              </button>
            ))
          ) : (
            <p>No confirmed receipts on this device yet.</p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {receipt && <Receipt receipt={receipt} close={() => setReceipt(null)} />}
    </div>
  );
}
