import type { Role } from '@/src/domain/types';

export type StaffRole = Exclude<Role, 'customer'>;

export interface CatalogVariant {
  id: string;
  sku: string | null;
  sizeMl: number | null;
  priceMinor: number;
  currency: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  variants: CatalogVariant[];
}

export interface AdminProduct extends Omit<CatalogProduct, 'id' | 'variants'> {
  productId: string;
  active: boolean;
  published: boolean;
  variants: (Omit<CatalogVariant, 'id'> & {
    variantId: string;
    barcode: string | null;
    active: boolean;
  })[];
}

export const LOCATION_TYPES = ['store', 'stockroom', 'warehouse'] as const;
export type LocationType = typeof LOCATION_TYPES[number];

export interface Location {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  active: boolean;
}

export interface StockBalance {
  variantId: string;
  locationId: string;
  locationName: string;
  name: string;
  sku: string | null;
  sizeMl: number | null;
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockReceipt {
  variantId: string;
  locationId: string;
  quantity: number;
  referenceId: string | null;
  idempotencyKey: string;
}

export interface OperationResult {
  status: 'idle' | 'success' | 'error';
  message: string;
  retry?: boolean;
}

export const INITIAL_RESULT: OperationResult = { status: 'idle', message: '' };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canManageStockSetup(role: StaffRole) {
  return role === 'owner' || role === 'manager';
}

export function canReceiveStock(role: StaffRole) {
  return canManageStockSetup(role) || role === 'inventory_staff';
}

export function nairaToKobo(value: string) {
  const match = /^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(kobo) ? kobo : null;
}

export function formatPrice(priceMinor: number, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: priceMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceMinor / 100);
}

export function toProductSlug(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isStockReceipt(value: unknown): value is StockReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<StockReceipt>;
  return typeof receipt.variantId === 'string' && UUID.test(receipt.variantId)
    && typeof receipt.locationId === 'string' && UUID.test(receipt.locationId)
    && typeof receipt.quantity === 'number' && Number.isInteger(receipt.quantity)
    && receipt.quantity >= 1 && receipt.quantity <= 1_000_000
    && typeof receipt.idempotencyKey === 'string' && /^[A-Za-z0-9:_-]{8,128}$/.test(receipt.idempotencyKey)
    && (receipt.referenceId === null || (typeof receipt.referenceId === 'string' && receipt.referenceId.length <= 128));
}
