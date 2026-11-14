export interface RegisterLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface RegisterProduct {
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

export interface RegisterCatalog {
  items: RegisterProduct[];
  locations: RegisterLocation[];
  selectedLocationId: string | null;
  hasMore: boolean;
}

export interface CashSaleRequest {
  idempotencyKey: string;
  locationId: string;
  method: 'cash';
  items: {
    variantId: string;
    quantity: number;
    expectedPriceMinor: number;
  }[];
  discountMinor: number;
  tenderedMinor: number;
}

export interface RegisterReceipt {
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
  items: {
    variantId: string;
    name: string;
    sku: string | null;
    sizeMl: number | null;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }[];
}
