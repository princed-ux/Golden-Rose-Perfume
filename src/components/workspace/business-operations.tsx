'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ContactRound,
  CreditCard,
  FilePlus2,
  FileText,
  Mail,
  Package,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';

export type BusinessModule =
  | 'orders'
  | 'customers'
  | 'invoices'
  | 'purchases'
  | 'suppliers'
  | 'reports'
  | 'settings'
  | 'expenses';

const card = 'min-w-0 rounded-2xl border border-gr-border bg-gr-surface shadow-[0_7px_22px_rgba(57,16,35,0.035)]';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gr-strong px-4 py-2.5 text-sm font-semibold text-gr-on-strong transition hover:bg-gr-strong-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-gold disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gr-border bg-gr-surface px-4 py-2.5 text-sm font-semibold text-gr-gold transition hover:border-gr-gold hover:bg-gr-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-gold disabled:cursor-not-allowed disabled:opacity-50';
const field = 'w-full min-w-0 min-h-11 rounded-xl border border-gr-gold bg-gr-surface px-3 py-2.5 text-sm text-gr-gold placeholder:text-gr-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gr-gold';
const label = 'grid min-w-0 gap-2 text-xs font-semibold text-gr-muted';

const currency = new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const money = (minor: number) => currency.format(minor / 100);

function Hero({ eyebrow, title, description, icon: Icon, actions }: {
  eyebrow: string; title: string; description: string; icon: LucideIcon; actions?: ReactNode;
}) {
  return <header className="relative overflow-hidden rounded-2xl border border-gr-border bg-linear-to-r from-gr-strong via-gr-strong to-gr-strong-hover p-5 text-gr-on-strong sm:p-7">
    <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 size-64 rounded-full border border-gr-border/25" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-4 top-1 size-40 rounded-full border border-gr-border/25" />
    <div className="relative flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gr-media-accent">{eyebrow}</p>
        <h1 className="font-serif text-[clamp(1.8rem,4vw,3rem)] leading-tight tracking-tight">{title}</h1>
        <p className="mt-3 max-w-[64ch] text-sm leading-6 text-gr-on-strong">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <span className="hidden size-12 place-items-center rounded-xl border border-white/20 bg-white/10 text-gr-media-accent sm:grid"><Icon size={24} aria-hidden="true" /></span>
      </div>
    </div>
  </header>;
}

function SyncNotice({ children }: { children: ReactNode }) {
  return <div role="status" className="flex min-w-0 items-start gap-3 rounded-xl border border-gr-border bg-gr-surface p-4 text-sm leading-6 text-gr-gold">
    <ShieldCheck size={19} aria-hidden="true" className="mt-0.5 shrink-0" />
    <div><strong className="block font-semibold">Interface ready · Data connection pending</strong>{children}</div>
  </div>;
}

function Metric({ title, icon: Icon, detail }: { title: string; icon: LucideIcon; detail: string }) {
  return <div className={card + ' p-4 sm:p-5'}>
    <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-gr-gold">{title}</span><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold"><Icon size={18} aria-hidden="true" /></span></div>
    <p className="mt-3 font-serif text-[2rem] leading-none text-gr-text">—</p>
    <p className="mt-2 text-xs leading-5 text-gr-muted">{detail}</p>
  </div>;
}

function Metrics({ cards }: { cards: { title: string; icon: LucideIcon; detail: string }[] }) {
  return <section aria-label="Business measures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(item => <Metric key={item.title} {...item} />)}</section>;
}

function Panel({ title, detail, icon: Icon, children, aside }: {
  title: string; detail?: string; icon?: LucideIcon; children: ReactNode; aside?: ReactNode;
}) {
  return <section className={card + ' overflow-hidden'}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gr-border px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        {Icon && <span className="grid size-10 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold"><Icon size={19} aria-hidden="true" /></span>}
        <div><h2 className="font-serif text-xl leading-tight text-gr-text">{title}</h2>{detail && <p className="mt-1 text-xs leading-5 text-gr-muted">{detail}</p>}</div>
      </div>{aside}
    </header>
    <div className="min-w-0 p-4 sm:p-5">{children}</div>
  </section>;
}

function ChoiceTabs({ values, selected, setSelected, ariaLabel }: { values: readonly string[]; selected: string; setSelected: (value: string) => void; ariaLabel: string }) {
  return <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">{values.map(item => <button type="button" key={item} aria-pressed={selected === item} onClick={() => setSelected(item)} className={'rounded-xl px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 ' + (selected === item ? 'bg-gr-strong text-gr-on-strong' : 'border border-gr-border bg-gr-surface text-gr-muted hover:bg-gr-accent-soft')}>{item}</button>)}</div>;
}

