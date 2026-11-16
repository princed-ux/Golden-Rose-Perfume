import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => {
  const compiled = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } });
  module._compile(compiled.outputText,file);
};

const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { DocumentPreview } = require('../app/workspace/invoices/document-preview.tsx');
const { calculateInvoiceDraft, blankInvoiceDraft } = require('../src/lib/golden-rose/invoice-draft.ts');
const { savedDocumentDraft, savedDocumentAmounts, billingDraftPayload, billingMinor } = require('../src/lib/golden-rose/billing.ts');

const issued = {
  kind: 'invoice', state: 'issued', invoice_number: 17, issue_date: '2026-11-16', due_date: '2026-11-30',
  location_name: 'Billing QA fixture', customer: {
    recipient: 'Isolated fixture customer', company: '', email: 'fixture@example.test', phone: '', address: 'Fixture address',
  },
  issuer: { name: 'Golden Rose Perfume (QA)', address: 'Isolated fixture address', contact: 'qa@example.test', taxId: '' },
  terms: 'Due in fourteen days.', notes: 'Synthetic invoice for the isolated print test.',
  lines: [{ variantId: 'fixture-id', description: 'Historical perfume price <fixture>', sku:'0009', quantity:2,
    unitPriceMinor:12500, lineTotalMinor:25000 }],
  subtotal_minor:25000, discount_minor:1000, tax_bps:750, tax_minor:1800, total_minor:25800,
  paid_minor:10000, balance_minor:15800,
};

test('issued print reads the saved snapshot, preserves kobo, and avoids a draft watermark', () => {
  const draft = savedDocumentDraft(issued);
  const amounts = savedDocumentAmounts(issued);
  assert.deepEqual([amounts.rows[0].unit, amounts.tax, amounts.total],[12500,1800,25800]);
  const official = renderToStaticMarkup(createElement(DocumentPreview, { saved: issued, draft, calc: amounts }));
  for (const text of [
    'gr-invoice-print','OFFICIAL INVOICE','GR-INV-17','2026-11-16','2026-11-30','Historical perfume price &lt;fixture&gt;',
    '0009','₦125.00','₦250.00','₦10.00','₦18.00','₦258.00','₦100.00','₦158.00',
    'Outstanding balance','Isolated fixture address','qa@example.test',
  ]) assert.ok(official.includes(text),text);
  assert.ok(!official.includes('UNISSUED DRAFT'));
  const unsaved = blankInvoiceDraft();
  const preview = renderToStaticMarkup(createElement(DocumentPreview, { draft: unsaved, calc: calculateInvoiceDraft(unsaved) }));
  assert.ok(preview.includes('UNISSUED DRAFT'));
  assert.ok(!preview.includes('GR-INV-17'));
  const voided = renderToStaticMarkup(createElement(DocumentPreview, {
    saved: { ...issued, state: 'voided' }, draft, calc: amounts,
  }));
  assert.ok(voided.includes('VOIDED INVOICE'));
  assert.ok(!voided.includes('Outstanding balance'));
  const output = process.env.GR_BILLING_PRINT_HTML;
  if (output) {
    const chunks = new URL('../.next/static/chunks/',import.meta.url);
    const css = existsSync(chunks) ? readdirSync(chunks)
      .filter(file=>file.endsWith('.css')).map(file=>readFileSync(fileURLToPath(new URL(file,chunks)),'utf8')).join('\n') : '';
    const printCss = readFileSync(new URL('../app/workspace/invoices/invoice-print.css',import.meta.url),'utf8');
    writeFileSync(output,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<title>Isolated Golden Rose invoice print fixture</title><style>'+css+'\n'+printCss+'</style>' +
      '<header>Workspace navigation should not print</header><main>'+official+'</main>');
  }
});

test('save payload omits preview totals and catalogue prices; exact minor units reject excess precision', () => {
  const payload = billingDraftPayload(savedDocumentDraft(issued),'fixture-store',null);
  assert.equal(payload.discountMinor,1000);
  assert.equal(payload.lines[0].variantId,'fixture-id');
  assert.ok(!('unitPriceMinor' in payload.lines[0]));
  assert.ok(!('totalMinor' in payload));
  assert.ok(!('taxBps' in payload));
  assert.deepEqual(['3.05','1','0.01','0.001','1e3','-4'].map(billingMinor),[305,100,1,null,null,null]);
});
