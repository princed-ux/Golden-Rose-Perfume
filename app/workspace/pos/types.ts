
/** Data contract returned by the live Golden Rose pos-register Edge Function. */
export interface StoreLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface PosProduct {
  id: string; // variant ID: the item actually sold
  productId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  sizeMl: number | null;
  priceMinor: number; // integer kobo, never floating-point naira
  currency: 'NGN';
  available: number; // per selected physical store
  imagePath: string | null;
}

export interface PosCatalogue {
  items: PosProduct[];
  locations: StoreLocation[];
  selectedLocationId: string | null;
  hasMore: boolean;
}

export interface CashSaleLine {
  variantId: string;
  quantity: number;
  expectedPriceMinor: number;
}

export interface CashSaleRequest {
  idempotencyKey: string;
  locationId: string;
  method: 'cash';
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
  method: 'cash';
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
  items: PosReceiptLine[];
}
