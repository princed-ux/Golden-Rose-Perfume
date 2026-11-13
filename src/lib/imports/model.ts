import { nairaToKobo } from '../golden-rose/contracts';

export const MAX_UPLOAD = 4_000_000;
export const MAX_ROWS = 25_000;
export const BATCH_SIZE = 200;
export const supportedKinds = ['template', 'variant', 'brand', 'category'] as const;
export type ImportKind = typeof supportedKinds[number];
export const importLabels: Record<ImportKind, string> = {
  template: 'Product templates', variant: 'Product variants', brand: 'Brands', category: 'Categories',
};
export const fields = {
  externalId: ['Source / external ID', 'external id', 'external_id', 'source_id', 'source id', 'id'],
  databaseId: ['Source database ID', 'database id', '.id', 'database_id', 'odoo id'],
  parentExternalId: ['Product source ID', 'product template/external id', 'product_tmpl_id/id', 'template_id', 'product_source_id', 'parent_external_id'],
  parentDatabaseId: ['Product database ID', 'product template/database id', 'product_tmpl_id/.id', 'parent_database_id'],
  brandExternalId: ['Brand source ID', 'brand/external id', 'brand_id/id', 'brand_source_id'],
  categoryExternalId: ['Category source ID', 'product category/external id', 'categ_id/id', 'category_source_id'],
  name: ['Name', 'name', 'product name', 'display name', 'brand name', 'category name'],
  description: ['Description', 'description', 'sales description', 'description_sale'],
  sku: ['SKU', 'sku', 'internal reference', 'default_code', 'item code'],
  barcode: ['Barcode', 'barcode', 'ean', 'upc'],
  sizeMl: ['Bottle size (ml)', 'size_ml', 'size ml', 'bottle size (ml)', 'volume ml'],
  priceMinor: ['Selling price (NGN)', 'sales price', 'selling price', 'price', 'list_price', 'lst_price'],
  costMinor: ['Cost (NGN)', 'cost', 'standard_price', 'unit cost'],
  currency: ['Currency', 'currency', 'currency code'],
  imageReference: ['Image reference', 'image path', 'image url', 'image_reference', 'image'],
} as const;
export type Field = keyof typeof fields;
export type Mapping = Partial<Record<Field, number>>;
export type Dataset = { headers: string[]; records: string[][]; kind: string; entry?: string };
export type RecordData = Partial<Record<Field, string | number>> & { row: number };
export type RowStatus = 'new' | 'updated' | 'skipped' | 'invalid' | 'unverified';
export type RowResult = { row: number; name: string; status: RowStatus; message: string };
export type Issue = { row: number; status: RowStatus; message: string };

export function isKind(value: unknown): value is ImportKind {
  return supportedKinds.some(kind => kind === value);
}

export function canImportData(role: string | undefined): boolean {
  return role === 'owner';
}

export function fieldNames(kind: ImportKind): Field[] {
  if (kind === 'variant') return ['externalId','databaseId','parentExternalId','parentDatabaseId','name','sku','barcode','sizeMl','priceMinor','costMinor','currency','imageReference'];
  if (kind === 'template') return ['externalId','databaseId','name','description','brandExternalId','categoryExternalId','imageReference'];
  return ['externalId','databaseId','name','description'];
}

export function guessMapping(headers: string[], kind: ImportKind, preset = 'auto'): Mapping {
  const normalize = (text: string) => text.toLowerCase().trim();
  return Object.fromEntries(fieldNames(kind).flatMap(field => {
    const aliases: readonly string[] = fields[field].slice(1);
    const index = headers.findIndex(header => aliases.includes(normalize(header)) ||
      (preset === 'odoo' && field === 'priceMinor' && normalize(header) === 'public price'));
    return index === -1 ? [] : [[field, index]];
  }));
}

export function detectKind(headers: string[], filename: string) {
  const text = headers.join(' ').toLowerCase();
  const name = filename.toLowerCase();
  if (/invoice|account.move/.test(name) || /invoice number/.test(text)) return 'Invoices';
  if (/purchase/.test(name) || /supplier reference/.test(text)) return 'Purchases';
  if (/customer|res.partner|contact/.test(name) || /email|phone|street/.test(text)) return 'Customers or suppliers';
  if (/stock|quant|location/.test(name) || /on hand|location\/external/.test(text)) return 'Locations or stock';
  if (/sale.order|pos.order|sales|orders/.test(name) || /order number/.test(text)) return 'Historical sales or orders';
  if (/category|categories/.test(name)) return 'category';
  if (/brand/.test(name)) return 'brand';
  if (/product.product|variant/.test(name) || /product template\/|product_tmpl_id|template_id|product_source_id/.test(text)) return 'variant';
  if (/product|catalog/.test(name) || /name/.test(text)) return 'template';
  return 'Unknown record type';
}

const sourceId = /^[\p{L}\p{N}_.:@ -]{1,180}$/u;
const numericId = /^[1-9]\d{0,17}$/;
const limits: Partial<Record<Field, number>> = {
  name: 200, description: 5000, sku: 100, barcode: 80, imageReference: 512,
};

