import { nairaToKobo, toProductSlug, UUID, type AdminProduct, type OperationResult } from './contracts';

export type CataloguePublication = 'all' | 'published' | 'draft';
export type CatalogueCommand = 'create' | 'details' | 'variant' | 'publication' | 'channels';

export function catalogueFilters(search: string, publication: string | null | undefined) {
  return {
    q: search.trim().slice(0, 80),
    publication: (publication === 'published' || publication === 'draft' ? publication : 'all') as CataloguePublication,
  };
}

type CatalogueSearchItem = Pick<AdminProduct, 'name' | 'slug' | 'description' | 'brand' | 'category' | 'published'> & {
  variants: Pick<AdminProduct['variants'][number], 'sku' | 'barcode'>[];
};

export function matchesCatalogue(product: CatalogueSearchItem, filters: ReturnType<typeof catalogueFilters>) {
  if (filters.publication !== 'all' && product.published !== (filters.publication === 'published')) return false;
  const needle = filters.q.toLowerCase();
  if (!needle) return true;
  const searchable = (values: (string | null)[]) => values.filter(value => value !== null).join(' ').toLowerCase();
  return searchable([product.name, product.slug, product.description, product.brand, product.category]).includes(needle) ||
    product.variants.some(variant => searchable([variant.sku, variant.barcode]).includes(needle));
}

export type ManagedVariant = AdminProduct['variants'][number] & {
  name: string | null;
  concentration: string | null;
};

export interface ManagedProduct extends AdminProduct {
  posEnabled: boolean;
  revision: string;
  variants: ManagedVariant[];
}

export interface ManagedCatalogue {
  items: ManagedProduct[];
  page: number;
  pageCount: number;
  total: number;
  overview: {
    totalProducts: number;
    publishedProducts: number;
    draftProducts: number;
    barcodedVariants: number;
  };
}

export interface CatalogueOperation extends OperationResult {
  productId?: string;
  product?: ManagedProduct;
}

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function productFields(form: FormData, creating: boolean) {
  const name = field(form, 'name');
  const brandName = field(form, 'brandName');
  const categoryName = field(form, 'categoryName');
  const description = field(form, 'description');
  const slug = field(form, 'slug') || toProductSlug(name);

  if (name.length < 2 || name.length > 200) return { error: 'Use 2 to 200 characters for the product name.' } as const;
  if ((creating && (!brandName || !categoryName)) || brandName.length > 150 || categoryName.length > 150) {
    return { error: 'Enter a brand and category of up to 150 characters.' } as const;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 240) {
    return { error: 'Use lowercase letters, numbers and single hyphens for the URL slug.' } as const;
  }
  if (description.length > 5000) return { error: 'Keep the description within 5,000 characters.' } as const;
  return { data: { name, brandName, categoryName, description, slug } } as const;
}

export function variantFields(form: FormData, editing: boolean) {
  const sku = field(form, 'sku');
  const barcode = field(form, 'barcode');
  const variantName = field(form, 'variantName');
  const concentration = field(form, 'concentration');
  const size = field(form, 'sizeMl');
  const priceMinor = nairaToKobo(field(form, 'price'));

  if (sku.length < 2 || sku.length > 80) return { error: 'Use 2 to 80 characters for the SKU.' } as const;
  if (barcode && (barcode.length < 3 || barcode.length > 128)) {
    return { error: 'Use 3 to 128 characters for the barcode or leave it blank.' } as const;
  }
  if (variantName.length > 150 || concentration.length > 100) return { error: 'Check the variant name and concentration lengths.' } as const;
  if ((!size && !editing) || (size && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(size) || Number(size) <= 0))) {
    return { error: 'Enter a bottle size above zero with up to two decimal places.' } as const;
  }
  if (priceMinor === null || priceMinor <= 0 || priceMinor > 100_000_000_000) {
    return { error: 'Enter a selling price from ₦0.01 to ₦1,000,000,000 with up to two decimal places.' } as const;
  }
  return { data: { sku, barcode, variantName, concentration, sizeMl: size || null, priceMinor } } as const;
}

export function cataloguePayload(action: CatalogueCommand, form: FormData) {
  const requestId = field(form, 'requestId');
  const productId = field(form, 'productId');
  const revision = field(form, 'revision');
  const variantId = field(form, 'variantId');
  if (!UUID.test(requestId) || (action !== 'create' && (!UUID.test(productId) || revision.length > 60))
    || (variantId && !UUID.test(variantId))) {
    return { error: 'Reload the product before trying again.' } as const;
  }
  const identity = { requestId, productId: productId || undefined, revision: revision || undefined };

  if (action === 'channels') {
    const posEnabled = field(form, 'posEnabled');
    const published = field(form, 'published');
    if (!['true', 'false'].includes(posEnabled) || !['true', 'false'].includes(published)) {
      return { error: 'Choose valid POS and online selling channels.' } as const;
    }
    return { data: { ...identity, posEnabled: posEnabled === 'true', published: published === 'true' } } as const;
  }

  if (action === 'publication') {
    const state = field(form, 'published');
    if (state !== 'true' && state !== 'false') return { error: 'Choose a publication status.' } as const;
    return { data: { ...identity, published: state === 'true' } } as const;
  }
  if (action === 'details') {
    const fields = productFields(form, false);
    return fields.error ? fields : { data: { ...identity, ...fields.data } } as const;
  }
  const variant = variantFields(form, !!variantId);
  if (variant.error) return variant;
  if (action === 'variant') {
    const active = field(form, 'active');
    if (active !== 'true' && active !== 'false') return { error: 'Choose a variant availability.' } as const;
    return { data: { ...identity, ...variant.data, variantId: variantId || undefined, active: active === 'true' } } as const;
  }
  const product = productFields(form, true);
  return product.error ? product : { data: { ...identity, ...product.data, ...variant.data } } as const;
}
