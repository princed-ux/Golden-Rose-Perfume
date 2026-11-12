'use server';

import { revalidatePath } from 'next/cache';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { callEdge, EdgeError } from '@/src/lib/golden-rose/edge';
import {
  canManageStockSetup, canReceiveStock, isStockReceipt, LOCATION_TYPES, nairaToKobo,
  toProductSlug, UUID, type LocationType, type OperationResult, type StockReceipt,
} from '@/src/lib/golden-rose/contracts';

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function failed(message: string, retry = false): OperationResult {
  return { status: 'error', message, retry };
}

async function updateInventory(body: object, path: string, message: string, publication = false): Promise<OperationResult> {
  const staff = await getStaffAccess();
  if ('reason' in staff) return failed('Sign in with an active staff account to continue.');
  if (!canManageStockSetup(staff.role)) return failed('Only an owner or manager can make this change.');

  try {
    await callEdge('inventory-admin', { token: staff.token, body });
    revalidatePath(path);
    if (publication) {
      revalidatePath('/shop');
      revalidatePath('/shop/[slug]', 'page');
    }
    return { status: 'success', message };
  } catch (error) {
    return failed(error instanceof EdgeError ? error.message : 'Could not save the change. Refresh the list before retrying.');
  }
}

export async function createProduct(form: FormData): Promise<OperationResult> {
  const name = field(form, 'name');
  const brandName = field(form, 'brandName');
  const categoryName = field(form, 'categoryName');
  const sku = field(form, 'sku');
  const barcode = field(form, 'barcode');
  const description = field(form, 'description');
  const slug = field(form, 'slug') || toProductSlug(name);
  const size = field(form, 'sizeMl');
  const priceMinor = nairaToKobo(field(form, 'price'));

  if (name.length < 2 || name.length > 200 || sku.length < 2 || sku.length > 80) {
    return failed('Enter a product name and SKU of at least two characters.');
  }
  if (!brandName || !categoryName || brandName.length > 150 || categoryName.length > 150
      || !/[a-z0-9]/i.test(brandName) || !/[a-z0-9]/i.test(categoryName)) {
    return failed('Enter a brand and category that each contain a Latin letter or digit.');
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 240) {
    return failed('Enter a URL slug with lowercase letters, numbers, and single hyphens.');
  }
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(size) || Number(size) <= 0) {
    return failed('Enter a bottle size greater than zero, with at most two decimal places.');
  }
  if (priceMinor === null) return failed('Enter a valid naira price with at most two decimal places.');
  if ((barcode && (barcode.length < 3 || barcode.length > 128)) || description.length > 5000) {
    return failed('Check the barcode and description lengths.');
  }

  return updateInventory({
    action: 'product.create', name, brandName, categoryName, slug, sku,
    barcode: barcode || null, description: description || null,
    sizeMl: Number(size), priceMinor, currency: 'NGN',
  }, '/workspace/products', 'Product created as a draft.');
}

export async function setPublication(form: FormData): Promise<OperationResult> {
  const productId = field(form, 'productId');
  const value = field(form, 'published');
  if (!UUID.test(productId) || !['true', 'false'].includes(value)) return failed('Invalid product or publication status.');

  const published = value === 'true';
  return updateInventory({ action: 'product.publish', productId, published }, '/workspace/products',
    published ? 'Product published to the shop.' : 'Product removed from the shop.', true);
}

export async function createLocation(form: FormData): Promise<OperationResult> {
  const name = field(form, 'name');
  const code = field(form, 'code');
  const type = field(form, 'type');
  if (name.length < 2 || name.length > 150 || !/^[A-Za-z0-9_-]{2,32}$/.test(code) ||
      !LOCATION_TYPES.includes(type as LocationType)) {
    return failed('Enter a location name, a valid code, and a location type.');
  }
  return updateInventory({ action: 'location.create', name, code, type }, '/workspace/inventory', 'Location created.');
}

export async function receiveStock(receipt: StockReceipt): Promise<OperationResult> {
  if (!isStockReceipt(receipt)) return failed('Enter a product, location, and whole quantity from 1 to 1,000,000.');
  const staff = await getStaffAccess();
  if ('reason' in staff) return failed('Your staff session could not be verified. Sign in and retry.', true);
  if (!canReceiveStock(staff.role)) return failed('Your role does not permit stock receiving.');

  try {
    const { variantId, locationId, quantity, referenceId, idempotencyKey } = receipt;
    const result = await callEdge<{ movementId: string }>('inventory-receive', {
      token: staff.token, body: { variantId, locationId, quantity, referenceId, idempotencyKey },
    });
    if (typeof result.movementId !== 'string' || !UUID.test(result.movementId)) {
      return failed('The receipt could not be confirmed. Retry this same receipt.', true);
    }
    revalidatePath('/workspace/inventory');
    return { status: 'success', message: 'Stock received. Movement ' + result.movementId };
  } catch (error) {
    const message = error instanceof EdgeError ? error.message : 'The receipt could not be confirmed.';
    const retry = !(error instanceof EdgeError) || error.status === 401 || error.status === 429 || error.status >= 500;
    return failed(message, retry);
  }
}
