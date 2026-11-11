import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Clock3, Package, ReceiptText, ShoppingBag, ShoppingCart, Sparkles, TriangleAlert, UsersRound, Wallet } from 'lucide-react';

// Entirely fictional fixtures. These values are never read from business records.
const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
const transactions = [
  { id: 'DEMO-105', customer: 'Customer 001', item: 'Rose & Oud · 3 units', channel: 'POS', amount: 115500, status: 'Completed', time: '10:42', paid: true },
  { id: 'DEMO-104', customer: 'Customer 002', item: 'Amber Bloom · 2 units', channel: 'Online', amount: 104000, status: 'Completed', time: '10:18', paid: true },
  { id: 'DEMO-103', customer: 'Customer 003', item: 'Velvet Musk · 1 unit', channel: 'POS', amount: 44500, status: 'Completed', time: '09:56', paid: true },
  { id: 'DEMO-102', customer: 'Customer 004', item: 'Amber Bloom · 1 unit', channel: 'Online', amount: 52000, status: 'Awaiting payment', time: '09:40', paid: false },
  { id: 'DEMO-101', customer: 'Customer 005', item: 'Rose & Oud · 1 unit', channel: 'Inquiry', amount: 38500, status: 'To confirm', time: '09:15', paid: false },
];
const sales = [
  { day: 'Mon', revenue: 138000 }, { day: 'Tue', revenue: 174000 }, { day: 'Wed', revenue: 156000 },
  { day: 'Thu', revenue: 218000 }, { day: 'Fri', revenue: 194000 }, { day: 'Sat', revenue: 231000 }, { day: 'Sun', revenue: 264000 },
];
const revenueToday = transactions.filter(transaction => transaction.paid).reduce((total, transaction) => total + transaction.amount, 0);
const metrics = [
  { title: 'Revenue today', value: money(revenueToday), note: '3 completed sample transactions', Icon: CircleDollarSign, tone: 'gold' },
  { title: 'Total sales', value: '6', suffix: 'units', note: 'Illustrative perfume units sold', Icon: ShoppingBag, tone: 'sage' },
  { title: 'Orders', value: String(transactions.length).padStart(2, '0'), note: '3 completed · 2 pending examples', Icon: ReceiptText, tone: 'neutral' },
  { title: 'Gross profit', value: money(94000), note: 'Before expenses · illustrative only', Icon: Wallet, tone: 'rose' },
];
const lowStock = [
  { name: 'Velvet Musk', sku: 'DEMO-VM-50', size: '50 ml', available: 2, reorder: 8, initials: 'VM' },
  { name: 'Amber Bloom', sku: 'DEMO-AB-100', size: '100 ml', available: 4, reorder: 10, initials: 'AB' },
  { name: 'Rose & Oud', sku: 'DEMO-RO-50', size: '50 ml', available: 6, reorder: 12, initials: 'RO' },
];
const bestSellers = [
  { name: 'Rose & Oud', category: 'Oriental · 50 ml', units: 3, revenue: 115500, initials: 'RO' },
  { name: 'Amber Bloom', category: 'Floral · 100 ml', units: 2, revenue: 104000, initials: 'AB' },
  { name: 'Velvet Musk', category: 'Musk · 50 ml', units: 1, revenue: 44500, initials: 'VM' },
];
const quickActions = [
  { href: '/workspace/pos', title: 'New sale', description: 'Open point of sale', Icon: ShoppingCart },
  { href: '/workspace/inventory', title: 'Manage inventory', description: 'Stock and product availability', Icon: Package },
  { href: '/workspace/invoices', title: 'View invoices', description: 'Invoices and payment previews', Icon: ReceiptText },
  { href: '/workspace/customers', title: 'Customer CRM', description: 'Profiles and follow-ups', Icon: UsersRound },
];
const points = sales.map((sale, index) => ({ x: 20 + index * 100, y: 184 - (sale.revenue / 300000) * 164, ...sale }));
const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
const pendingOrders = transactions.filter(transaction => !transaction.paid);

