export type InvoiceDocumentKind = 'quotation' | 'invoice';

export interface InvoiceDraftLine {
  id: number;
  description: string;
  sku: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceDraft {
  kind: InvoiceDocumentKind;
  recipient: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  notes: string;
  discount: string;
  taxRate: string;
  lines: InvoiceDraftLine[];
}

const MAX_TOTAL = 100_000_000_000_000;

export const blankInvoiceLine = (id: number): InvoiceDraftLine => ({
  id, description: '', sku: '', quantity: '1', unitPrice: '',
});

export const blankInvoiceDraft = (): InvoiceDraft => ({
  kind: 'quotation', recipient: '', company: '', email: '', phone: '', address: '',
  issueDate: '', dueDate: '', paymentTerms: '', notes: '', discount: '0', taxRate: '',
  lines: [blankInvoiceLine(1)],
});

function parseHundredths(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  if (whole.length > 11) return null;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function draftUnitPrice(minor: number) {
  return Math.floor(minor / 100) + '.' + String(minor % 100).padStart(2, '0');
}

export function calculateInvoiceDraft(draft: InvoiceDraft) {
  const rows = draft.lines.map(line => {
    const qty = /^\d{1,5}$/.test(line.quantity.trim()) ? Number(line.quantity) : 0;
    const unit = parseHundredths(line.unitPrice);
    const amount = (unit ?? 0) * qty;
    const valid = line.description.trim().length >= 2 && qty >= 1 && qty <= 10_000 &&
      unit !== null && unit > 0 && Number.isSafeInteger(amount) && amount <= MAX_TOTAL;
    return { ...line, qty, unit, valid, amount: valid ? amount : 0 };
  });

  const subtotal = rows.reduce((sum, line) => sum + line.amount, 0);
  const discount = parseHundredths(draft.discount);
  const taxRate = draft.taxRate.trim() ? parseHundredths(draft.taxRate) : null;
  const validTaxRate = !draft.taxRate.trim() || (taxRate !== null && taxRate <= 10_000);
  const validDiscount = Number.isSafeInteger(subtotal) && subtotal <= MAX_TOTAL &&
    discount !== null && discount < subtotal;
  const taxable = validDiscount ? subtotal - discount : 0;
  // Round document tax half up in kobo after applying the document discount.
  const tax = validTaxRate && taxRate !== null
    ? Number((BigInt(taxable) * BigInt(taxRate) + BigInt(5_000)) / BigInt(10_000))
    : 0;
  const total = taxable + tax;
  const issues: string[] = [];

  if (draft.recipient.trim().length < 2 || draft.recipient.trim().length > 120) {
    issues.push('Enter the customer or recipient name.');
  }
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    issues.push('Check the customer email address.');
  }
  if (!isCalendarDate(draft.issueDate) || !isCalendarDate(draft.dueDate) || draft.dueDate < draft.issueDate) {
    issues.push('Select valid document and due or expiry dates.');
  }
  if (!rows.length || rows.length > 30 || rows.some(line => !line.valid)) {
    issues.push('Complete each line with a description, whole quantity and positive price.');
  }
  if (!validDiscount || !Number.isSafeInteger(total) || total > MAX_TOTAL) {
    issues.push('Check the discount, line prices and document total.');
  }
  if (!validTaxRate) issues.push('Enter a tax rate between 0 and 100 percent, with up to two decimal places.');

  return { rows, subtotal, discount: discount ?? 0, tax, taxRate, total, valid: !issues.length, issues };
}
