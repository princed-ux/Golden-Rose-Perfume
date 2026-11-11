'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bell, ChevronRight, Headphones, Heart, House, MapPin, Package, ReceiptText, RotateCcw, Search, Settings2, ShoppingBag, Truck, UserRound } from 'lucide-react';
import OrderTrackingTimeline from '@/src/components/order-tracking-timeline';
import type { CustomerDashboardData, CustomerOrderStatus, WishlistItem } from '@/src/domain/customer';
import { ORDER_STATUS_LABELS } from '@/src/domain/customer';
import { getCustomerDashboard, formatCustomerDate } from '@/src/lib/customer-data';
import { formatNaira } from '@/src/lib/demo-data';
import './page.css';

const navigation = [
  { label: 'Overview', id: 'overview', Icon: House },
  { label: 'My orders', id: 'orders', Icon: Package },
  { label: 'Track order', id: 'tracking', Icon: Truck },
  { label: 'Wishlist', id: 'favourites', Icon: Heart },
  { label: 'Addresses', id: 'addresses', Icon: MapPin },
  { label: 'Profile', id: 'profile', Icon: UserRound },
  { label: 'Support', id: 'support', Icon: Headphones },
];
const panel = 'gr-account-panel rounded-xl p-5 sm:p-6';

function OrderBadge({ status }: { status: CustomerOrderStatus }) {
  return <span className="gr-order-badge" data-status={status}>{status === 'delivered' ? <Package size={12} aria-hidden="true" /> : <Truck size={12} aria-hidden="true" />}{ORDER_STATUS_LABELS[status]}</span>;
}

