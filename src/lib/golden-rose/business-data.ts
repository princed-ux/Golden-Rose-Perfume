import type { Customer, Invoice, Product, ProductVariant, SalesOrder, Supplier } from '../../domain/types';
import type { CatalogProduct, Location, StockBalance } from './contracts';

export interface ImportSourceRef {
  source: string;
  model: string;
  externalId?: string;
  databaseId?: string;
}

export interface ReconciledImportRecord {
  source: ImportSourceRef;
  targetId: string;
  lastJobId: string;
}

export interface InventoryMovementRecord {
  id: string;
  variantId: ProductVariant['id'];
  locationId: Location['id'];
  quantityDelta: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: string;
}

export type HistoricalDocument<T> = { document: T; source: ImportSourceRef; importedAt: string; stockTreatment: 'historical-only' };

export interface BusinessDataReader {
  catalogue(offset: number, limit: number, search?: string): Promise<CatalogProduct[]>;
  product(id: Product['id']): Promise<Product | null>;
  variant(id: ProductVariant['id']): Promise<ProductVariant | null>;
  stock(variantId: ProductVariant['id'], locationId: Location['id']): Promise<StockBalance | null>;
  movements(variantId: ProductVariant['id'], locationId: Location['id'], offset: number, limit: number): Promise<InventoryMovementRecord[]>;
  customer(id: Customer['id']): Promise<Customer | null>;
  supplier(id: Supplier['id']): Promise<Supplier | null>;
  order(id: SalesOrder['id']): Promise<SalesOrder | HistoricalDocument<SalesOrder> | null>;
  invoice(id: Invoice['id']): Promise<Invoice | HistoricalDocument<Invoice> | null>;
  reconcile(source: ImportSourceRef): Promise<ReconciledImportRecord | null>;
}
