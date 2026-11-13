'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { MessageCircle, ShoppingBag } from 'lucide-react';
import { formatPrice, type CatalogProduct } from '@/src/lib/golden-rose/contracts';
import { MAX_BAG_LINES, MAX_QUANTITY, resolveBag, setBagQuantity, type BagLine } from '@/src/lib/customer/bag';
import { useShoppingBag } from './use-shopping-bag';
import { prepareCheckout } from '@/app/checkout/actions';
import { loadBagProducts } from '@/app/account/shopping-actions';

function CheckoutForm({ lines, profile, configured, disabled }: {
  lines: BagLine[];
  profile: { name: string; email: string | null } | null;
  configured: boolean;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<{ href: string; totalMinor: number; snapshot: string } | null>(null);
  const snapshot = JSON.stringify(lines);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled || !configured) return;
    const data = new FormData(event.currentTarget);
    data.set('bag', snapshot);
    setPending(true);
    setPrepared(null);
    setError('');
    try {
      const result = await prepareCheckout(data);
      if ('href' in result && result.href) setPrepared({ href: result.href, totalMinor: result.totalMinor, snapshot });
      else setError(result.error ?? 'The message could not be prepared.');
    } catch {
      setError('The message could not be prepared. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="gr-bag-panel" aria-labelledby="whatsapp-heading">
      <h2 id="whatsapp-heading">Checkout on WhatsApp</h2>
      <p>Golden Rose will confirm availability, final prices and delivery in the chat.</p>
      {!configured && <p role="status">The store’s WhatsApp number is not configured yet.</p>}
      <form className="gr-bag-form" onSubmit={submit} onChange={() => { setPrepared(null); setError(''); }} aria-busy={pending}>
        <fieldset disabled={pending || disabled || !configured} className="gr-bag-form">
          <label>Name<input name="name" autoComplete="name" defaultValue={profile?.name} required maxLength={120} /></label>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength={30} /></label>
          <label>Email (optional)<input name="email" type="email" autoComplete="email" defaultValue={profile?.email ?? ''} maxLength={254} /></label>
          <label>Delivery details (optional)<textarea name="delivery" rows={2} maxLength={240} /></label>
          <button type="submit" className="gr-bag-primary">{pending ? 'Checking prices…' : 'Prepare WhatsApp message'}</button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {!disabled && prepared?.snapshot === snapshot && <div className="gr-bag-prepared">
        <p role="status">Current estimated item total <strong>{formatPrice(prepared.totalMinor)}</strong></p>
        <a className="gr-bag-primary" href={prepared.href} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} aria-hidden="true" /> Open WhatsApp
        </a>
        <p>Review and send the prepared message in WhatsApp to request your order.</p>
      </div>}
    </section>
  );
}

