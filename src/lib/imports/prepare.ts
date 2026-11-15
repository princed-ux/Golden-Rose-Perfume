import { createHash } from 'node:crypto';
import {
  guessMapping, isKind, MAX_ROWS, validateRows, type Dataset, type ImportKind,
  type Mapping, type RecordData, type RowResult,
} from './model';
import { parseImportPackage } from './parser';
import { importOrder, type DatasetSettings } from './workflow';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export interface PreparedDataset {
  key: string;
  name: string;
  entry: string | null;
  kind: ImportKind | null;
  headers: string[];
  mapping: Mapping;
  generated: boolean;
  currency: '' | 'NGN';
  records: RecordData[];
  results: RowResult[];
  error?: string;
}

const normalized = (text: string) => text.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');

function expandFlatProducts(dataset: Dataset): Dataset[] | undefined {
  const header = dataset.headers.map(normalized);
  const variant = guessMapping(dataset.headers, 'variant', 'odoo');
  const flat = ['template', 'variant'].includes(dataset.kind);
  if (!flat || variant.name === undefined || variant.priceMinor === undefined ||
      (variant.sku === undefined && variant.barcode === undefined) ||
      variant.parentExternalId !== undefined || variant.parentDatabaseId !== undefined) return;

  const brandIndex = header.findIndex(name => ['brand', 'brand name', 'manufacturer'].includes(name));
  const categoryIndex = header.findIndex(name => ['category', 'category name', 'product category'].includes(name));
  const templateIndex = header.findIndex(name => ['product id', 'template id', 'product template id'].includes(name));
  const explicitVariantId = variant.externalId === templateIndex ? undefined : variant.externalId;
  const brands = new Map<string, string>();
  const categories = new Map<string, string>();
  const templates = new Map<string, string[]>();
  const variants: string[][] = [];
  for (const row of dataset.records) {
    if (row.every(cell => !cell.trim())) continue;
    const name = row[variant.name]?.trim() ?? '';
    const brand = row[brandIndex]?.trim() ?? '';
    const category = row[categoryIndex]?.trim() ?? '';
    const productId = row[templateIndex]?.trim() ?? '';
    const sku = row[variant.sku ?? -1]?.trim() ?? '';
    const barcode = row[variant.barcode ?? -1]?.trim() ?? '';
    const externalId = row[explicitVariantId ?? -1]?.trim() ?? '';
    const databaseId = row[variant.databaseId ?? -1]?.trim() ?? '';
    const brandId = brand && 'brand:' + digest(normalized(brand));
    const categoryId = category && 'category:' + digest(normalized(category));
    const parent = name && 'product:' + digest(productId ? 'id:' + productId : normalized(name) + '\n' + normalized(brand));
    if (brandId) brands.set(brandId, brands.get(brandId) ?? brand);
    if (categoryId) categories.set(categoryId, categories.get(categoryId) ?? category);
    const template = [parent, name, brandId, categoryId];
    const signature = JSON.stringify(template);
    templates.set(signature, template);
    const id = externalId || (!databaseId && (sku ? 'sku:' + digest(sku.toLowerCase()) : barcode ? 'barcode:' + digest(barcode) : '')) || '';
    variants.push([
      id, databaseId, parent, name, sku, barcode, row[variant.priceMinor] ?? '',
      row[variant.currency ?? -1] ?? '', row[variant.sizeMl ?? -1] ?? '', row[variant.costMinor ?? -1] ?? '',
    ]);
  }
  const build = (kind: ImportKind, headers: string[], records: string[][]) => ({ kind, headers, records, entry: dataset.entry });
  return [
    build('brand', ['External ID', 'Name'], [...brands]),
    build('category', ['External ID', 'Name'], [...categories]),
    build('template', ['External ID', 'Name', 'Brand Source ID', 'Category Source ID'], [...templates.values()]),
    build('variant', ['External ID', 'Database ID', 'Parent External ID', 'Name', 'SKU', 'Barcode', 'Price', 'Currency', 'Size ML', 'Cost'], variants),
  ].filter(item => item.records.length > 0);
}

export async function prepareImport(bytes: Buffer, filename: string, settings: DatasetSettings[] = [], currency: 'NGN' = 'NGN') {
  const raw = await parseImportPackage(bytes, filename);
  const overrides = new Map(settings.map(setting => [setting.key, setting]));
  const prepared: PreparedDataset[] = [];
  for (const entry of raw.datasets) {
    const rawKey = JSON.stringify([entry.name]);
    const override = overrides.get(rawKey);
    const flat = entry.dataset && !override?.kind ? expandFlatProducts(entry.dataset) : undefined;
    const parts = flat ?? [entry.dataset];
    for (const part of parts) {
      const key = flat ? JSON.stringify([entry.name, part!.kind]) : rawKey;
      const chosen = overrides.get(key);
      const kind = chosen?.kind ?? (isKind(part?.kind) ? part.kind : null);
      const headers = part?.headers ?? [];
      const mapping = chosen?.mapping ?? (kind ? guessMapping(headers, kind, 'odoo') : {});
      const item: PreparedDataset = {
        key, name: entry.name, entry: part?.entry ?? null, kind, headers, mapping,
        generated: Boolean(flat),
        currency: kind === 'variant' ? (mapping.currency === undefined || flat ? currency : '') : '',
        records: [], results: [], error: 'error' in entry ? entry.error : undefined,
      };
      if (!item.error) {
        if (!kind || !part) item.error = 'The dataset type is unclear. Select a record type in Advanced Options.';
        else {
          try {
            const checked = validateRows(part, kind, mapping, item.currency);
            Object.assign(item, checked);
          } catch (error) {
            item.error = error instanceof Error ? error.message : 'These columns could not be mapped.';
          }
        }
      }
      prepared.push(item);
    }
  }
  if (prepared.reduce((total, item) => total + item.results.length, 0) > MAX_ROWS) {
    throw new Error('Use up to 25,000 records per import, including related records detected in a spreadsheet.');
  }
  prepared.sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name));
  const seen = new Map<string, RowResult>();
  for (const item of prepared) {
    for (const record of item.records) {
      const result = item.results[record.row - 2];
      const keys = [
        ['source ID', record.externalId], ['database ID', record.databaseId],
        ['SKU', typeof record.sku === 'string' ? record.sku.toLowerCase() : null], ['barcode', record.barcode],
        ['name', (item.kind === 'brand' || item.kind === 'category') && String(record.name).toLowerCase()],
      ];
      for (const [label, value] of keys) {
        if (!value) continue;
        const identity = JSON.stringify([item.kind, label, value]);
        const previous = seen.get(identity);
        if (previous) {
          result.status = previous.status = 'invalid';
          result.message = previous.message = 'Duplicate or conflicting ' + label + ' in the import package.';
        }
        seen.set(identity, result);
      }
    }
    item.records = item.records.filter(record => item.results[record.row - 2].status === 'unverified');
  }
  const source = raw.datasets.some(({ name, dataset }) =>
    /product[._](?:template|product)|categ_id|product_tmpl_id|default_code/i.test([name, ...(dataset?.headers ?? [])].join(' ')))
    ? 'odoo' : 'spreadsheet';
  return { prepared, images: raw.images, source };
}

function order(kind: ImportKind | null) {
  return kind ? importOrder.indexOf(kind) : importOrder.length;
}
