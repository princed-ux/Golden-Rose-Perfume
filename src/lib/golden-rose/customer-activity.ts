import type { BillingDocument } from './billing';

/** Identity-based links only. POS payments remain allocations, never extra revenue. */
export function customerActivity(documents: BillingDocument[], customerId: string, storeId: string) {
  const linked = documents.filter(doc => doc.customer_id === customerId && doc.location_id === storeId);
  const issued = linked.filter(doc => doc.kind === 'invoice' && doc.state === 'issued');
  const receipts = new Map<string, { reference: string; storeId: string; search: string; amountMinor: number }>();
  for (const doc of issued) for (const payment of doc.payments) {
    if (payment.source !== 'pos' || payment.status !== 'verified') continue;
    const match = /^POS ([0-9]+)$/.exec(payment.reference);
    if (match && !receipts.has(payment.reference)) receipts.set(payment.reference, {
      reference: payment.reference, storeId, search: match[1], amountMinor: payment.amount_minor,
    });
  }
  return {documents: linked, receipts: [...receipts.values()],
    outstandingMinor: issued.reduce((sum, doc) => sum + (doc.balance_minor ?? 0), 0)};
}
