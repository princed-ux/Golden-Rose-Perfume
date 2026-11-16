'use server';

import { canViewModule } from '@/src/domain/permissions';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getAdminProductsPage, getCatalogPage } from '@/src/lib/golden-rose/edge';
import { formatPrice } from '@/src/lib/golden-rose/contracts';
import { loadCrmDirectory } from '../customers/data';

export type LookupPage<T> = { items: T[]; offset: number; limit: number; hasMore: boolean; error?: never }
  | { error: string };

export interface InvoiceCustomerChoice {
  id: string;
  label: string;
  detail: string;
  email: string | null;
  phone: string | null;
}

export interface InvoiceProductChoice {
  id: string;
  label: string;
  detail: string;
  sku: string | null;
  priceMinor: number;
}

function safeOffset(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : 0;
}

export async function findInvoiceCustomers(search: string, from: number): Promise<LookupPage<InvoiceCustomerChoice>> {
  const staff = await getStaffAccess();
  if ('reason' in staff || !canViewModule(staff.role, 'invoices') || !canViewModule(staff.role, 'customers')) {
    return { error: 'Your role cannot browse the customer directory.' };
  }
  try {
    const directory = await loadCrmDirectory({
      search: typeof search === 'string' ? search.trim().slice(0, 100) : '', offset: safeOffset(from), status: 'active', locationId: '',
    });
    return {
      items: directory.items.map(customer => ({
        id: customer.id, label: customer.fullName, detail: customer.locationName, email: customer.email, phone: customer.phone,
      })),
      offset: directory.offset, limit: directory.limit, hasMore: directory.hasMore,
    };
  } catch {
    return { error: 'Could not load customers. Retry, or enter a billing recipient manually.' };
  }
}

export async function findInvoiceProducts(search: string, from: number): Promise<LookupPage<InvoiceProductChoice>> {
  const staff = await getStaffAccess();
  if ('reason' in staff || !canViewModule(staff.role, 'invoices')) {
    return { error: 'Your role cannot browse invoice products.' };
  }
  const limit = 20;
  const offset = safeOffset(from);
  const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const byStaff = canViewModule(staff.role, 'products');
  try {
    const products = byStaff
      ? (await getAdminProductsPage(staff.token, offset, limit + 1)).map(product => ({
        name: product.name, active: product.active,
        variants: product.variants.map(variant => ({ ...variant, id: variant.variantId })),
      }))
      : (await getCatalogPage(offset, limit + 1, term)).items.map(product => ({
        name: product.name, active: true, variants: product.variants.map(variant => ({ ...variant, active: true })),
      }));
    const items = products.slice(0, limit).flatMap(product => !product.active ? [] :
      product.variants.flatMap(variant => {
        if (!variant.active || variant.currency !== 'NGN' || !Number.isSafeInteger(variant.priceMinor) || variant.priceMinor <= 0) return [];
        const label = product.name + (variant.sizeMl ? ' · ' + variant.sizeMl + ' ml' : '');
        if (byStaff && term && !(label + ' ' + (variant.sku ?? '')).toLowerCase().includes(term.toLowerCase())) return [];
        return [{
          id: variant.id, label, sku: variant.sku, priceMinor: variant.priceMinor,
          detail: [variant.sku, formatPrice(variant.priceMinor)].filter(Boolean).join(' · '),
        }];
      }));
    return { items, hasMore: products.length > limit, offset, limit };
  } catch {
    return { error: 'Could not load the catalogue. Retry, or add a custom draft line.' };
  }
}
