'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle, ArrowRight, Banknote, Calculator, Check, CheckCircle2, ChevronDown,
  Clock3, CreditCard, Keyboard, Minus, Package, Plus, Printer, ReceiptText,
  RefreshCw, ScanBarcode, Search, ShoppingBag, Trash2, X,
} from 'lucide-react';
import { loadRegisterProducts, recordCashSale } from './actions';
import type { CashSaleRequest, RegisterCatalog, RegisterProduct, RegisterReceipt } from './types';
import type { StaffRole } from '@/src/lib/golden-rose/contracts';

type SaleLine = { product: RegisterProduct; quantity: number };
type Notice = { kind: 'error' | 'success' | 'info'; message: string };

const fmt = new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const money = (minor: number) => fmt.format(minor / 100);

function parseNaira(text: string): number | null {
  const v = text.replace(/,/g, '').trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(v)) return null;
  const [whole, fraction = ''] = v.split('.');
  const total = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(total) ? total : null;
}

function photograph(path: string): string {
  return 'https://eixbmsethgrtezhdmgsh.supabase.co/storage/v1/object/public/golden-rose-products/' +
    path.split('/').map(encodeURIComponent).join('/');
}

function ProductPhoto({ product }: { product: RegisterProduct }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="grpos-photo">
      {product.imagePath && !broken ? (
        <Image src={photograph(product.imagePath)} fill unoptimized alt="" sizes="(max-width: 800px) 70px, 108px"
          onError={() => setBroken(true)} />
      ) : (
        <span className="grpos-photo-fallback" aria-hidden="true"><span>GR</span></span>
      )}
    </span>
  );
}

function CalculatorPanel({ onClose, onUse }: { onClose: () => void; onUse: (amount: string) => void }) {
  const [screen, setScreen] = useState('0');
  const [base, setBase] = useState<number | null>(null);
  const [op, setOp] = useState<'+' | '−' | '×' | '÷' | null>(null);
  const [fresh, setFresh] = useState(false);

  function calculate(left: number, right: number, operator: string) {
    return operator === '+' ? left + right : operator === '−' ? left - right
      : operator === '×' ? left * right : right === 0 ? NaN : left / right;
  }

  function press(key: string) {
    if (key === 'C') { setScreen('0'); setBase(null); setOp(null); setFresh(false); return; }
    if (key === '⌫') { setScreen(value => value.length > 1 ? value.slice(0, -1) : '0'); return; }
    if (key === '+' || key === '−' || key === '×' || key === '÷') {
      const value = Number(screen);
      if (op && base !== null && !fresh) {
        const computed = calculate(base, value, op);
        setBase(Number.isFinite(computed) ? computed : null);
        setScreen(Number.isFinite(computed) ? String(+computed.toFixed(2)) : 'Error');
      } else setBase(value);
      setOp(key); setFresh(true); return;
    }
    if (key === '=') {
      if (op && base !== null) {
        const value = calculate(base, Number(screen), op);
        setScreen(Number.isFinite(value) ? String(+value.toFixed(2)) : 'Error');
      }
      setBase(null); setOp(null); setFresh(true); return;
    }
    if (key === '.' && !fresh && screen.includes('.')) return;
    setScreen(current => {
      if (fresh || current === 'Error') return key === '.' ? '0.' : key;
      if (current.replace(/[^0-9]/g, '').length >= 12) return current;
      return current === '0' && key !== '.' ? key : current + key;
    });
    setFresh(false);
  }

  const keys = ['C', '⌫', '÷', '×', '7', '8', '9', '−', '4', '5', '6', '+', '1', '2', '3', '=', '0', '00', '.'];
  return (
    <div className="grpos-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="grpos-calculator" role="dialog" aria-modal="true" aria-labelledby="grpos-calculator-title">
        <header className="grpos-dialog-head"><div><span className="grpos-overline">WORKSPACE TOOL</span><h2 id="grpos-calculator-title">Calculator</h2></div>
          <button className="grpos-icon" aria-label="Close calculator" onClick={onClose}><X size={19} /></button>
        </header>
        <output className="grpos-calc-screen" aria-live="polite">{screen}</output>
        <div className="grpos-calc-keys">
          {keys.map(key => <button key={key} type="button" className={key === '=' ? 'grpos-calc-equal' : ''} onClick={() => press(key)}>{key}</button>)}
        </div>
        <button className="grpos-primary grpos-full" type="button" disabled={parseNaira(screen) === null}
          onClick={() => { onUse(screen); onClose(); }}>Use amount as cash received</button>
        <p className="grpos-helper">A standalone arithmetic tool. Calculations never alter recorded sales.</p>
      </section>
    </div>
  );
}

