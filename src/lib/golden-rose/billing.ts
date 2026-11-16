import { calculateInvoiceDraft, draftUnitPrice, type InvoiceDraft, type InvoiceDocumentKind } from './invoice-draft';

export type BillingStatus = 'draft' | 'accepted' | 'unpaid' | 'partially_paid' | 'paid' | 'voided';
export type BillingAction = 'configure' | 'save' | 'accept' | 'convert' | 'issue' | 'void' |
  'apply_pos' | 'propose_payment' | 'review_payment';
export type BillingPayload = Record<string, unknown>;
export type BillingResult<T> = { data: T; error?: never; unavailable?: never } |
  { data?: never; error: string; unavailable?: boolean };

interface Issuer {
  name: string;
  address: string;
  contact: string;
  taxId: string;
}

export interface BillingStore {
  id: string;
  name: string;
  active: boolean;
  taxBps: number | null;
  taxBasis: string | null;
  identity: Issuer | null;
}

export interface BillingRow {
  id: string;
  kind: InvoiceDocumentKind;
  state: 'draft' | 'accepted' | 'issued' | 'voided';
  status: BillingStatus;
  location_id: string;
  location_name: string;
  recipient: string;
  issue_date: string;
  invoice_number: number | null;
  total_minor: number;
  paid_minor: number;
  balance_minor: number | null;
  currency: 'NGN';
}

export interface BillingPayment {
  id: string;
  source: 'pos' | 'offline';
  reference: string;
  evidence: string | null;
  amount_minor: number;
  status: 'pending' | 'verified' | 'rejected';
  review_note: string | null;
  canReview: boolean;
}

export interface BillingDocument extends Omit<BillingRow, 'recipient'> {
  original_quote_id: string | null;
  revision: number;
  customer_id: string | null;
  customer: { recipient: string; company: string; email: string; phone: string; address: string };
  lines: { variantId: string | null; description: string; sku: string | null; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
  due_date: string;
  terms: string;
  notes: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_bps: number | null;
  tax_minor: number;
  issuer: Issuer | null;
  payments: BillingPayment[];
}

export interface BillingFilters {
  search: string;
  kind: '' | InvoiceDocumentKind;
  status: '' | BillingStatus;
  storeId: string;
  from: string;
  to: string;
  page: number;
}

export interface BillingRegisterData {
  documents: BillingRow[];
  stores: BillingStore[];
  page: number;
  more: boolean;
  today: string;
  canConfigure: boolean;
  canReviewPayments: boolean;
}

export const billingFilters: BillingFilters = { search: '', kind: '', status: '', storeId: '', from: '', to: '', page: 0 };
export const billingStatus: Record<BillingStatus, string> = {
  draft: 'Draft', accepted: 'Accepted', unpaid: 'Issued / unpaid',
  partially_paid: 'Partially paid', paid: 'Paid', voided: 'Voided',
};
export const invoiceNumber = (value: number | null) => value === null ? '' : 'GR-INV-' + value;
export const quoteReference = (id: string) => 'GR-QT-' + id.toUpperCase();

export function billingDraftPayload(draft: InvoiceDraft, storeId: string, document: BillingDocument | null) {
  const calc = calculateInvoiceDraft(draft);
  if (!calc.valid) throw new Error('Check the required draft fields before saving.');
  return {
    id: document?.id, revision: document?.revision, storeId, kind: draft.kind,
    customerId: draft.customerId, recipient: draft.recipient, email: draft.email, phone: draft.phone,
    company: draft.company, address: draft.address, issueDate: draft.issueDate, dueDate: draft.dueDate,
    terms: draft.paymentTerms, notes: draft.notes, discountMinor: calc.discount,
    lines: calc.rows.map(line => ({
      variantId: line.variantId, description: line.description, sku: line.sku, quantity: line.qty,
      ...(line.variantId ? {} : { unitPriceMinor: line.unit }),
    })),
  };
}

export function savedDocumentDraft(document: BillingDocument): InvoiceDraft {
  return {
    ...document.customer,
    customerId: document.customer_id ?? undefined,
    kind: document.kind,
    issueDate: document.issue_date, dueDate: document.due_date,
    paymentTerms: document.terms, notes: document.notes,
    discount: draftUnitPrice(document.discount_minor),
    taxRate: document.tax_bps === null ? '' : draftUnitPrice(document.tax_bps),
    lines: document.lines.map((line, i) => ({
      id: i + 1, variantId: line.variantId ?? undefined, description: line.description, sku: line.sku ?? '',
      quantity: String(line.quantity), unitPrice: draftUnitPrice(line.unitPriceMinor),
    })),
  };
}

export function savedDocumentAmounts(document: BillingDocument): ReturnType<typeof calculateInvoiceDraft> {
  return {
    rows: savedDocumentDraft(document).lines.map((line, i) => ({
      ...line, qty: document.lines[i].quantity, unit: document.lines[i].unitPriceMinor,
      amount: document.lines[i].lineTotalMinor, valid: true,
    })),
    subtotal: document.subtotal_minor, discount: document.discount_minor, tax: document.tax_minor,
    taxRate: document.tax_bps, total: document.total_minor, valid: true, issues: [],
  };
}

export function billingMinor(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
