import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { crc32 } from 'node:zlib';
import { batches, canImportData, guessMapping, summarize, validateRows } from './model';
import { parseUpload } from './parser';

function archive(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const index: Buffer[] = [];
  let offset = 0;
  for (const [path, contents] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc32(data), 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    index.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(index.length / 2, 8);
  end.writeUInt16LE(index.length / 2, 10);
  end.writeUInt32LE(index.reduce((sum, entry) => sum + entry.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...index, end]);
}

test('reads quoted CSV, UTF-8 BOM and multiline descriptions, and reports duplicate identities', async () => {
  const { dataset } = await parseUpload(Buffer.from('\ufeffExternal ID;Name;Description\r\na1;"Amber; Trial";"Line 1\nLine 2"\r\na1;"Amber; Trial";"Line 1\nLine 2"\r\na2;;Missing name'), 'products.csv');
  assert.ok(dataset);
  assert.equal(dataset.records[0][1], 'Amber; Trial');
  const { records, results } = validateRows(dataset, 'template', guessMapping(dataset.headers, 'template'));
  assert.equal(records[0].description, 'Line 1\nLine 2');
  assert.deepEqual(summarize(results), { new: 0, updated: 0, skipped: 1, invalid: 1, unverified: 1 });
});

test('requires a real parent source ID and explicit currency, retains SKU formatting and integer kobo', async () => {
  const { dataset } = await parseUpload(Buffer.from(JSON.stringify([
    { source_id: 'v1', template_id: 'p1', sku: '00031', size_ml: 50, price: '10000.05' },
    { source_id: 'v2', sku: '00032', size_ml: 50, price: '1.001' },
  ])), 'variants.json');
  assert.ok(dataset);
  const mapping = guessMapping(dataset.headers, 'variant');
  assert.equal(validateRows(dataset, 'variant', mapping).records.length, 0);
  const { records, results } = validateRows(dataset, 'variant', mapping, 'NGN');
  assert.equal(records[0].parentExternalId, 'p1');
  assert.equal(records[0].priceMinor, 1000005);
  assert.equal(records[0].sku, '00031');
  assert.equal(results[1].status, 'invalid');
});

test('ZIP packages list datasets and optional images without parsing the image bytes', async () => {
  const bundle = archive({ 'tables/products.csv': 'External ID,Name\np1,Amber fixture', 'tables/brands.json': '[{"id":"b1","name":"Fixture"}]', 'photos/p1.jpg': 'fixture image bytes' });
  const inspection = await parseUpload(bundle, 'export.zip');
  assert.equal(inspection.images, 1);
  assert.equal(inspection.dataset, null);
  assert.equal((await parseUpload(bundle, 'export.zip', 'tables/products.csv')).dataset?.records.length, 1);
  await assert.rejects(parseUpload(archive({ '../products.csv': 'ID,Name\n1,Test' }), 'unsafe.zip'), /Unsafe/);
  await assert.rejects(parseUpload(Buffer.from('not a workbook'), 'product.xlsx'), /Invalid/);
});

test('reads a single-sheet XLSX export with text identifiers', async () => {
  const workbook = archive({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>External ID</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>00031</t></is></c><c r="B2" t="inlineStr"><is><t>Fixture Rose</t></is></c></row></sheetData></worksheet>',
  });
  const { dataset } = await parseUpload(workbook, 'products.xlsx');
  assert.deepEqual(dataset?.records, [['00031','Fixture Rose']]);
});

test('validates 20,000 records and emits bounded batches', async () => {
  const csv = 'External ID,Name\n' + Array.from({ length: 20_000 }, (_, index) => 'p-' + index + ',Fixture product ' + index).join('\n');
  const { dataset } = await parseUpload(Buffer.from(csv), 'products.csv');
  assert.ok(dataset);
  const valid = validateRows(dataset, 'template', guessMapping(dataset.headers, 'template'));
  assert.equal(valid.records.length, 20_000);
  assert.equal(batches(valid.records).length, 100);
  assert.ok(batches(valid.records).every(batch => batch.length <= 200));
});

test('authorizes active owner role only at the import route boundary', () => {
  for (const role of ['customer','manager','inventory_staff','cashier','accountant','sales_staff',undefined]) assert.equal(canImportData(role), false);
  assert.equal(canImportData('owner'), true);
});