function EmptyRecords({ icon: Icon, title, explanation, action }: { icon: LucideIcon; title: string; explanation: string; action?: ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gr-border bg-gr-surface px-5 py-9 text-center">
    <span className="grid size-14 place-items-center rounded-2xl bg-gr-surface-alt text-gr-gold"><Icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
    <h3 className="mt-3 font-serif text-xl text-gr-text">{title}</h3>
    <p className="mt-2 max-w-lg text-sm leading-6 text-gr-muted">{explanation}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

function RecordsTable({ columns, icon, emptyTitle, emptyDetail }: { columns: string[]; icon: LucideIcon; emptyTitle: string; emptyDetail: string }) {
  return <div className="overflow-hidden rounded-xl border border-gr-border">
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left">
      <thead className="bg-gr-surface-alt"><tr>{columns.map(column => <th key={column} scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-gr-muted">{column}</th>)}</tr></thead>
      <tbody><tr><td colSpan={columns.length} className="p-4"><EmptyRecords icon={icon} title={emptyTitle} explanation={emptyDetail} /></td></tr></tbody>
    </table></div>
  </div>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  return <label className="relative block min-w-0 flex-1"><span className="sr-only">Search records</span><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-gr-gold" /><input className={field + ' pl-10'} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function Steps({ title, items }: { title: string; items: { label: string; detail: string }[] }) {
  return <Panel title={title} icon={ClipboardList}><ol className="grid gap-5">{items.map((item, i) => <li key={item.label} className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-gr-border bg-gr-surface text-xs font-bold text-gr-gold">{i + 1}</span><div className="min-w-0"><strong className="text-sm text-gr-text">{item.label}</strong><p className="mt-1 text-xs leading-5 text-gr-muted">{item.detail}</p></div></li>)}</ol></Panel>;
}

function Orders({ canOpenPos, canViewInvoices }: { canOpenPos: boolean; canViewInvoices: boolean }) {
  const [channel, setChannel] = useState('All channels');
  const [status, setStatus] = useState('All statuses');
  const [search, setSearch] = useState('');
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow="Operations / Commerce" title="Sales & Orders" description="One place for verified in-store sales, online orders, WhatsApp requests, payments and fulfilment." icon={ShoppingBag}
      actions={canOpenPos ? <Link href="/workspace/pos" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gr-button px-4 py-2.5 text-sm font-bold text-gr-text hover:bg-gr-button">Open POS <ArrowRight size={17}/></Link> : undefined} />
    <Metrics cards={[
      {title:'Recorded sales', icon:ReceiptText,detail:'Confirmed POS and order transactions'},
      {title:'Awaiting payment',icon:CreditCard,detail:'Unpaid and partially paid orders'},
      {title:'Fulfilment queue',icon:Package,detail:'Orders awaiting processing'},
      {title:'Net collected',icon:WalletCards,detail:'Confirmed payments only'},
    ]}/>
    <SyncNotice>The existing POS prints real cash-sale receipts. A verified, authorized sales-listing endpoint must be connected before those sales appear in this order register. No transaction or revenue is fabricated here.</SyncNotice>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.8fr)]">
      <Panel title="Sales register" detail="Search, channel filters and payment states" icon={ShoppingBag}>
        <div className="grid gap-3">
          <ChoiceTabs values={['All channels','In-store POS','Online','WhatsApp']} selected={channel} setSelected={setChannel} ariaLabel="Sales channel" />
          <div className="flex flex-wrap gap-2"><SearchField value={search} onChange={setSearch} placeholder="Order number, customer or barcode"/><label className="min-w-[180px]"><span className="sr-only">Payment or fulfilment status</span><select className={field} value={status} onChange={e=>setStatus(e.target.value)}>{['All statuses','Pending','Paid','Preparing','Fulfilled','Cancelled','Refunded'].map(s=><option key={s}>{s}</option>)}</select></label></div>
          <div className="flex items-center justify-between text-xs text-gr-muted"><span>Filters: {channel} · {status}</span><button type="button" className="font-semibold text-gr-gold underline" onClick={()=>{setChannel('All channels');setStatus('All statuses');setSearch('');}}>Reset filters</button></div>
          <RecordsTable columns={['Order / Sale','Customer','Channel','Payment','Fulfilment','Amount']} icon={ShoppingBag} emptyTitle="Sales listing not connected" emptyDetail="The secure POS already creates receipts. Order and sales history will populate this table when a role-scoped read API is available."/>
        </div>
      </Panel>
      <div className="grid content-start gap-4">
        <Steps title="Order workflow" items={[
          {label:'Record an order',detail:'From POS, storefront or an authorized WhatsApp order entry.'},
          {label:'Confirm payment',detail:'Never mark a payment paid from a browser-only action.'},
          {label:'Fulfil or hand over',detail:'Track collection, packing or dispatch and maintain an audit trail.'},
          {label:'Issue documents',detail:'Print the POS receipt or issue a linked invoice.'},
        ]}/>
        {canViewInvoices && <Link href="/workspace/invoices" className={secondary + ' w-full'}>Invoices & Quotes <ArrowRight size={16}/></Link>}
      </div>
    </div>
  </div>;
}

function ContactDraft({ kind, close }: { kind: 'customer'|'supplier'; close: () => void }) {
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [notes,setNotes]=useState('');
  const [showPreview,setShowPreview]=useState(false);
  return <div role="dialog" aria-modal="true" aria-labelledby="gr-contact-draft-title" className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-gr-strong/70 p-3 backdrop-blur-[3px] sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section className="my-auto w-full max-w-xl rounded-2xl bg-gr-surface p-5 shadow-2xl sm:p-7">
      <header className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.15em] text-gr-gold">Local form preview · Not saved</p><h2 id="gr-contact-draft-title" className="mt-1 font-serif text-2xl text-gr-text">New {kind} profile</h2></div><button type="button" onClick={close} className={secondary+' !min-h-9 !px-3'} aria-label="Close draft"><X size={17}/></button></header>
      <p className="my-4 text-sm leading-6 text-gr-muted">Test the entry form and preview how a {kind} record will look. Nothing is stored or sent to Supabase until its secure API is connected.</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();setShowPreview(true);}}>
        <label className={label+' sm:col-span-2'}>{kind==='customer'?'Customer name':'Supplier / company name'}<input required maxLength={120} className={field} value={name} onChange={e=>{setName(e.target.value);setShowPreview(false);}} placeholder={kind==='customer'?'Full name':'Registered supplier name'}/></label>
        <label className={label}>Email (optional)<input type="email" className={field} value={email} onChange={e=>setEmail(e.target.value)} maxLength={254}/></label>
        <label className={label}>Phone / WhatsApp (optional)<input type="tel" className={field} value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40}/></label>
        <label className={label+' sm:col-span-2'}>Notes (optional)<textarea className={field+' min-h-24 resize-y'} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={600}/></label>
        <button className={primary+' sm:col-span-2'} type="submit">Preview profile</button>
      </form>
      {showPreview && <div className="mt-4 rounded-xl border border-gr-border bg-gr-surface p-4" role="status"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-gr-gold">Unsaved draft preview</p><strong className="mt-2 block break-words font-serif text-xl text-gr-text">{name}</strong><p className="mt-1 break-words text-sm text-gr-muted">{email || 'No email'} · {phone || 'No phone'}</p>{notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gr-muted">{notes}</p>}<p className="mt-3 text-xs font-semibold text-gr-gold">Not a saved business record</p></div>}
    </section>
  </div>;
}