export default function CustomerDashboard() {
  const [data, setData] = useState<CustomerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [activeOrderId, setActiveOrderId] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    getCustomerDashboard().then(result => {
      if (!mounted) return;
      setData(result); setWishlist(result.wishlist);
      setActiveOrderId(result.orders.find(order => !['delivered', 'cancelled', 'returned'].includes(order.status))?.id ?? result.orders[0]?.id ?? '');
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setError('Your account preview could not be loaded. Please try again.'); setLoading(false);
    });
    return () => { mounted = false; };
  }, [reloadKey]);

  function retry() { setError(''); setLoading(true); setReloadKey(value => value + 1); }
  function removeFavourite(id: string) {
    setWishlist(items => items.filter(item => item.id !== id));
    setNotice('Removed from this preview only. Nothing was saved to an account.');
  }
  const selectedOrder = data?.orders.find(order => order.id === activeOrderId) ?? data?.orders[0];
  const activeOrders = data?.orders.filter(order => !['delivered', 'cancelled', 'returned'].includes(order.status)).length ?? 0;

  return (
    <div id="overview" className="gr-customer-dashboard min-h-screen pb-20" data-dashboard-state={loading ? 'loading' : error ? 'error' : 'ready'}>
      <header className="gr-account-header">
        <div className="mx-auto flex min-h-20 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-9">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Golden Rose Perfume homepage">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#b89554]/60 bg-black p-1"><Image src="/assets/brand/golden-rose-logo.png" alt="" width={42} height={46} className="h-full w-auto object-contain" /></span>
            <span className="gr-account-wordmark flex min-w-0 flex-col gap-1 font-serif text-[15px] tracking-[.1em] sm:text-xl">GOLDEN ROSE<small className="font-sans text-[7px] tracking-[.23em]">BEAUTY OF FRAGRANCE</small></span>
          </Link>
          <Link href="/shop" className="gr-account-search hidden max-w-sm flex-1 items-center gap-3 rounded-lg px-4 py-3 text-xs md:flex"><Search size={16} aria-hidden="true" /><span>Discover fragrances & collections</span><ArrowUpRight size={14} className="ml-auto" aria-hidden="true" /></Link>
          <nav aria-label="Store navigation" className="flex shrink-0 items-center gap-5 sm:gap-7">
            <Link href="/shop" className="flex min-h-11 items-center gap-2 text-xs"><ShoppingBag size={18} aria-hidden="true" /><span className="hidden sm:inline">Shop</span></Link>
            <a href="#profile" onClick={() => setActiveSection('profile')} className="hidden min-h-11 items-center gap-2 text-xs sm:flex"><UserRound size={18} aria-hidden="true" />Account</a>
            <Link href="/cart" aria-label="View cart preview" className="flex min-h-11 items-center gap-2 text-xs"><ShoppingBag size={18} aria-hidden="true" /><span className="hidden sm:inline">Cart</span></Link>
          </nav>
        </div>
      </header>
      <div className="gr-account-preview px-4 py-2 text-center text-[9px] tracking-[.12em]">CUSTOMER PREVIEW · Fictional orders & wishlist · No signed-in account or live tracking</div>
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="gr-account-sidebar relative flex min-w-0 flex-col px-3 py-3 lg:px-4 lg:pt-7">
          <div className="hidden px-3 lg:block"><h2 className="font-serif text-2xl">My Account</h2><span className="gr-account-rule mt-4 mb-6 block h-px w-9" /></div>
          <nav aria-label="Customer dashboard navigation" className="relative z-10 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {navigation.map(({ label, id, Icon }) => <a key={id} href={'#' + id} onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'location' : undefined} className="gr-account-nav-link flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-xs transition-colors"><Icon size={18} strokeWidth={1.4} aria-hidden="true" />{label}</a>)}
          </nav>
          <div className="gr-sidebar-botanical pointer-events-none mt-auto hidden select-none pt-12 lg:block" aria-hidden="true"><div className="gr-dashboard-rose" /><p className="relative pb-3 text-center font-serif text-xs italic tracking-wide">Beauty in every detail.</p></div>
        </aside>
        <main className="min-w-0 px-4 pt-6 sm:px-6 lg:px-7 lg:pt-7 xl:px-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div className="flex flex-col gap-2"><h1 className="font-serif text-3xl tracking-tight sm:text-[34px]">Welcome back<span className="gr-account-gold">.</span></h1><p className="gr-account-muted text-xs leading-6">Your fragrances, your orders, your little luxuries.</p></div><span className="gr-account-muted text-[10px]">{data ? `${activeOrders} active example · ${data.orders.length} sample orders` : 'Your personal fragrance space'}</span></header>
          {loading ? <section aria-label="Loading customer dashboard" aria-busy="true" className={panel}><div className="flex flex-col gap-5"><span className="gr-account-soft h-52 rounded-lg motion-safe:animate-pulse" /><p role="status" className="gr-account-muted text-sm">Preparing your customer preview…</p></div></section> : error ? <section role="alert" className={panel}><h2 className="font-serif text-2xl">We could not open your preview.</h2><p className="gr-account-muted py-4 text-sm leading-7">{error}</p><button type="button" onClick={retry} className="gr-account-button px-5">Try again</button></section> : data && <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_290px] 2xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="flex min-w-0 flex-col gap-5">
              <section id="tracking" className={`${panel} gr-account-active scroll-mt-5`}>
                {selectedOrder ? <>
                  <div className="flex flex-col gap-5 sm:flex-row">
                    <Link href={`/shop/${selectedOrder.items[0]?.productId ?? ''}`} className="gr-active-order-image relative block h-40 w-full shrink-0 overflow-hidden rounded-lg sm:h-40 sm:w-36" aria-label="Browse the fragrance from this sample order"><Image src={selectedOrder.items[0]?.image ?? '/assets/hero/hero-01.png'} alt={selectedOrder.items[0]?.imageAlt ?? 'Illustrative Golden Rose campaign'} fill preload sizes="(max-width:640px) 100vw, 144px" className="object-cover object-[78%_center]" /></Link>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-2"><div className="flex w-full flex-wrap items-center justify-between gap-2"><p className="gr-account-gold text-[10px] font-semibold tracking-[.12em] uppercase">Order journey</p><OrderBadge status={selectedOrder.status} /></div><p className="gr-account-muted text-xs">{selectedOrder.reference} · Sample order</p><h2 className="mt-1 flex items-center gap-3 font-serif text-[28px] leading-tight"><Truck size={25} strokeWidth={1.3} className="gr-account-gold shrink-0" aria-hidden="true" />{ORDER_STATUS_LABELS[selectedOrder.status]}</h2><p className="gr-account-muted text-[11px] leading-6">{selectedOrder.items.map(item => item.name).join(' & ')}</p><p className="gr-account-muted text-[11px]">Placed {formatCustomerDate(selectedOrder.placedAt)}</p><div className="mt-auto flex w-full flex-wrap items-center justify-between gap-2 pt-2"><strong className="font-serif text-lg">{formatNaira(selectedOrder.totalMinor)}</strong><a href="#order-detail" onClick={() => setActiveSection('tracking')} className="gr-account-text-link inline-flex min-h-11 items-center gap-2 text-[11px]">Order details <ArrowRight size={14} aria-hidden="true" /></a></div></div>
                  </div>
                  <div className="gr-account-divider mt-5 border-t pt-5"><OrderTrackingTimeline status={selectedOrder.status} events={selectedOrder.trackingEvents} /></div>
                  <details id="order-detail" className="gr-order-detail mt-4 scroll-mt-5 rounded-lg p-3 text-xs"><summary className="gr-account-gold min-h-6 cursor-pointer">Items & tracking updates</summary><div className="mt-4 flex flex-col gap-4">{selectedOrder.items.map(item => <Link key={item.id} href={`/shop/${item.productId}`} className="flex items-center justify-between gap-3 text-[11px]"><span>{item.name} · {item.variant} · Qty {item.quantity}</span><span>{formatNaira(item.unitPriceMinor)}</span></Link>)}<ul className="gr-account-muted flex flex-col gap-2 border-t border-[var(--account-border)] pt-3">{selectedOrder.trackingEvents.map(event => <li key={event.status} className="text-[10px] leading-5">{formatCustomerDate(event.occurredAt)} · {event.description}</li>)}</ul><button type="button" disabled className="gr-account-outline self-start px-4">Reorder · Preview</button></div></details>
                </> : <div className="flex flex-col items-start gap-4"><h2 className="font-serif text-2xl">Your next fragrance awaits.</h2><p className="gr-account-muted text-xs leading-6">Tracking will appear when you have an order.</p><Link href="/shop" className="gr-account-text-link text-xs">Explore the collection →</Link></div>}
              </section>
              <section id="favourites" className={`${panel} scroll-mt-5`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-xl">Saved fragrances</h2><Link href="/shop" className="gr-account-text-link inline-flex min-h-9 items-center gap-2 text-[10px]">Discover more <ArrowRight size={13} aria-hidden="true" /></Link></div>
                {notice && <p role="status" className="gr-account-muted mb-3 text-[10px] leading-5">{notice}</p>}
                {wishlist.length ? <div className="grid min-w-0 grid-cols-1 gap-4 min-[440px]:grid-cols-2 md:grid-cols-3">{wishlist.map(item => <article key={item.id} className="group flex min-w-0 flex-col"><div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#1d1711]"><Link href={`/shop/${item.productId}`} className="absolute inset-0"><Image src={item.image} alt={item.imageAlt} fill sizes="(max-width:440px) 100vw, (max-width:768px) 45vw, 250px" className="object-cover object-[80%_center] transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none" /></Link><button type="button" onClick={() => removeFavourite(item.id)} aria-label={`Remove ${item.name} from preview favourites`} className="gr-wishlist-heart absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full"><Heart size={17} fill="currentColor" strokeWidth={1.2} aria-hidden="true" /></button></div><Link href={`/shop/${item.productId}`} className="mt-3 font-serif text-base leading-snug">{item.name}</Link><div className="mt-1 flex flex-wrap items-center justify-between gap-2"><p className="gr-account-muted text-[11px]">{formatNaira(item.priceMinor)}</p><button type="button" disabled title="Cart updates are not connected." className="gr-account-outline flex min-h-9 items-center gap-1.5 px-2 text-[9px]"><ShoppingBag size={12} aria-hidden="true" />Add to cart · Preview</button></div></article>)}</div> : <div className="flex flex-col items-start gap-3 py-5"><Heart size={23} className="gr-account-gold" aria-hidden="true" /><h3 className="font-serif text-xl">A little space for your favourites.</h3><p className="gr-account-muted text-xs leading-6">This preview wishlist is empty. Explore the shop or restore the example items.</p><button type="button" onClick={() => { setWishlist(data.wishlist); setNotice('Example favourites restored locally. Nothing was saved.'); }} className="gr-account-text-link min-h-11 text-xs">Restore preview favourites</button></div>}
                <p className="gr-account-muted mt-4 text-[9px] leading-5">Sample wishlist & prices · Campaign illustrations · Changes are local to this preview.</p>
              </section>
              <section id="orders" className={`${panel} scroll-mt-5`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">Recent orders</h2><span className="gr-account-gold text-[9px] tracking-wider">DEMO EXAMPLES</span></div>
                {data.orders.length ? <div className="gr-account-orders"><table className="w-full border-collapse text-left text-[11px]"><caption className="sr-only">Fictional customer order history</caption><thead><tr>{['Order', 'Date', 'Total', 'Status', ''].map((heading, index) => <th key={index} scope="col" className="px-2 py-3 text-[10px] font-normal">{heading || <span className="sr-only">Action</span>}</th>)}</tr></thead><tbody>{data.orders.map(order => <tr key={order.id}><td data-label="Order" className="px-2 py-4 font-medium">{order.reference}</td><td data-label="Date" className="gr-account-muted px-2 py-4">{formatCustomerDate(order.placedAt)}</td><td data-label="Total" className="px-2 py-4">{formatNaira(order.totalMinor)}</td><td data-label="Status" className="px-2 py-4"><OrderBadge status={order.status} /></td><td className="px-2 py-3"><a href="#tracking" onClick={() => { setActiveOrderId(order.id); setActiveSection('tracking'); }} aria-label={`View order details for ${order.reference}`} className="gr-account-text-link inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[10px]">View order <ArrowRight size={13} aria-hidden="true" /></a></td></tr>)}</tbody></table></div> : <p className="gr-account-muted py-4 text-xs">No orders to show yet.</p>}
              </section>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1">
              <section id="profile" className={`${panel} scroll-mt-5`}>
                <div className="flex items-center gap-3"><span className="gr-account-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full"><UserRound size={26} strokeWidth={1.1} aria-hidden="true" /></span><div className="flex min-w-0 flex-col gap-1"><p className="gr-account-gold text-[10px]">My account</p><h2 className="font-serif text-xl">{data.profile.displayName}</h2><p className="gr-account-muted text-[10px]">Customer account preview</p></div></div>
                <dl className="gr-account-divider mt-5 grid gap-3 border-t pt-4">{[['Full name', data.profile.fullName], ['Email', data.profile.email], ['Phone', data.profile.phone]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 text-[10px]"><dt className="gr-account-muted">{label}</dt><dd className="break-all">{value ?? 'Not connected'}</dd></div>)}</dl>
                <div className="gr-account-divider mt-4 flex flex-col gap-3 border-t pt-4"><a href="#favourites" onClick={() => setActiveSection('favourites')} className="flex min-h-8 items-center gap-3 text-[11px]"><Heart size={16} strokeWidth={1.3} aria-hidden="true" />Wishlist<span className="gr-account-muted ml-auto">{wishlist.length} items</span><ChevronRight size={13} aria-hidden="true" /></a><a href="#orders" onClick={() => setActiveSection('orders')} className="flex min-h-8 items-center gap-3 text-[11px]"><Package size={16} strokeWidth={1.3} aria-hidden="true" />Total orders<span className="gr-account-muted ml-auto">{data.orders.length} examples</span><ChevronRight size={13} aria-hidden="true" /></a><Link href="/account/settings" className="gr-account-text-link inline-flex min-h-9 items-center gap-2 text-[10px]"><Settings2 size={14} aria-hidden="true" />Account settings <ArrowUpRight size={12} className="ml-auto" aria-hidden="true" /></Link></div>
              </section>
              <section id="addresses" className={`${panel} flex scroll-mt-5 flex-col items-start gap-4`}>
                <h2 className="flex items-center gap-2 font-serif text-xl"><MapPin size={19} className="gr-account-gold" strokeWidth={1.3} aria-hidden="true" />Delivery address</h2>
                <div className="gr-account-divider w-full border-t pt-4">{data.addresses.length ? data.addresses.map(address => <address key={address.id} className="text-xs leading-7 not-italic">{address.label}<br />{address.recipient}<br />{address.line1}<br />{address.city}, {address.region}, {address.country}</address>) : <><p className="font-serif text-base">A place for your fragrances.</p><p className="gr-account-muted mt-2 text-[11px] leading-6">No address is connected. Delivery details will appear here when customer accounts are enabled.</p></>}</div><button type="button" disabled className="gr-account-outline px-3 text-[10px]">Add address · Preview</button>
              </section>
              <section id="support" className={`${panel} gr-account-support flex scroll-mt-5 flex-col gap-4`}><h2 className="flex items-center gap-3 font-serif text-xl"><Headphones size={23} className="gr-account-gold" strokeWidth={1.3} aria-hidden="true" />Need a little help?</h2><p className="gr-account-muted text-[11px] leading-6">A question about an order, delivery or a fragrance? Your customer care options will live here.</p><button type="button" disabled className="gr-account-button flex items-center justify-center gap-3 text-[11px]">Contact support · Preview <ArrowRight size={15} aria-hidden="true" /></button><p className="gr-account-muted text-[9px] leading-5">Support contact details have not been connected.</p></section>
              <section className={`${panel} flex flex-col gap-4`} aria-label="Future account services">{[{ title: 'Notifications', Icon: Bell, text: 'Delivery and order preferences' }, { title: 'Receipts & invoices', Icon: ReceiptText, text: 'Verified order documents' }, { title: 'Returns & refunds', Icon: RotateCcw, text: 'Eligibility and return requests' }].map(({ title, Icon, text }) => <div key={title} className="flex items-start gap-3"><Icon size={16} strokeWidth={1.3} className="gr-account-gold mt-0.5 shrink-0" aria-hidden="true" /><div className="flex flex-col gap-1"><h3 className="text-[11px]">{title}</h3><p className="gr-account-muted text-[9px] leading-5">{text} · Not connected</p></div></div>)}</section>
            </div>
          </div>}
          <footer className="gr-account-muted py-7 text-center text-[9px] tracking-[.13em]">GOLDEN ROSE PERFUME · BEAUTY OF FRAGRANCE</footer>
        </main>
      </div>
    </div>
  );
}