export function ShoppingBagScreen({ checkout = false, configured = false, profile = null }: {
  checkout?: boolean;
  configured?: boolean;
  profile?: { name: string; email: string | null } | null;
}) {
  const { ready, lines, unavailable: syncUnavailable, deviceOnly, pending, update, error, retry } = useShoppingBag();
  const snapshot = ready && !syncUnavailable && lines.length ? JSON.stringify(lines) : '';
  const [request, setRequest] = useState(0);
  const key = snapshot + ':' + request;
  const [catalogue, setCatalogue] = useState<{ key: string; products: CatalogProduct[] | null }>();
  useEffect(() => {
    if (!snapshot) return;
    let current = true;
    const finish = (products: CatalogProduct[] | null) => { if (current) setCatalogue({ key, products }); };
    loadBagProducts(snapshot).then(finish, () => finish(null));
    return () => { current = false; };
  }, [key, snapshot]);
  const products = catalogue?.key === key ? catalogue.products : undefined;
  const resolved = products ? resolveBag(lines, products) : null;
  const changeQuantity = (id: string, quantity: number) => update(current => setBagQuantity(current, id, quantity), id);
  if (!ready) return <p className="gr-bag-panel" role="status">Loading your shopping bag…</p>;
  if (syncUnavailable) return <section className="gr-bag-panel" role="status">
    <p>Your shopping bag could not be synced. Items saved on this device will be kept.</p>
    <button type="button" className="gr-bag-primary" onClick={retry}>Try again</button>
  </section>;
  if (!lines.length) return (
    <section className="gr-bag-panel gr-bag-empty">
      <ShoppingBag size={28} aria-hidden="true" />
      <h2>Your bag is empty.</h2>
      {deviceOnly && <p role="status">Your bag is saved on this device. Account sync is temporarily unavailable.</p>}
      <Link href="/shop" className="gr-bag-primary">Explore fragrances</Link>
    </section>
  );
  if (products === undefined) return <p className="gr-bag-panel" role="status">Checking current prices…</p>;
  if (!resolved) return (
    <section className="gr-bag-panel" role="alert">
      <p>Product prices are temporarily unavailable. Your bag is saved.</p>
      <button type="button" className="gr-bag-primary" onClick={() => setRequest(value => value + 1)}>Try again</button>
    </section>
  );
  const { items, unavailable, totalMinor } = resolved;
  const canCheckout = items.length > 0 && lines.length <= MAX_BAG_LINES && unavailable.length === 0 && totalMinor !== null;

  return (
    <div className="gr-bag-grid">
      <section className="gr-bag-panel" aria-labelledby="bag-items" aria-busy={pending}>
        <h2 id="bag-items">Selected fragrances</h2>
        {deviceOnly && <p role="status">Your bag is saved on this device. Account sync is temporarily unavailable.</p>}
        {error && <p role="alert">{error}</p>}
        {items.map(item => <article className="gr-bag-item" key={item.variantId}>
          <div>
            <Link href={'/shop/' + encodeURIComponent(item.slug)} className="gr-bag-item-name">{item.name}</Link>
            <p>{[item.sizeMl ? item.sizeMl + ' ml' : '', item.sku].filter(Boolean).join(' · ')}</p>
            <p>{formatPrice(item.priceMinor)} each</p>
          </div>
          <div>
            <p>{formatPrice(item.priceMinor * item.quantity)}</p>
            {checkout ? <p>Quantity {item.quantity}</p> : <div className="gr-bag-quantity">
              <button type="button" disabled={pending || item.quantity <= 1} onClick={() => changeQuantity(item.variantId, item.quantity - 1)} aria-label={'Decrease quantity of ' + item.name}>−</button>
              <span aria-label="Quantity">{item.quantity}</span>
              <button type="button" disabled={pending || item.quantity >= MAX_QUANTITY} onClick={() => changeQuantity(item.variantId, item.quantity + 1)} aria-label={'Increase quantity of ' + item.name}>+</button>
              <button type="button" disabled={pending} onClick={() => changeQuantity(item.variantId, 0)} aria-label={'Remove ' + item.name}>Remove</button>
            </div>}
          </div>
        </article>)}
        {unavailable.map((item, index) => <div className="gr-bag-item" key={item.variantId}>
          <p>Unavailable selection {index + 1} · Quantity {item.quantity}</p>
          {!checkout && <button type="button" disabled={pending} onClick={() => changeQuantity(item.variantId, 0)} aria-label={'Remove unavailable selection ' + (index + 1)}>Remove</button>}
        </div>)}
        <p className="gr-bag-total"><span>Estimated item total</span><strong>{totalMinor !== null ? formatPrice(totalMinor) : 'Unavailable'}</strong></p>
        {unavailable.length > 0 && <p role="status">Remove unavailable items from your bag to continue.</p>}
        {lines.length > MAX_BAG_LINES && <p role="status">Reduce your bag to {MAX_BAG_LINES} fragrances to continue.</p>}
        {checkout ? <Link href="/cart" className="text-link">Edit shopping bag</Link> :
          canCheckout && <Link href="/checkout" className="gr-bag-primary">Continue to WhatsApp checkout</Link>}
      </section>
      {checkout && <CheckoutForm lines={lines} profile={profile} configured={configured} disabled={!canCheckout} />}
    </div>
  );
}