function Contacts({kind}:{kind:'customer'|'supplier'}) {
  const [tab,setTab]=useState(kind==='customer'?'Directory':'All suppliers');
  const [search,setSearch]=useState('');
  const [draft,setDraft]=useState(false);
  const isCustomer=kind==='customer';
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow={isCustomer?'Relationships / CRM':'Procurement / Partners'} title={isCustomer?'Customers & CRM':'Suppliers'} description={isCustomer?'Build lasting customer relationships with purchase history, contact preferences and thoughtful follow-ups.':'Manage supplier profiles, payment terms, purchase history and fragrance sourcing in one place.'} icon={isCustomer?UsersRound:Truck} actions={<button type="button" onClick={()=>setDraft(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gr-button px-4 py-2.5 text-sm font-bold text-gr-text hover:bg-gr-button"><Plus size={17}/> Preview new {kind}</button>}/>
    <Metrics cards={isCustomer?[
      {title:'Customer profiles',icon:UsersRound,detail:'Verified CRM records'},
      {title:'Repeat customers',icon:CheckCircle2,detail:'Customers with completed repeat purchases'},
      {title:'Follow-ups due',icon:Mail,detail:'Scheduled authorized outreach'},
      {title:'Recorded customer spend',icon:WalletCards,detail:'Linked and confirmed purchases'},
    ]:[
      {title:'Active suppliers',icon:Building2,detail:'Verified supplier relationships'},
      {title:'Open purchase orders',icon:ClipboardList,detail:'Orders awaiting fulfilment'},
      {title:'Supplier payables',icon:WalletCards,detail:'Approved outstanding bills'},
      {title:'Purchases completed',icon:Truck,detail:'Received and reconciled orders'},
    ]}/>
    <SyncNotice>The directory is waiting for a secure, role-scoped {isCustomer?'customer':'supplier'} API. The profile preview form can be tested now, but it cannot create real records or send messages yet.</SyncNotice>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.8fr)]">
      <Panel title={isCustomer?'Customer directory':'Supplier directory'} icon={isCustomer?ContactRound:Building2} detail="Search and organize every business relationship">
        <div className="grid gap-4">
          <ChoiceTabs values={isCustomer?['Directory','Follow-ups','Segments']:['All suppliers','Active','On hold']} selected={tab} setSelected={setTab} ariaLabel={isCustomer?'Customer views':'Supplier views'} />
          <SearchField value={search} onChange={setSearch} placeholder={isCustomer?'Search names, phone or email':'Search supplier, phone or product category'} />
          <RecordsTable columns={isCustomer?['Customer','Contact','Last purchase','Total spent','Status']:['Supplier','Contact','Products','Payment terms','Status']} icon={isCustomer?UsersRound:Truck} emptyTitle={isCustomer?'Customer directory not connected':'Supplier directory not connected'} emptyDetail={isCustomer?'Customer profiles and verified purchase activity will appear here once the CRM backend is connected.':'Supplier contacts and confirmed purchase history will appear here when supplier services are enabled.'}/>
        </div>
      </Panel>
      <div className="grid content-start gap-4">
        <Steps title={isCustomer?'Customer journey':'Supplier lifecycle'} items={isCustomer?[
          {label:'Create a customer',detail:'Collect only necessary information with appropriate permissions.'},
          {label:'Connect purchases',detail:'Attach POS and order records to the correct customer.'},
          {label:'Follow up',detail:'Keep contact preferences and outreach history.'},
        ]:[
          {label:'Register supplier',detail:'Company, contact details and payment terms.'},
          {label:'Raise purchase order',detail:'Record products, expected quantities and costs.'},
          {label:'Receive and reconcile',detail:'Match stock receipts and supplier invoices.'},
        ]}/>
        <Link className={secondary+' w-full'} href={isCustomer?'/workspace/orders':'/workspace/purchases'}>{isCustomer?'Open Sales & Orders':'Open Purchasing'} <ArrowRight size={16}/></Link>
      </div>
    </div>
    {draft && <ContactDraft kind={kind} close={()=>setDraft(false)}/>}
  </div>;
}

type DraftLine={ id:number; description:string; quantity:string; unitPrice:string };
function nairaMinor(value:string): number|null {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, part = ''] = trimmed.replace(/,/g, '').split('.');
  if (whole.length > 10) return null;
  const minor=Number(whole)*100+Number(part.padEnd(2,'0'));
  return Number.isSafeInteger(minor)?minor:null;
}

