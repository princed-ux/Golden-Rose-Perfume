export const ROLES = ['owner', 'manager', 'cashier', 'inventory_staff', 'sales_staff', 'accountant', 'customer'] as const;
export type Role = (typeof ROLES)[number];

/** Public registration may only create customer accounts. Enforce this on the future server endpoint. */
export const PUBLIC_REGISTRATION_ROLE = 'customer' as const satisfies Role;

export type PaymentStatus = 'pending' | 'verified' | 'failed' | 'refunded';
export type OrderChannel = 'pos' | 'web' | 'mobile' | 'whatsapp';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';

export interface BusinessLocation {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  sizeMl?: number;
  concentration?: string;
  priceMinor: number;
  costMinor?: number;
  currency: 'NGN';
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description?: string;
  images: string[];
  variants: ProductVariant[];
  active: boolean;
}

export interface InventoryBalance {
  locationId: string;
  variantId: string;
  onHand: number;
  reserved: number;
}

export interface Customer {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  active: boolean;
}

export interface SalesOrder {
  id: string;
  reference: string;
  channel: OrderChannel;
  status: 'draft' | 'pending' | 'paid' | 'fulfilled' | 'cancelled';
  paymentStatus: PaymentStatus;
  customerId?: string;
  locationId?: string;
  totalMinor: number;
  currency: 'NGN';
}

export interface Invoice {
  id: string;
  reference: string;
  customerId: string;
  salesOrderId?: string;
  status: InvoiceStatus;
  totalMinor: number;
  paidMinor: number;
  currency: 'NGN';
  issuedAt?: string;
  dueAt?: string;
}

