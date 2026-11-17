import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parse } from 'csv-parse/sync';
import { catalogueCsv, catalogueExportRows, IncompleteCatalogueError } from './catalogue-export';
import { catalogueFilters } from './catalogue-management';

function item(number: number) {
  return {
    productId: randomUUID(),
    name: 'Fragrance ' + number,
    slug: 'fragrance-' + number,
    description: null,
    brand: 'Golden Rose',
    category: 'Perfume',
    active: true,
    published: number % 2 === 0,
    createdAt: '2026-11-17T10:00:00+00:00',
    variants: [{
      variantId: randomUUID(), sku: String(number).padStart(7, '0'), barcode: '008' + String(number).padStart(9, '0'),
      priceMinor: 196325, currency: 'NGN', sizeMl: 50.5, active: true,
    }],
  };
}

async function* paginate(rows: readonly unknown[], limit = 100) {
  for (let offset = 0; offset < rows.length; offset += limit) yield rows.slice(offset, offset + limit);
}

test('exports filters across 1,007 products and keeps identifiers and minor units intact', async () => {
  const products = Array.from({ length: 1007 }, (_, index) => item(index + 1));
  const rows = await catalogueExportRows(paginate(products), catalogueFilters('', 'all'));
  assert.equal(rows.length, 1007);
  const csv = parse<Record<string, string>>(catalogueCsv(rows), { columns:true, bom:true });
  assert.equal(csv.length,1007);
  assert.equal(csv[1006].sku,'0001007');
  assert.equal(csv[1006].barcode,'008000001007');
  assert.equal(csv[1006].price_minor,'196325');
  assert.equal(csv[1006].product_created_at,'2026-11-17T10:00:00+00:00');
  assert.equal(csv[1006].variant_created_at,'');
  assert.equal(rows[1006].price_minor,196325);
  const drafts = await catalogueExportRows(paginate(products), catalogueFilters('fragrance', 'draft'));
  assert.equal(drafts.length,504);
  const match = await catalogueExportRows(paginate(products), catalogueFilters('008000001007', 'all'));
  assert.deepEqual(match.map(row => row.product_id), [products[1006].productId]);
});

test('exports a product with no variants and deduplicates repeated variant data', async () => {
  const first = item(1);
  const second = item(2);
  const third = item(3);
  const extra = { ...first.variants[0], variantId: randomUUID(), sku: '002-V' };
  const rows = await catalogueExportRows(paginate([
    { ...first, variants: [...first.variants,...first.variants,extra] },
    first,
    { ...second, variants: [] },
    third,
  ],1), catalogueFilters('', 'all'));
  assert.equal(rows.length,4);
  assert.equal(rows.find(row => row.product_id === second.productId)?.variant_id,null);
  assert.deepEqual(rows.filter(row => row.product_id === first.productId).map(row => row.sku),['0000001','002-V']);
  // A match at the product level includes all of its variants.
  const matchedRows = await catalogueExportRows(paginate([{ ...first, variants: [...first.variants,extra] }]),
    catalogueFilters('002-V', 'draft'));
  assert.deepEqual(matchedRows.map(row => row.sku), ['0000001','002-V']);
});

test('CSV quotes embedded commas, quotes and newlines and neutralizes formula-leading text', async () => {
  const product = { ...item(1), name:'  =1+2', description:'Rose, "gold"\r\nNew line', category:'＠1', brand:'\tplain text' };
  const rows = await catalogueExportRows(paginate([product]), catalogueFilters('', 'all'));
  const [csv] = parse<Record<string, string>>(catalogueCsv(rows), { columns:true, bom:true });
  assert.equal(csv.name,"'  =1+2");
  assert.equal(csv.description,product.description);
  assert.equal(csv.category,"'＠1");
  assert.equal(csv.brand,"'\tplain text");
  assert.equal(rows[0].name,product.name);
});

test('rejects malformed records, cross-product variants and interrupted paging', async () => {
  const first = item(1);
  const second = item(2);
  const filters = catalogueFilters('', 'all');
  for (const record of [
    { ...first, variants: undefined },
    { ...first, variants: [{ ...first.variants[0], barcode: 123 }] },
    { ...first, variants: [{ ...first.variants[0], priceMinor: NaN }] },
  ]) await assert.rejects(catalogueExportRows(paginate([record]), filters), IncompleteCatalogueError);
  await assert.rejects(catalogueExportRows(paginate([first,{ ...first, name:'Changed during paging' }],1), filters), IncompleteCatalogueError);
  await assert.rejects(catalogueExportRows(paginate([first,{ ...second, variants: first.variants }]), filters), IncompleteCatalogueError);
  await assert.rejects(catalogueExportRows((async function* () { yield [first]; throw new Error('Fixture unavailable'); })(), filters), /Fixture unavailable/);
});