function InvoiceComposer(){
  const [kind,setKind]=useState<'quotation'|'invoice'>('quotation');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [issueDate,setIssueDate]=useState('');
  const [notes,setNotes]=useState('');
  const [discount,setDiscount]=useState('0');
  const [lines,setLines]=useState<DraftLine[]>([{id:1,description:'',quantity:'1',unitPrice:''}]);
  const [counter,setCounter]=useState(1);
  const [showComposer,setShowComposer]=useState(false);
  const calculations=useMemo(()=>{
    const computed=lines.map(line=>{
      const q=Number(line.quantity);
      const price=nairaMinor(line.unitPrice);
      const valid=line.description.trim().length>0&&Number.isInteger(q)&&q>=1&&q<=10000&&price!==null&&price>0;
      const amount=valid?price*q:0;
      return {...line,price,amount,valid};
    });
    const subtotal=computed.reduce((a,b)=>a+b.amount,0);
    const discountMinor=nairaMinor(discount);
    const valid=Boolean(name.trim()&&issueDate&&computed.length>0&&computed.every(x=>x.valid)&&subtotal>0&&subtotal<=1_000_000_000_000&&discountMinor!==null&&discountMinor<=subtotal);
    return {computed,subtotal,discountMinor:discountMinor??0,total:subtotal-(discountMinor??0),valid};
  },[name,issueDate,lines,discount]);
  function updateLine(id:number,fieldName:'description'|'quantity'|'unitPrice',value:string){setLines(rows=>rows.map(row=>row.id===id?{...row,[fieldName]:value}:row));}
  function addLine(){const id=counter+1;setCounter(id);setLines(rows=>[...rows,{id,description:'',quantity:'1',unitPrice:''}]);}
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow="Finance / Commercial documents" title="Invoices & Quotes" description="Prepare accurate customer quotations and invoices. Paid sales have separate, server-verified receipts from the POS." icon={FileText} actions={<button type="button" onClick={()=>setShowComposer(x=>!x)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gr-button px-4 py-2.5 text-sm font-bold text-gr-text"><FilePlus2 size={17}/>{showComposer?'Close composer':'Compose a draft'}</button>}/>
    <Metrics cards={[
      {title:'Issued invoices',icon:FileText,detail:'Official documents after saving and issue'},
      {title:'Outstanding balances',icon:WalletCards,detail:'Verified customer amounts due'},
      {title:'Open quotations',icon:ClipboardList,detail:'Awaiting customer approval'},
      {title:'Payments received',icon:CreditCard,detail:'Reconciled collections only'},
    ]}/>
    <SyncNotice>Issued invoice numbering, payments and balances require the billing backend. The composer below supports local calculation and printing an explicitly unissued draft. It does not record payment or issue a legal receipt.</SyncNotice>
    <Panel title="Document register" icon={FileText} detail="Quotes, issued invoices and payment reconciliation" aside={<button type="button" onClick={()=>setShowComposer(true)} className={secondary+' !min-h-9 !py-1.5'}><Plus size={15}/> New draft</button>}>
      <RecordsTable columns={['Number','Customer','Document','Issue date','Due date','Status','Total']} icon={FileText} emptyTitle="Document history not connected" emptyDetail="Once billing is connected, customer quotations and issued invoices will appear here with verified statuses and unique numbers." />
    </Panel>
    {showComposer&&<Panel title="Quotation / invoice composer" icon={FilePlus2} detail="Local preview only — not saved, issued or paid" aside={<button type="button" onClick={()=>setShowComposer(false)} className={secondary+' !min-h-9 !py-1.5'}><X size={15}/> Close</button>}>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <ChoiceTabs values={['Quotation draft','Invoice draft']} selected={kind==='quotation'?'Quotation draft':'Invoice draft'} setSelected={value=>setKind(value==='Quotation draft'?'quotation':'invoice')} ariaLabel="Document type" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Customer / business name<input className={field} value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Customer name" /></label>
            <label className={label}>Customer email (optional)<input className={field} type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} /></label>
            <label className={label}>Document date<input className={field} type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} /></label>
            <label className={label}>Discount (₦)<input className={field} inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="0.00" /></label>
          </div>
          <h3 className="border-t border-gr-border pt-4 font-serif text-xl text-gr-text">Line items</h3>
          <div className="grid gap-3">{lines.map((line,i)=><div key={line.id} className="grid gap-2 rounded-xl border border-gr-border bg-gr-surface p-3 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_auto] sm:items-end">
            <label className={label}>Item {i+1}<input className={field} value={line.description} onChange={e=>updateLine(line.id,'description',e.target.value)} maxLength={180} placeholder="Fragrance / service" /></label>
            <label className={label}>Qty<input className={field} type="number" min={1} max={10000} step={1} value={line.quantity} onChange={e=>updateLine(line.id,'quantity',e.target.value)} /></label>
            <label className={label}>Unit ₦<input className={field} inputMode="decimal" value={line.unitPrice} onChange={e=>updateLine(line.id,'unitPrice',e.target.value)} placeholder="0.00" /></label>
            <button type="button" className={secondary+' !px-3'} aria-label={'Remove item '+(i+1)} disabled={lines.length===1} onClick={()=>setLines(rows=>rows.filter(x=>x.id!==line.id))}><X size={16}/></button>
          </div>)}</div>
          <button type="button" onClick={addLine} className={secondary+' justify-self-start'} disabled={lines.length>=30}><Plus size={16}/> Add line</button>
          <label className={label}>Terms or notes (optional)<textarea className={field+' min-h-24 resize-y'} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={800} placeholder="Payment terms, validity or delivery notes" /></label>
          <div className="grid gap-1 rounded-xl bg-gr-surface-alt p-4 text-sm text-gr-text"><div className="flex justify-between"><span>Subtotal</span><strong>{money(calculations.subtotal)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>−{money(calculations.discountMinor)}</strong></div><div className="mt-2 flex justify-between border-t border-gr-border pt-2 text-lg"><strong>Total</strong><strong>{money(calculations.total)}</strong></div><small className="mt-1 text-xs text-gr-muted">Tax is not calculated; applicable tax must be configured before issuing a document.</small></div>
        </div>
        <div className="min-w-0"><div id="gr-draft-print" className="rounded-xl border border-gr-border bg-gr-surface p-5 text-gr-text shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b-2 border-gr-border pb-4"><div><p className="font-serif text-2xl tracking-wide text-gr-text">GOLDEN ROSE</p><p className="text-[10px] font-semibold tracking-[.15em] text-gr-gold">BEAUTY OF FRAGRANCE</p></div><span className="text-right text-xs font-bold uppercase text-gr-danger">Draft<br/>Not issued</span></div>
          <h3 className="mt-5 font-serif text-2xl text-gr-text">{kind==='quotation'?'Quotation draft':'Invoice draft'}</h3>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-gr-danger">NOT A PAYMENT RECEIPT</p>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><span className="block text-xs text-gr-muted">Prepared for</span><strong className="break-words">{name||'Customer not specified'}</strong>{email&&<p className="break-words text-xs">{email}</p>}</div><div><span className="block text-xs text-gr-muted">Date</span><strong>{issueDate||'Not selected'}</strong><span className="mt-1 block text-xs text-gr-danger">No issued reference number</span></div></div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-xs">
              <thead>
                <tr className="border-b border-gr-border text-gr-muted">
                  <th scope="col" className="py-2">Description</th>
                  <th scope="col" className="pl-2 text-right">Qty</th>
                  <th scope="col" className="pl-2 text-right">Unit price</th>
                  <th scope="col" className="pl-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {calculations.computed.map(row => (
                  <tr key={row.id} className="border-b border-gr-border align-top">
                    <td className="py-2 [overflow-wrap:anywhere]">{row.description.trim() || '—'}</td>
                    <td className="py-2 pl-2 text-right">{row.quantity}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{row.price === null ? '—' : money(row.price)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{money(calculations.subtotal)}</span></div><div className="flex justify-between"><span>Discount</span><span>−{money(calculations.discountMinor)}</span></div><div className="flex justify-between border-t border-gr-border pt-2 text-base font-bold"><span>Total (NGN)</span><span>{money(calculations.total)}</span></div></div>
          {notes&&<p className="mt-5 whitespace-pre-wrap break-words border-t border-gr-border pt-4 text-xs text-gr-muted">{notes}</p>}
          <p className="mt-8 border-t border-gr-border pt-4 text-center text-[11px] font-bold text-gr-danger">UNISSUED DRAFT · UNPAID · NO PAYMENT CONFIRMATION</p>
        </div>
          <p className="mt-3 text-xs leading-5 text-gr-muted">Print to paper or use your browser’s “Save as PDF”. The printout will remain marked as an unissued draft.</p>
          <button type="button" className={primary+' mt-3 w-full'} disabled={!calculations.valid} onClick={()=>window.print()}><Printer size={17}/> Print draft / Save as PDF</button>
          {!calculations.valid && <p role="status" className="mt-2 text-xs text-gr-danger">Enter a customer, date, line descriptions, valid quantities and prices, and a discount between zero and the subtotal.</p>}
        </div>
      </div>
    </Panel>}
  </div>;
}

function Pipeline({module,canViewInventory}:{module:'purchases'|'expenses';canViewInventory:boolean}){
  const isPurchases=module==='purchases';
  const [filter,setFilter]=useState('All');
  const [search,setSearch]=useState('');
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow={isPurchases?'Procurement / Stock supply':'Finance / Operations'} title={isPurchases?'Purchasing':'Expenses'} description={isPurchases?'Raise purchase orders, track supplier commitments, and reconcile deliveries with inventory receiving.':'Track operating costs, approvals and proof of expenditure without mixing expenses with customer sales.'} icon={isPurchases?Truck:WalletCards}/>
    <Metrics cards={isPurchases?[
      {title:'Open purchase orders',icon:ClipboardList,detail:'Approved and pending supplier orders'},
      {title:'Awaiting delivery',icon:Truck,detail:'Undelivered purchase order lines'},
      {title:'Received value',icon:Package,detail:'Confirmed stock receiving costs'},
      {title:'Supplier payable',icon:WalletCards,detail:'Reconciled unpaid supplier bills'},
    ]:[
      {title:'Total expenses',icon:WalletCards,detail:'Verified approved expenses'},
      {title:'Awaiting approval',icon:ClipboardList,detail:'Expenses pending review'},
      {title:'Paid expenses',icon:CheckCircle2,detail:'Verified paid expenses'},
      {title:'Receipt attachments',icon:ReceiptText,detail:'Recorded evidence of expenditure'},
    ]}/>
    <SyncNotice>{isPurchases?'Purchase orders require a supplier, line items, approval status and a receiving match.':'An expense must be saved with the authorized staff member, type, amount and payment evidence.'} No records or totals are generated until the respective secured backend exists.</SyncNotice>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.8fr)]">
      <Panel icon={isPurchases?Truck:WalletCards} title={isPurchases?'Purchase orders':'Expense ledger'} detail="Designed for real, permission-controlled records">
        <div className="grid gap-4"><ChoiceTabs values={isPurchases?['All','Draft','Ordered','Partially received','Received']:['All','Pending','Approved','Paid']} selected={filter} setSelected={setFilter} ariaLabel="Record status"/><SearchField value={search} onChange={setSearch} placeholder={isPurchases?'Find PO number or supplier':'Find expense category or reference'}/><RecordsTable columns={isPurchases?['PO number','Supplier','Order date','Expected delivery','Status','Amount']:['Reference','Category','Recorded by','Date','Status','Amount']} icon={isPurchases?Truck:WalletCards} emptyTitle={isPurchases?'Purchasing backend not connected':'Expense backend not connected'} emptyDetail={isPurchases?'When purchase-order records are connected, they will populate here with supplier and receiving references.':'Expense entries and approved payment evidence will populate here after the expenses service is enabled.'}/></div>
      </Panel>
      <div className="grid content-start gap-4"><Steps title={isPurchases?'Purchasing controls':'Expense controls'} items={isPurchases?[
        {label:'Choose an approved supplier',detail:'Maintain identity, contacts and payment terms.'},
        {label:'Approve purchase order',detail:'Validate quantities and unit costs before commitment.'},
        {label:'Receive against PO',detail:'Record physical delivery through stock receiving.'},
        {label:'Reconcile invoice',detail:'Match supplier invoice and payment to the PO.'},
      ]:[
        {label:'Record expense',detail:'Category, amount, reference and supporting receipt.'},
        {label:'Review approval',detail:'Apply role-based authorization and audit trail.'},
        {label:'Mark payment',detail:'Confirm actual disbursement before reporting.'},
      ]}/>
      {isPurchases&&<><Link className={secondary+' w-full'} href="/workspace/suppliers">Supplier directory <ArrowRight size={16}/></Link>{canViewInventory&&<Link className={secondary+' w-full'} href="/workspace/inventory">Receive stock <ArrowRight size={16}/></Link>}</>}</div>
    </div>
  </div>;
}