export function validateRows(dataset: Dataset, kind: ImportKind, mapping: Mapping, defaultCurrency?: string) {
  const allowed = fieldNames(kind);
  const indices = Object.entries(mapping);
  if (indices.some(([field, index]) => !allowed.includes(field as Field) ||
    !Number.isInteger(index) || index < 0 || index >= dataset.headers.length) ||
    new Set(indices.map(([, index]) => index)).size !== indices.length) throw new Error('Map each field to a distinct source column.');
  if (mapping.externalId === undefined && mapping.databaseId === undefined) throw new Error('Map at least one source ID column.');
  if (kind !== 'variant' && mapping.name === undefined) throw new Error('Map the name column.');
  if (kind === 'variant' && (mapping.priceMinor === undefined ||
    (mapping.parentExternalId === undefined && mapping.parentDatabaseId === undefined))) {
    throw new Error('Map the selling price and at least one product source ID column.');
  }

  const seen = new Map<string, { signature: string; result: RowResult }>();
  const records: RecordData[] = [];
  const results = dataset.records.map((cells, index): RowResult => {
    const row = index + 2;
    const get = (field: Field) => (cells[mapping[field] ?? -1] ?? '').trim();
    const name = get('name') || get('sku') || get('externalId') || get('databaseId');
    const issue = (message: string, status: RowStatus = 'invalid'): RowResult => ({ row, name, status, message });
    if (cells.every(cell => !cell.trim())) return issue('Empty row.', 'skipped');
    if (cells.length > dataset.headers.length && cells.slice(dataset.headers.length).some(Boolean)) return issue('Row has data in an unnamed column.');
    const externalId = get('externalId');
    const databaseId = get('databaseId');
    if ((!externalId && !databaseId) || (externalId && !sourceId.test(externalId)) || (databaseId && !numericId.test(databaseId))) return issue('Provide a valid source ID.');
    const data: RecordData = { row };
    for (const field of allowed) {
      const value = get(field);
      if (!value) continue;
      if (limits[field] && value.length > limits[field]!) return issue(fields[field][0] + ' exceeds its maximum length.');
      data[field] = value;
    }
    if (kind !== 'variant' && !get('name')) return issue('Name is required.');
    if (['brandExternalId','categoryExternalId'].some(field => {
      const value = get(field as Field);
      return value && !sourceId.test(value);
    })) return issue('Supply valid brand and category source IDs.');
    if (kind === 'variant') {
      const parent = get('parentExternalId');
      const parentDb = get('parentDatabaseId');
      if ((!parent && !parentDb) || (parent && !sourceId.test(parent)) || (parentDb && !numericId.test(parentDb))) return issue('Provide a valid parent product source ID.');
      const currency = (get('currency') || defaultCurrency || '').toUpperCase();
      if (currency !== 'NGN') return issue('Supply NGN in the source or explicitly select it for this upload.');
      const price = nairaToKobo(get('priceMinor'));
      const cost = get('costMinor') ? nairaToKobo(get('costMinor')) : null;
      if (price === null || (get('costMinor') && cost === null)) return issue('Use non-negative NGN amounts with at most two decimal places.');
      const size = get('sizeMl');
      if (size && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(size) || Number(size) <= 0)) return issue('Bottle size must be a positive amount in ml.');
      data.currency = currency;
      data.priceMinor = price;
      if (cost !== null) data.costMinor = cost;
      if (size) data.sizeMl = Number(size);
    }
    const keys = [
      externalId && 'external:' + externalId, databaseId && 'database:' + databaseId,
      get('sku') && 'sku:' + get('sku').toLowerCase(), get('barcode') && 'barcode:' + get('barcode'),
    ].filter(Boolean);
    const signature = JSON.stringify({ ...data, row: 0 });
    const conflicts = keys.flatMap(key => seen.get(key) ?? []);
    const identical = conflicts.length && conflicts.every(previous => previous.signature === signature && previous.result.status !== 'invalid');
    if (identical) return issue('Identical row already present in this dataset.', 'skipped');
    const result = conflicts.length ? issue('Conflicting source ID, SKU, or barcode in this dataset.') : issue('Format verified; catalogue matching pending.', 'unverified');
    for (const previous of conflicts) {
      previous.result.status = 'invalid';
      previous.result.message = result.message;
    }
    keys.forEach(key => seen.set(key, { signature, result }));
    if (result.status === 'unverified') records.push(data);
    return result;
  });
  return { results, records: records.filter(record => results[record.row - 2].status === 'unverified') };
}

export function summarize(rows: RowResult[]) {
  const counts = { new: 0, updated: 0, skipped: 0, invalid: 0, unverified: 0 };
  for (const row of rows) counts[row.status]++;
  return counts;
}

export function batches<T>(records: T[], size = BATCH_SIZE) {
  return Array.from({ length: Math.ceil(records.length / size) }, (_, index) => records.slice(index * size, (index + 1) * size));
}