export default function WorkspaceOverview() {
  return (
    <div className="gr-dashboard">
      <header className="gr-dashboard-heading">
        <div><p className="gr-dashboard-eyebrow">YOUR STORE, AT A GLANCE</p><h1>Business overview<span>.</span></h1><p>A little clarity for a well-run day. Sales, stock and your next steps.</p></div>
        <div className="gr-dashboard-heading-actions"><span className="gr-dashboard-date"><CalendarDays size={15} aria-hidden="true" /> Sample day</span><Link href="/workspace/pos" className="gr-dashboard-primary"><ShoppingCart size={16} aria-hidden="true" /> Open POS <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      </header>
      <div className="gr-dashboard-demo"><span className="gr-dashboard-demo-dot" /><strong>DEMO DATA</strong><span>Every figure, customer and stock quantity below is fictional. No live business data is connected.</span></div>

      <section className="gr-dashboard-metrics" aria-label="Illustrative daily business metrics">
        {metrics.map(({ title, value, suffix, note, Icon, tone }) => (
          <article className={`gr-dashboard-metric gr-dashboard-metric--${tone}`} key={title}>
            <div className="gr-dashboard-metric-top"><span className="gr-dashboard-metric-icon"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span><span className="gr-dashboard-sample">DEMO</span></div>
            <h2>{title}</h2><p className="gr-dashboard-metric-value">{value}{suffix && <small>{suffix}</small>}</p><p className="gr-dashboard-metric-note">{note}</p>
          </article>
        ))}
      </section>

      <div className="gr-dashboard-grid">
        <section className="gr-dashboard-card gr-dashboard-chart" aria-labelledby="sales-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">SALES & REVENUE</p><h2 id="sales-heading">Sales performance</h2></div><span className="gr-dashboard-period"><CalendarDays size={13} aria-hidden="true" /> Demo week</span></div>
          <div className="gr-dashboard-chart-summary"><div><strong>{money(sales.reduce((total, sale) => total + sale.revenue, 0))}</strong><span>Illustrative 7-day revenue</span></div><span className="gr-dashboard-chart-key"><i /> Revenue · demo</span></div>
          <div className="gr-dashboard-plot">
            <div className="gr-dashboard-yaxis" aria-hidden="true"><span>₦300k</span><span>₦200k</span><span>₦100k</span><span>₦0</span></div>
            <div className="gr-dashboard-plot-body">
              <svg viewBox="0 0 640 200" preserveAspectRatio="none" role="img" aria-labelledby="sales-chart-title sales-chart-description">
                <title id="sales-chart-title">Illustrative weekly revenue</title><desc id="sales-chart-description">Fictional data only. Monday 138,000 naira; Tuesday 174,000; Wednesday 156,000; Thursday 218,000; Friday 194,000; Saturday 231,000; Sunday 264,000.</desc>
                <defs><linearGradient id="gr-revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b28c4f" stopOpacity=".24" /><stop offset="100%" stopColor="#b28c4f" stopOpacity="0" /></linearGradient></defs>
                {[20, 75, 130, 184].map(y => <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="#ece9e1" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />)}
                <path d={`${line} L 620 184 L 20 184 Z`} fill="url(#gr-revenue-fill)" /><path d={line} fill="none" stroke="#a27d41" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {points.map(point => <circle key={point.day} cx={point.x} cy={point.y} r="3.5" fill="#fffdf8" stroke="#a27d41" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${point.day}: ${money(point.revenue)} — demo`}</title></circle>)}
              </svg>
              <div className="gr-dashboard-xaxis" aria-hidden="true">{sales.map(sale => <span key={sale.day}>{sale.day}</span>)}</div>
            </div>
          </div>
          <div className="gr-dashboard-chart-footer"><span><ChartNoAxesCombined size={15} aria-hidden="true" /> A sample trend, ready for your future sales data.</span><Link href="/workspace/reports">View reports <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        </section>

        <section className="gr-dashboard-card gr-dashboard-quick" aria-labelledby="quick-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">KEEP THINGS MOVING</p><h2 id="quick-heading">Quick actions</h2></div><span className="gr-dashboard-round-icon"><ArrowUpRight size={18} aria-hidden="true" /></span></div>
          <div className="gr-dashboard-quick-list">{quickActions.map(({ href, title, description, Icon }) => <Link href={href} className="gr-dashboard-quick-link" key={href}><span className="gr-dashboard-quick-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}</div>
          <p className="gr-dashboard-quick-note">One business. One connected workspace.</p>
        </section>

        <section className="gr-dashboard-card gr-dashboard-transactions" aria-labelledby="transactions-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">THE LATEST ACTIVITY</p><h2 id="transactions-heading">Recent transactions</h2></div><Link href="/workspace/orders" className="gr-dashboard-link">View all <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
          <p className="gr-dashboard-section-note">Fictional examples · no payments have been processed</p>
          <div className="gr-dashboard-table-scroll" tabIndex={0} role="region" aria-label="Scrollable demo transactions">
            <table className="gr-dashboard-table"><caption className="gr-dashboard-sr-only">Five fictional transactions for the dashboard preview</caption><thead><tr><th scope="col">Transaction</th><th scope="col">Customer</th><th scope="col">Channel</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>{transactions.map(transaction => <tr key={transaction.id}><td><strong>{transaction.id}</strong><small>{transaction.time} · Sample day</small></td><td><strong>{transaction.customer}</strong><small>{transaction.item}</small></td><td><span className="gr-dashboard-channel">{transaction.channel}</span></td><td className="gr-dashboard-amount">{money(transaction.amount)}</td><td><span className={`gr-dashboard-status ${transaction.paid ? 'is-complete' : 'is-pending'}`}><i />{transaction.status}</span></td></tr>)}</tbody></table>
          </div>
          <div className="gr-dashboard-table-footer"><span>Showing 5 sample transactions</span><Link href="/workspace/invoices">Invoice management <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
        </section>

        <section className="gr-dashboard-card gr-dashboard-stock" aria-labelledby="stock-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">NEEDS A LITTLE ATTENTION</p><h2 id="stock-heading">Low-stock products</h2></div><span className="gr-dashboard-count">03</span></div>
          <p className="gr-dashboard-section-note">Illustrative stock levels · 3 sample alerts</p>
          <div className="gr-dashboard-stock-list">{lowStock.map(product => <div className="gr-dashboard-stock-item" key={product.sku}><span className="gr-dashboard-product-mark">{product.initials}</span><div><strong>{product.name}</strong><small>{product.size} · {product.sku}</small><span className="gr-dashboard-stock-threshold">Reorder at {product.reorder} units</span></div><span className="gr-dashboard-stock-quantity"><strong>{product.available}</strong><small>left</small></span></div>)}</div>
          <Link className="gr-dashboard-stock-action" href="/workspace/inventory"><TriangleAlert size={15} aria-hidden="true" /> Review inventory <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </section>

        <section className="gr-dashboard-card gr-dashboard-bestsellers" aria-labelledby="bestsellers-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">THE SAMPLE FAVOURITES</p><h2 id="bestsellers-heading">Best-selling perfumes</h2></div><Link href="/workspace/products" className="gr-dashboard-link">Products <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
          <p className="gr-dashboard-section-note">Ranked by units in the three completed demo sales</p>
          <ol className="gr-dashboard-bestseller-list">{bestSellers.map((product, index) => <li key={product.name}><span className="gr-dashboard-rank">0{index + 1}</span><span className={`gr-dashboard-product-mark gr-dashboard-product-mark--${index}`}>{product.initials}</span><div className="gr-dashboard-bestseller-name"><strong>{product.name}</strong><small>{product.category}</small></div><div className="gr-dashboard-bestseller-bar"><span style={{ width: `${(product.units / 3) * 100}%` }} /></div><div className="gr-dashboard-bestseller-total"><strong>{money(product.revenue)}</strong><small>{product.units} units · demo</small></div></li>)}</ol>
        </section>

        <section className="gr-dashboard-card gr-dashboard-pending" aria-labelledby="pending-heading">
          <div className="gr-dashboard-card-heading"><div><p className="gr-dashboard-eyebrow">ON YOUR RADAR</p><h2 id="pending-heading">Pending orders</h2></div><span className="gr-dashboard-count">02</span></div>
          <p className="gr-dashboard-section-note">Illustrative queue · no live orders</p>
          <div className="gr-dashboard-pending-list">{pendingOrders.map(order => <Link href="/workspace/orders" key={order.id}><span className="gr-dashboard-pending-icon"><Clock3 size={17} aria-hidden="true" /></span><span><strong>{order.id}<b>{money(order.amount)}</b></strong><small>{order.customer} · {order.status}</small></span><ArrowUpRight size={15} aria-hidden="true" /></Link>)}</div>
          <Link href="/workspace/orders" className="gr-dashboard-link gr-dashboard-pending-footer">Go to order management <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>
      </div>
      <footer className="gr-dashboard-footer"><span>Golden Rose Perfume <i>·</i> Business workspace <i>·</i> Demo environment</span><Link href="/workspace/assistant"><Sparkles size={14} aria-hidden="true" /> AI assistant preview <ArrowUpRight size={13} aria-hidden="true" /></Link></footer>
    </div>
  );
}