function Reports(){
  const [period,setPeriod]=useState('Last 30 days');
  const [category,setCategory]=useState('Sales');
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow="Insights / Financial intelligence" title="Reports & Analytics" description="A trusted view of sales, inventory, customer performance and operational health, built only from verified business records." icon={BarChart3} actions={<div className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs text-gr-on-strong"><CalendarDays size={17}/><span>Reporting integration pending</span></div>}/>
    <Metrics cards={[
      {title:'Net sales',icon:WalletCards,detail:'Verified completed sales less confirmed refunds'},
      {title:'Transactions',icon:ShoppingBag,detail:'Confirmed transactions in selected period'},
      {title:'Gross margin',icon:BarChart3,detail:'Only when item cost and sale data are complete'},
      {title:'Stock valuation',icon:Package,detail:'Cost-based inventory valuation'},
    ]}/>
    <SyncNotice>Reporting will join verified POS and online orders, purchase costs, refunds and stock movements. Until those feeds are connected, displaying zero revenue or drawing a sample chart would be misleading.</SyncNotice>
    <div className="flex flex-wrap items-center justify-between gap-3"><ChoiceTabs values={['Sales','Inventory','Customers','Finance']} selected={category} setSelected={setCategory} ariaLabel="Report type"/><label className="flex items-center gap-2 text-xs font-semibold text-gr-muted">Period <select className={field+' !w-auto'} value={period} onChange={e=>setPeriod(e.target.value)}>{['Last 7 days','Last 30 days','Last 90 days','This year'].map(item=><option key={item}>{item}</option>)}</select></label></div>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.8fr)]">
      <Panel title={category+' performance'} detail={period+' · Awaiting verified data'} icon={BarChart3}><div className="relative flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-gr-border bg-[repeating-linear-gradient(to_top,#faf5ef_0,#faf5ef_1px,transparent_1px,transparent_54px)] p-6 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-gr-surface-alt text-gr-gold"><BarChart3 size={27}/></span><h3 className="mt-4 font-serif text-xl text-gr-text">No verified chart series yet</h3><p className="mt-2 max-w-md text-sm leading-6 text-gr-muted">The {category.toLowerCase()} graph will render real values once its secure reporting endpoint is connected. No illustrative points have been inserted.</p></div></Panel>
      <Steps title="Data integrations" items={[
        {label:'POS transactions',detail:'Completed cash-sale receipts and refunds.'},
        {label:'Stock and purchasing',detail:'Quantity movements, acquisition costs and valuation.'},
        {label:'Invoices and orders',detail:'Payment status, due dates and customer attribution.'},
        {label:'Role-based reporting',detail:'Managers see permitted locations; owners see business-wide totals.'},
      ]}/>
    </div>
  </div>;
}

