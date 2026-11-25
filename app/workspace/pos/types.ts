import type {
  SalePayment,
  ReceivingAccount,
  PaymentMethod,
  PaymentBreakdown,
} from '@/src/lib/golden-rose/pos-payments';

/** Data contract returned by the live Golden Rose pos-register Edge Function. */
export interface StoreLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface PosProduct {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  sizeMl: number | null;
  priceMinor: number;
  currency: 'NGN';
  available: number;
  imagePath: string | null;
}

export interface PosCatalogue {
  items: PosProduct[];
  locations: StoreLocation[];
  selectedLocationId: string | null;
  hasMore: boolean;
  paymentVersion?: number;
  receivingAccount?: ReceivingAccount | null;
}

export interface CashSaleLine {
  variantId: string;
  quantity: number;
  expectedPriceMinor: number;
}

/** Legacy type name retained for existing saved transaction references. */
export interface CashSaleRequest extends SalePayment {
  idempotencyKey: string;
  locationId: string;
  items: CashSaleLine[];
  discountMinor: number;
  tenderedMinor: number;
}

export interface PosReceiptLine {
  variantId: string;
  name: string;
  sku: string | null;
  sizeMl: number | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface PosReceipt {
  saleId: string;
  saleNumber: number;
  createdAt: string;
  locationId: string;
  locationName: string;
  cashierId: string;
  currency: 'NGN';
  method: PaymentMethod;
  customerName?: string | null;
  payments?: PaymentBreakdown;
  manualConfirmed?: boolean;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
  items: PosReceiptLine[];
}