function ReceiptDialog({ receipt, onClose }: { receipt: RegisterReceipt; onClose: () => void }) {
  return (
    <div className="grpos-overlay" role="presentation">
      <section className="grpos-receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="grpos-receipt-title">
        <div className="grpos-dialog-head grpos-print-hide">
          <div><span className="grpos-overline">TRANSACTION RECORDED</span><h2>Cash sale completed</h2></div>
          <button className="grpos-icon" onClick={onClose} aria-label="Close receipt"><X size={19} /></button>
        </div>
        <div className="grpos-receipt-paper" id="grpos-print-receipt">
          <div className="grpos-receipt-brand"><strong>GOLDEN ROSE</strong><span>BEAUTY OF FRAGRANCE</span></div>
          <h2 id="grpos-receipt-title">Sales receipt</h2>
          <div className="grpos-receipt-meta">
            <span>Receipt</span><strong>GR-{String(receipt.saleNumber).padStart(7,'0')}</strong>
            <span>Date</span><span>{new Date(receipt.createdAt).toLocaleString('en-NG')}</span>
            <span>Location</span><span>{receipt.locationName}</span>
            <span>Payment</span><span>Cash</span>
          </div>
          <div className="grpos-receipt-items">
            {receipt.items.map((item,index) => (
              <div key={index}><div><strong>{item.name}</strong>
                <small>{[item.sku, item.sizeMl ? item.sizeMl + ' ml' : null].filter(Boolean).join(' · ')} · {item.quantity} × {money(item.unitPriceMinor)}</small></div>
                <strong>{money(item.lineTotalMinor)}</strong></div>
            ))}
          </div>
          <div className="grpos-receipt-totals">
            <div><span>Subtotal</span><span>{money(receipt.subtotalMinor)}</span></div>
            <div><span>Discount</span><span>−{money(receipt.discountMinor)}</span></div>
            <div><span>Tax</span><span>{money(receipt.taxMinor)}</span></div>
            <div className="grpos-receipt-total"><strong>Total</strong><strong>{money(receipt.totalMinor)}</strong></div>
            <div><span>Cash received</span><span>{money(receipt.tenderedMinor)}</span></div>
            <div><strong>Change</strong><strong>{money(receipt.changeMinor)}</strong></div>
          </div>
          <footer>Thank you for shopping with Golden Rose Perfume.</footer>
        </div>
        <div className="grpos-receipt-actions grpos-print-hide">
          <button className="grpos-primary" onClick={() => window.print()}><Printer size={17} /> Print receipt</button>
          <button className="grpos-secondary" onClick={onClose}>New sale <ArrowRight size={16} /></button>
        </div>
      </section>
    </div>
  );
}