function Settings(){
  const [section,setSection]=useState('Business profile');
  const [name,setName]=useState('Golden Rose Perfume');
  const [phone,setPhone]=useState('');
  const [whatsapp,setWhatsapp]=useState('');
  const [address,setAddress]=useState('');
  const [preview,setPreview]=useState(false);
  return <div className="grid min-w-0 gap-5">
    <Hero eyebrow="Administration / Business configuration" title="Business Settings" description="Maintain the Golden Rose identity, contact details, checkout policies and operational preferences." icon={Settings2}/>
    <SyncNotice>Changes on this screen are local previews only. A secured owner-settings API and audit history must be connected before any business setting can be saved to the database.</SyncNotice>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Business settings categories" className={card+' grid content-start gap-2 p-3'}>{['Business profile','Locations','Payments','Storefront','Notifications','Security'].map(item=><button type="button" key={item} onClick={()=>{setSection(item);setPreview(false);}} aria-current={section===item?'page':undefined} className={'rounded-xl px-4 py-3 text-left text-sm font-semibold transition ' +(section===item?'bg-gr-strong text-gr-on-strong':'text-gr-muted hover:bg-gr-accent-soft')}>{item}</button>)}</nav>
      <Panel title={section} detail={section==='Business profile'?'Draft your public-facing business identity.':'Configuration will load from secured business settings.'} icon={Settings2}>
        {section==='Business profile'?<div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-2"><label className={label}>Trading name<input className={field} value={name} maxLength={120} onChange={e=>{setName(e.target.value);setPreview(false);}}/></label><label className={label}>Business phone<input className={field} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40} placeholder="Enter the official business number"/></label><label className={label}>WhatsApp business number<input className={field} type="tel" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} maxLength={40} placeholder="With international country code"/></label><label className={label}>POS currency<input className={field+' bg-gr-surface-alt'} value="NGN — Nigerian naira" readOnly aria-label="Current POS currency"/></label><label className={label+' md:col-span-2'}>Business address<textarea className={field+' min-h-24'} value={address} onChange={e=>setAddress(e.target.value)} maxLength={300}/></label></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={()=>setPreview(true)}>Preview details</button><button type="button" className={secondary} disabled title="Saving requires the owner-settings backend">Save business settings (not connected)</button></div>
          {preview&&<div role="status" className="rounded-xl border border-gr-border bg-gr-surface p-4 text-sm text-gr-text"><strong className="font-serif text-xl">{name||'Business name missing'}</strong><p className="mt-2">Business phone: {phone||'Not specified'}</p><p>WhatsApp: {whatsapp||'Not specified'}</p><p className="whitespace-pre-wrap break-words">Address: {address||'Not specified'}</p><p className="mt-3 text-xs font-semibold text-gr-gold">Preview only · No settings saved</p></div>}
        </div>:<EmptyRecords icon={section==='Payments'?CreditCard:section==='Locations'?Store:section==='Security'?ShieldCheck:Settings2} title={section+' configuration pending'} explanation="This section will use a verified settings read/write endpoint. Security, payment and notification options must not appear enabled until their backend configuration is confirmed." action={section==='Locations'?<Link href="/workspace/inventory" className={secondary}>Open live locations <ArrowRight size={16}/></Link>:undefined}/>}
      </Panel>
    </div>
  </div>;
}

export function BusinessOperations({ module, canOpenPos, canViewInvoices, canViewInventory }: {
  module: BusinessModule; canOpenPos: boolean; canViewInvoices: boolean; canViewInventory: boolean;
}) {
  if(module==='orders')return <Orders canOpenPos={canOpenPos} canViewInvoices={canViewInvoices}/>;
  if(module==='customers')return <Contacts kind="customer"/>;
  if(module==='invoices')return <InvoiceComposer/>;
  if(module==='purchases'||module==='expenses')return <Pipeline module={module} canViewInventory={canViewInventory}/>;
  if(module==='suppliers')return <Contacts kind="supplier"/>;
  if(module==='reports')return <Reports/>;
  return <Settings/>;
}
