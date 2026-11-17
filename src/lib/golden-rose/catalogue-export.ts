import { catalogueFilters, matchesCatalogue } from './catalogue-management';
import { UUID } from './contracts';

type Fields = Record<string, unknown>;
type ExportFilters = ReturnType<typeof catalogueFilters>;
type Cell = string | number | boolean | null;

const HEADERS = [
  'product_id', 'variant_id', 'name', 'slug', 'description', 'brand', 'category', 'publication_status', 'product_active',
  'sku', 'barcode', 'size_ml', 'currency', 'price_minor', 'variant_active',
  'product_created_at', 'product_updated_at', 'variant_created_at', 'variant_updated_at',
] as const;

type CatalogueExportRow = Record<typeof HEADERS[number], Cell>;

export class IncompleteCatalogueError extends Error {
  constructor() {
    super('The catalogue returned incomplete or conflicting records. Refresh and retry the export.');
  }
}

function record(value: unknown): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IncompleteCatalogueError();
  return value as Fields;
}

function optionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new IncompleteCatalogueError();
  return value;
}

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new IncompleteCatalogueError();
  return value;
}

function idOf(value: unknown) {
  const id = requiredText(value);
  if (!UUID.test(id)) throw new IncompleteCatalogueError();
  return id.toLowerCase();
}

function flag(value: unknown) {
  if (typeof value !== 'boolean') throw new IncompleteCatalogueError();
  return value;
}

function timestamp(value: unknown) {
  const text = optionalText(value);
  if (text !== null && !Number.isFinite(Date.parse(text))) throw new IncompleteCatalogueError();
  return text;
}

function normalizeVariant(value: unknown) {
  const input = record(value);
  const { sizeMl, priceMinor } = input;
  const currency = requiredText(input.currency);
  if (typeof priceMinor !== 'number' || !Number.isSafeInteger(priceMinor) || priceMinor < 0 || !/^[A-Z]{3}$/.test(currency)
    || (sizeMl !== null && (typeof sizeMl !== 'number' || !Number.isFinite(sizeMl) || sizeMl <= 0))) {
    throw new IncompleteCatalogueError();
  }
  return {
    id: idOf(input.variantId),
    sku: optionalText(input.sku),
    barcode: optionalText(input.barcode),
    sizeMl, currency, priceMinor,
    active: flag(input.active),
    createdAt: timestamp(input.createdAt),
    updatedAt: timestamp(input.updatedAt),
  };
}

function normalizeProduct(value: unknown) {
  const input = record(value);
  if (!Array.isArray(input.variants)) throw new IncompleteCatalogueError();
  return {
    product: {
      id: idOf(input.productId),
      name: requiredText(input.name),
      slug: requiredText(input.slug),
      description: optionalText(input.description),
      brand: optionalText(input.brand),
      category: optionalText(input.category),
      published: flag(input.published),
      active: flag(input.active),
      createdAt: timestamp(input.createdAt),
      updatedAt: timestamp(input.updatedAt ?? input.revision),
    },
    variants: input.variants.map(normalizeVariant),
  };
}

type Product = ReturnType<typeof normalizeProduct>['product'];
type Variant = ReturnType<typeof normalizeVariant>;

export async function catalogueExportRows(pages: AsyncIterable<readonly unknown[]>, filters: ExportFilters) {
  const products = new Map<string, { product: Product; variants: Map<string, Variant> }>();
  const variantOwners = new Map<string, string>();

  for await (const page of pages) {
    for (const input of page) {
      const { product, variants } = normalizeProduct(input);
      const existing = products.get(product.id);
      if (existing && JSON.stringify(existing.product) !== JSON.stringify(product)) throw new IncompleteCatalogueError();
      const group = existing ?? { product, variants: new Map<string, Variant>() };
      for (const variant of variants) {
        const owner = variantOwners.get(variant.id);
        const prior = group.variants.get(variant.id);
        if ((owner && owner !== product.id) || (prior && JSON.stringify(prior) !== JSON.stringify(variant))) {
          throw new IncompleteCatalogueError();
        }
        variantOwners.set(variant.id, product.id);
        group.variants.set(variant.id, variant);
      }
      products.set(product.id, group);
    }
  }

  const rows: CatalogueExportRow[] = [];
  for (const { product, variants } of products.values()) {
    const entries = [...variants.values()];
    if (!matchesCatalogue({ ...product, variants: entries }, filters)) continue;
    for (const variant of entries.length ? entries : [null]) {
      rows.push({
        product_id: product.id,
        variant_id: variant?.id ?? null,
        name: product.name,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        category: product.category,
        publication_status: product.published ? 'published' : 'draft',
        product_active: product.active,
        sku: variant?.sku ?? null,
        barcode: variant?.barcode ?? null,
        size_ml: variant?.sizeMl ?? null,
        currency: variant?.currency ?? null,
        price_minor: variant?.priceMinor ?? null,
        variant_active: variant?.active ?? null,
        product_created_at: product.createdAt,
        product_updated_at: product.updatedAt,
        variant_created_at: variant?.createdAt ?? null,
        variant_updated_at: variant?.updatedAt ?? null,
      });
    }
  }
  return rows;
}

function csvCell(value: Cell) {
  if (value === null) return '""';
  if (typeof value !== 'string') return String(value);
  // Keep dangerous text inert and enclose each field so commas, quotes, and
  // line breaks cannot introduce a new formula cell.
  const protectedValue = /^(?:[\t\r\n]|[\s\u200b\u200e\u200f\u2060]*[=+@＝＋－＠-])/u.test(value) ? "'" + value : value;
  return '"' + protectedValue.replaceAll('"', '""') + '"';
}

export function catalogueCsv(rows: CatalogueExportRow[]) {
  return '\uFEFF' + [HEADERS.join(','), ...rows.map(row => HEADERS.map(header => csvCell(row[header])).join(','))].join('\r\n') + '\r\n';
}