export function PosRegister({ initial, initialError, role }: {
  initial: RegisterCatalog; initialError: string | null; role: StaffRole;
}) {
  const [catalog, setCatalog] = useState(initial);
  const [locationId, setLocationId] = useState(initial.selectedLocationId ?? '');
  const [search, setSearch] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [discountText, setDiscountText] = useState('0');
  const [tenderText, setTenderText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(initialError ? { kind:'error', message: initialError } : null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [receipt, setReceipt] = useState<RegisterReceipt | null>(null);
  const [pendingRequest, setPendingRequest] = useState<CashSaleRequest | null>(null);
  const [mobileCart, setMobileCart] = useState(false);
  const sequence = useRef(0);
  const scan = useRef<HTMLInputElement>(null);

  const locked = processing || pendingRequest !== null;
  const subtotal = lines.reduce((sum, line) => sum + line.product.priceMinor * line.quantity, 0);
  const discountMinor = parseNaira(discountText);
  const tenderedMinor = parseNaira(tenderText);
  const maxDiscountPercent = role === 'owner' || role === 'manager' ? 30 : 10;
  const discountValid = discountMinor !== null && discountMinor >= 0 &&
    discountMinor <= Math.floor(subtotal * maxDiscountPercent / 100);
  const total = Math.max(0, subtotal - (discountValid ? discountMinor! : 0));
  const change = tenderedMinor === null ? null : Math.max(0, tenderedMinor - total);
  const canSubmit = !!locationId && lines.length > 0 && discountValid &&
    tenderedMinor !== null && tenderedMinor >= total && !locked;
  const visibleProducts = stockOnly ? catalog.items.filter(item => item.available > 0) : catalog.items;

  // A failed/unknown network response may still have committed. Retain its ID on reload.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('grpos-pending-checkout');
      if (!stored) return;
      const saved = JSON.parse(stored) as CashSaleRequest;
      if (saved && typeof saved === 'object' &&
        /^[0-9a-f-]{36}$/i.test(saved.idempotencyKey) && Array.isArray(saved.items)) {
        setPendingRequest(saved);
        setNotice({ kind:'info', message:'An earlier sale has an unconfirmed response. Retry its original reference before starting another sale.' });
      }
    } catch { /* Ignore invalid stale session state. */ }
  }, []);

  // Server-side search supports very large catalogues and ordinary USB barcode scanners.
  useEffect(() => {
    const current = ++sequence.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const next = await loadRegisterProducts(search, locationId || null, 0);
        if (current !== sequence.current) return;
        setCatalog(next);
        if (!locationId && next.selectedLocationId) setLocationId(next.selectedLocationId);
      } catch (cause) {
        if (current === sequence.current) setNotice({ kind:'error', message:cause instanceof Error ? cause.message : 'Could not search products.' });
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    }, 260);
    return () => { window.clearTimeout(timer); sequence.current++; };
  }, [search, locationId]);

  useEffect(() => {
    if (!notice || notice.kind === 'info') return;
    const timer = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function addProduct(product: RegisterProduct) {
    if (locked || product.available <= 0) return;
    if (lines.length >= 40 && !lines.some(line => line.product.id === product.id)) {
      setNotice({kind:'error',message:'A sale can contain up to 40 distinct fragrances.'});
      return;
    }
    setLines(previous => {
      const existing = previous.find(line => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= Math.min(100, product.available)) return previous;
        return previous.map(line => line.product.id === product.id ? { ...line, quantity:line.quantity + 1 } : line);
      }
      if (previous.length >= 40) return previous;
      return [...previous,{ product, quantity:1 }];
    });
  }

  function changeQuantity(id:string, by:number) {
    if (locked) return;
    setLines(previous => previous.flatMap(line => {
      if (line.product.id !== id) return [line];
      const next = line.quantity + by;
      if (next <= 0) return [];
      return [{ ...line, quantity:Math.min(100,line.product.available,next) }];
    }));
  }

  function changeLocation(id:string) {
    if (locked || lines.length) return;
    setLocationId(id);
    setSearch('');
  }

  async function loadMore() {
    if (loadingMore || !catalog.hasMore || !locationId) return;
    setLoadingMore(true);
    try {
      const next = await loadRegisterProducts(search, locationId, catalog.items.length);
      setCatalog(current => ({
        ...next,
        items:[...current.items,...next.items.filter(item => !current.items.some(old => old.id === item.id))],
      }));
    } catch (cause) {
      setNotice({kind:'error',message:cause instanceof Error ? cause.message : 'More products could not be loaded.'});
    } finally { setLoadingMore(false); }
  }

  async function scanEnter(event:KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || !search.trim()) return;
    event.preventDefault();
    const code = search.trim().toLowerCase();
    try {
      const next = await loadRegisterProducts(code,locationId || null,0);
      const found = next.items.find(item =>
        item.barcode?.toLowerCase() === code || item.sku?.toLowerCase() === code);
      if (found && found.available > 0) {
        addProduct(found);
        setSearch('');
        setNotice({kind:'success',message:found.name + ' added to the sale.'});
      } else if (!found) setNotice({kind:'info',message:'No exact SKU or barcode match. Browse the search results.'});
      else setNotice({kind:'error',message:'This item is out of stock at the selected store.'});
    } catch (cause) { setNotice({kind:'error',message:cause instanceof Error ? cause.message : 'Barcode lookup failed.'}); }
  }

  async function checkout(requestToRetry?:CashSaleRequest) {
    const request = requestToRetry ?? ({
      idempotencyKey:crypto.randomUUID(),
      locationId, method:'cash',
      items:lines.map(line => ({ variantId:line.product.id,quantity:line.quantity,
        expectedPriceMinor:line.product.priceMinor })),
      discountMinor:discountMinor ?? 0, tenderedMinor:tenderedMinor ?? 0,
    } satisfies CashSaleRequest);
    if (!requestToRetry && !canSubmit) return;
    setProcessing(true);
    setPendingRequest(request);
    setNotice(null);
    window.sessionStorage.setItem('grpos-pending-checkout',JSON.stringify(request));
    try {
      const confirmed = await recordCashSale(request);
      window.sessionStorage.removeItem('grpos-pending-checkout');
      setPendingRequest(null);
      setLines([]);
      setDiscountText('0');
      setTenderText('');
      setReceipt(confirmed);
      setMobileCart(false);
      setNotice({kind:'success',message:'Cash sale saved and inventory updated.'});
      try {
        setCatalog(await loadRegisterProducts(search,locationId || null,0));
      } catch { /* Checkout is confirmed; stock refresh can be retried separately. */ }
    } catch (cause) {
      setNotice({kind:'error',message:cause instanceof Error ? cause.message : 'The sale could not be confirmed.'});
    } finally { setProcessing(false); }
  }

  function discardPending() {
    if (!window.confirm('Only discard after checking whether this sale was recorded. An unconfirmed cash sale may already exist. Continue?')) return;
    window.sessionStorage.removeItem('grpos-pending-checkout');
    setPendingRequest(null);
    setNotice({kind:'info',message:'Pending reference discarded. Check the sales ledger before repeating an uncertain sale.'});
  }

  return (
    <div className="grpos">
      {notice && <div className={'grpos-toast grpos-toast--'+notice.kind} role={notice.kind==='error'?'alert':'status'}>
        {notice.kind==='error'?<AlertCircle size={19}/>:notice.kind==='success'?<CheckCircle2 size={19}/>:<Clock3 size={19}/>}
        <p>{notice.message}</p><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17}/></button>
      </div>}

      <header className="grpos-heading">
        <div><p className="grpos-overline">RETAIL OPERATIONS / IN-STORE</p>
          <h1>Point of Sale<span className="grpos-title-dot">.</span></h1>
          <p>One refined checkout experience for every Golden Rose counter.</p>
        </div>
        <div className="grpos-heading-actions">
          <span className="grpos-register-status"><span/> Cash register</span>
          <button className="grpos-secondary" type="button" onClick={() => setCalculatorOpen(true)}>
            <Calculator size={18}/> Calculator
          </button>
          <button className="grpos-secondary" type="button" disabled={locked || !lines.length}
            onClick={() => { setLines([]);setDiscountText('0');setTenderText(''); }}>
            <RefreshCw size={17}/> New sale
          </button>
        </div>
      </header>

      <div className="grpos-bar">
        <div className="grpos-location">
          <label htmlFor="grpos-location">Selling location</label>
          <div className="grpos-select-wrap">
            <select id="grpos-location" value={locationId} disabled={locked || !!lines.length}
              onChange={event => changeLocation(event.target.value)}>
              {!locationId && <option value="">Choose a store</option>}
              {catalog.locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}
            </select><ChevronDown size={16} aria-hidden="true"/>
          </div>
        </div>
        <div className="grpos-bar-summary">
          <span><ScanBarcode size={16}/> Barcode & SKU ready</span>
          <span><CheckCircle2 size={16}/> Server-verified prices</span>
          <span><ReceiptText size={16}/> Audited cash receipts</span>
        </div>
      </div>

      {!locationId && <div className="grpos-alert"><AlertCircle size={20}/><div><strong>Set up your first store register</strong>
        <p>A live store location is required before any POS sale can be recorded.</p></div>
        <Link href="/workspace/inventory">Manage locations <ArrowRight size={15}/></Link></div>}

      {pendingRequest && <section className="grpos-pending" aria-label="Pending sale confirmation">
        <AlertCircle size={19}/><div><strong>A sale is awaiting confirmation</strong>
          <p>Do not create a second checkout. Retry the same reference to retrieve the receipt if the sale was already recorded.</p>
          <small>Transaction {pendingRequest.idempotencyKey.slice(0,8)}…</small>
        </div><div className="grpos-pending-actions">
          <button className="grpos-primary" type="button" disabled={processing} onClick={() => checkout(pendingRequest)}>
            {processing?'Checking…':'Retry same sale'}</button>
          <button className="grpos-link-button" onClick={discardPending} disabled={processing}>Discard after checking</button>
        </div>
      </section>}

      <div className="grpos-layout">
        <section className="grpos-products" aria-label="Product catalogue">
          <div className="grpos-card-heading">
            <div><p className="grpos-overline">THE GOLDEN ROSE COLLECTION</p><h2>Find a fragrance</h2></div>
            <span className="grpos-count">{catalog.items.length} shown</span>
          </div>
          <div className="grpos-searchline">
            <label className="grpos-searchbox"><Search size={19} aria-hidden="true"/>
              <input ref={scan} type="search" value={search} placeholder="Search product, SKU or scan barcode"
                onChange={event => setSearch(event.target.value)} onKeyDown={scanEnter} aria-label="Search products or scan a barcode"
                disabled={!locationId}/>
              {loading?<span className="grpos-loading">Searching</span>:<span className="grpos-scan-symbol"><ScanBarcode size={21}/></span>}
            </label>
            <button className="grpos-secondary grpos-refresh" type="button" aria-label="Refresh products"
              onClick={() => { setSearch('');loadRegisterProducts('',locationId || null,0).then(setCatalog).catch(e => setNotice({kind:'error',message:e.message})); }}>
              <RefreshCw size={19}/>
            </button>
          </div>
          <div className="grpos-filters">
            <div className="grpos-segments" role="group" aria-label="Stock filter">
              <button type="button" className={!stockOnly?'active':''} aria-pressed={!stockOnly} onClick={() => setStockOnly(false)}>All fragrances</button>
              <button type="button" className={stockOnly?'active':''} aria-pressed={stockOnly} onClick={() => setStockOnly(true)}>In stock</button>
            </div>
            <span className="grpos-key-hint"><Keyboard size={14}/> Enter to add scanned items</span>
          </div>

          {!visibleProducts.length ? <div className="grpos-empty">
            <div className="grpos-empty-visual"><Package size={29}/></div>
            <h3>{!locationId ? 'Choose a selling location' : search ? 'No matching fragrances' : stockOnly ? 'Nothing in stock yet' : 'Your product collection starts here'}</h3>
            <p>{!locationId ? 'Select a store to load the correct prices and available stock.'
              : search ? 'Check the barcode, SKU or fragrance name and search again.'
                : stockOnly ? 'Receive stock at this store to make perfumes sellable.'
                  : 'Import your existing catalogue in Data Management. Products and inventory will appear here automatically.'}</p>
            {!search && locationId && <Link href="/workspace/migration">Open Data Management <ArrowRight size={16}/></Link>}
          </div> : <div className="grpos-product-grid">
            {visibleProducts.map(product => {
              const reserved = lines.find(line=>line.product.id===product.id)?.quantity??0;
              const out = product.available<=reserved;
              return <article key={product.id} className="grpos-product">
                <ProductPhoto product={product}/>
                <div className="grpos-product-info">
                  <p className="grpos-product-brand">{product.brand || 'GOLDEN ROSE COLLECTION'}</p>
                  <h3 title={product.name}>{product.name}</h3>
                  <p className="grpos-product-details">{product.sizeMl ? product.sizeMl+' ml' : 'Fragrance'} · {product.sku || 'No SKU'}</p>
                  <div className="grpos-product-bottom">
                    <strong>{money(product.priceMinor)}</strong>
                    <span className={product.available>0?'grpos-stock':'grpos-stock grpos-stock--out'}>{product.available>0?product.available+' available':'Out of stock'}</span>
                  </div>
                  <button type="button" className="grpos-add" disabled={out||locked} onClick={() => addProduct(product)}
                    aria-label={'Add '+product.name+' to sale'}>{out?'Unavailable':<><Plus size={15}/> Add to sale</>}</button>
                </div>
              </article>;
            })}
          </div>}

          {catalog.hasMore && <button className="grpos-load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore?'Loading fragrances…':'Load more fragrances'} <ArrowRight size={16}/></button>}
          <p className="grpos-catalog-footer">Displayed prices and available stock come from the Golden Rose cloud database.</p>
        </section>

        <aside className={'grpos-basket '+(mobileCart?'grpos-basket--mobile':'')} aria-label="Current sale basket">
          <div className="grpos-basket-header">
            <div><span className="grpos-overline">COUNTER CHECKOUT</span><h2>Current sale</h2></div>
            <span className="grpos-basket-count">{lines.reduce((n,line)=>n+line.quantity,0)} items</span>
          </div>
          <div className="grpos-basket-body">
            {!lines.length ? <div className="grpos-cart-empty"><span><ShoppingBag size={31}/></span>
              <h3>Ready for your first item</h3><p>Scan a barcode or add a fragrance from the collection to begin.</p></div>
            : <div className="grpos-cart-lines">
              {lines.map(line => <div className="grpos-cart-line" key={line.product.id}>
                <span className="grpos-cart-thumb"><ProductPhoto product={line.product}/></span>
                <div className="grpos-cart-line-body">
                  <div className="grpos-cart-line-top"><div><strong>{line.product.name}</strong>
                    <small>{line.product.sizeMl?line.product.sizeMl+' ml · ':''}{line.product.sku||'No SKU'}</small></div>
                    <button className="grpos-icon grpos-remove" aria-label={'Remove '+line.product.name} disabled={locked}
                      onClick={() => setLines(prev=>prev.filter(item=>item.product.id!==line.product.id))}><Trash2 size={16}/></button></div>
                  <div className="grpos-cart-line-bottom">
                    <div className="grpos-qty"><button disabled={locked} onClick={()=>changeQuantity(line.product.id,-1)} aria-label="Decrease quantity"><Minus size={14}/></button>
                      <span>{line.quantity}</span><button disabled={locked||line.quantity>=line.product.available} onClick={()=>changeQuantity(line.product.id,1)} aria-label="Increase quantity"><Plus size={14}/></button></div>
                    <strong>{money(line.product.priceMinor*line.quantity)}</strong>
                  </div>
                </div>
              </div>)}
            </div>}
          </div>

          <div className="grpos-checkout">
            <div className="grpos-price-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <label className="grpos-discount"><span>Discount <small>Max {maxDiscountPercent}%</small></span>
              <span className="grpos-currency-input"><span>₦</span><input type="text" inputMode="decimal" value={discountText}
                disabled={locked||!lines.length} onChange={event=>setDiscountText(event.target.value)} aria-label="Discount in naira"/></span>
            </label>
            {!discountValid && lines.length>0 && <p className="grpos-field-error">Discount exceeds the authorized limit or is invalid.</p>}
            <div className="grpos-tax"><span>Tax</span><span>Not configured</span></div>
            <div className="grpos-total"><div><span>Amount due</span><strong>{money(total)}</strong></div><small>NGN · Amount rechecked at confirmation</small></div>
            <div className="grpos-methods"><span className="grpos-overline">PAYMENT METHOD</span>
              <div className="grpos-method-row"><button type="button" className="grpos-method active"><Banknote size={18}/> Cash <Check size={16}/></button>
                <button type="button" className="grpos-method" disabled title="Bank transfer verification is not connected"><CreditCard size={18}/> Transfer</button>
              </div>
              <p>Transfer and card checkout will be enabled after payment reconciliation is connected.</p>
            </div>
            <label className="grpos-tender"><span>Cash received</span>
              <span className="grpos-currency-input grpos-tender-input"><span>₦</span><input type="text" inputMode="decimal" placeholder="0.00" value={tenderText}
                onChange={event=>setTenderText(event.target.value)} disabled={locked||!lines.length}/></span>
            </label>
            <div className="grpos-cash-shortcuts">
              <button type="button" disabled={locked||!lines.length} onClick={()=>setTenderText((total/100).toFixed(2))}>Exact cash</button>
              <button type="button" disabled={locked} onClick={()=>setCalculatorOpen(true)}><Calculator size={13}/> Calculator</button>
            </div>
            <div className="grpos-change"><span>Change to return</span><strong>{change===null?'—':money(change)}</strong></div>
            {tenderedMinor!==null && tenderedMinor<total && <p className="grpos-field-error">Cash received is less than the amount due.</p>}
            <button type="button" className="grpos-primary grpos-checkout-button" disabled={!canSubmit} onClick={()=>checkout()}>
              {processing?'Recording sale…':<><ReceiptText size={19}/> Complete cash sale <ArrowRight size={18}/></>}
            </button>
            <p className="grpos-secure-note"><CheckCircle2 size={14}/> Only a confirmed sale deducts inventory and creates a receipt.</p>
          </div>
        </aside>
      </div>

      <button className="grpos-mobile-basket-toggle" type="button" onClick={()=>setMobileCart(value=>!value)}>
        <ShoppingBag size={19}/>{mobileCart?'View fragrances':'View current sale'} <strong>{money(total)}</strong>
      </button>
      {calculatorOpen && <CalculatorPanel onClose={()=>setCalculatorOpen(false)} onUse={amount=>setTenderText(amount)} />}
      {receipt && <ReceiptDialog receipt={receipt} onClose={()=>setReceipt(null)}/>}
    </div>
  );
}
