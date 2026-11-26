'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ActionButton, useActionNotice } from '@/src/components/action-feedback';
import { billingStatus, invoiceNumber, quoteReference } from '@/src/lib/golden-rose/billing';
import { workspaceSecondary } from '@/src/components/workspace/page-layout';
import { loadCustomerActivity } from './history-actions';

const money=(minor:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(minor/100);
export function CustomerHistory({customerId,storeId}:{customerId:string;storeId:string}) {
  const [result,setResult]=useState<Awaited<ReturnType<typeof loadCustomerActivity>> | null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  useActionNotice(useMemo(()=>({status:'error' as const,message:result?.error ?? ''}),[result]));
  async function load(page=0) {
    if(lock.current)return;
    lock.current=true;setBusy(true);
    try {setResult(await loadCustomerActivity(customerId,storeId,page));}
    catch {setResult({error:'Customer billing history could not be reached. Retry.'});}
    finally {lock.current=false;setBusy(false);}
  }
  const data=result?.data;
  return <section className="grid min-w-0 gap-3 border-t border-gr-border pt-3" aria-label="Linked customer documents">
    <ActionButton type="button" pending={busy} pendingLabel="Loading history…" className={workspaceSecondary} onClick={()=>load(data?.page ?? 0)}>
      {result ? 'Refresh linked history' : 'View invoices and linked purchases'}
    </ActionButton>
    {result?.error && <p role="alert" className="text-sm text-gr-danger">{result.error}</p>}
    {data && <>
      <p className="text-xs text-gr-muted">Register page {data.page+1}. Only documents with this customer ID are linked. Outstanding on this page: {money(data.outstandingMinor)}.</p>
      {!data.documents.length && <p className="text-sm">No linked documents on this register page.</p>}
      {data.documents.map(doc=><Link key={doc.id} className="grid gap-1 rounded-lg border border-gr-border p-3 text-sm hover:bg-gr-accent-soft" href={'/workspace/invoices?documentId='+doc.id}>
        <strong className="break-all">{doc.kind==='invoice' ? invoiceNumber(doc.invoice_number) || 'Invoice draft' : quoteReference(doc.id)}</strong>
        <span>{billingStatus[doc.status]} · {money(doc.total_minor)}</span>
        {doc.state==='issued' && <span>Outstanding: {money(doc.balance_minor ?? 0)}</span>}
      </Link>)}
      {data.receipts.map(receipt=><Link key={receipt.reference} className="text-sm underline" href={'/workspace/orders?'+new URLSearchParams({search:receipt.search,locationId:receipt.storeId})}>
        {receipt.reference} · {money(receipt.amountMinor)} · verified invoice allocation
      </Link>)}
      <p className="text-xs text-gr-muted">Unassigned POS sales are not matched by name. Invoice allocations do not add a second sale or payment.</p>
      <nav className="flex flex-wrap gap-2" aria-label="Customer history register pages">
        {data.page>0 && <ActionButton type="button" disabled={busy} className={workspaceSecondary} onClick={()=>load(data.page-1)}>Previous register page</ActionButton>}
        {data.more && <ActionButton type="button" disabled={busy} className={workspaceSecondary} onClick={()=>load(data.page+1)}>Next register page</ActionButton>}
      </nav>
    </>}
  </section>;
}
