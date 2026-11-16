'use server';

import { revalidatePath } from 'next/cache';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { callEdge, EdgeError } from '@/src/lib/golden-rose/edge';
import {
  canManageStockSetup, canReceiveStock, isStockReceipt, LOCATION_TYPES,
  UUID, type LocationType, type OperationResult, type StockReceipt,
} from '@/src/lib/golden-rose/contracts';
import { productFields, variantFields, type CatalogueOperation } from '@/src/lib/golden-rose/catalogue-management';

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function failed(message: string, retry = false): OperationResult {
  return { status: 'error', message, retry };
}

async function updateInventory(body: object, path: string, message: string, publication = false): Promise<CatalogueOperation> {
  const staff = await getStaffAccess();
  if ('reason' in staff) return failed('Sign in with an active staff account to continue.');
  if (!canManageStockSetup(staff.role)) return failed('Only an owner or manager can make this change.');

  try {
    const { data } = await callEdge<{ data?: { productId?: string } }>('inventory-admin', { token: staff.token, body });
    revalidatePath(path);
    if (publication) {
      revalidatePath('/shop');
      revalidatePath('/shop/[slug]', 'page');
    }
    return { status: 'success', message, productId: data?.productId };
  } catch (error) {
    return failed(error instanceof EdgeError ? error.message : 'Could not save the change. Refresh the list before retrying.');
  }
}

export async function createProduct(form: FormData): Promise<CatalogueOperation> {
  const product = productFields(form, true);
  const variant = variantFields(form, false);
  if (!product.data) return failed(product.error);
  if (!variant.data) return failed(variant.error);
  if (variant.data.variantName || variant.data.concentration) {
    return failed('Variant names and concentrations require the catalogue management migration.');
  }
  const { barcode, sizeMl, sku, priceMinor } = variant.data;
  return updateInventory({
    action: 'product.create', ...product.data, sku, barcode: barcode || null,
    sizeMl: Number(sizeMl), priceMinor, currency: 'NGN',
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
