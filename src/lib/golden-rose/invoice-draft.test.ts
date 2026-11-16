import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankInvoiceDraft, calculateInvoiceDraft, draftUnitPrice } from './invoice-draft';

const sample = () => ({
  ...blankInvoiceDraft(),
  recipient: 'Test Recipient', issueDate: '2026-11-16', dueDate: '2026-12-01', discount: '1.23',
  lines: [{ id: 1, description: 'Sample perfume', sku: 'TEST001', quantity: '3', unitPrice: '10.11' }],
});

test('a draft sums kobo, applies the discount before tax, and rounds half up', () => {
  const result = calculateInvoiceDraft({ ...sample(), taxRate: '7.5' });
  assert.equal(result.valid, true);
  assert.deepEqual([result.subtotal, result.discount, result.tax, result.total], [3033, 123, 218, 3128]);
  assert.equal(calculateInvoiceDraft({ ...sample(), taxRate: '50',
    discount: '0', lines: [{ ...sample().lines[0], unitPrice: '0.01', quantity: '1' }] }).tax, 1);
  assert.equal(draftUnitPrice(12005), '120.05');
});

test('blank tax and explicit zero both leave the total unchanged', () => {
  assert.equal(calculateInvoiceDraft(sample()).taxRate, null);
  assert.equal(calculateInvoiceDraft({ ...sample(), taxRate: '0' }).taxRate, 0);
  assert.equal(calculateInvoiceDraft(sample()).total, 2910);
});

test('invalid dates, scientific-notation quantities, excess discounts and tax are rejected', () => {
  const draft = sample();
  for (const invalid of [
    { ...draft, issueDate: '2026-02-30' },
    { ...draft, dueDate: '2025-11-01' },
    { ...draft, lines: [{ ...draft.lines[0], quantity: '1e3' }] },
    { ...draft, lines: [{ ...draft.lines[0], unitPrice: '1.001' }] },
    { ...draft, discount: '30.33' },
    { ...draft, taxRate: '100.01' },
  ]) assert.equal(calculateInvoiceDraft(invalid).valid, false);
});
