import type { CustomerDashboardData, CustomerOrderItem, TrackingEvent } from '@/src/domain/customer';
import { featuredProducts } from './demo-data';

const items: CustomerOrderItem[] = featuredProducts.map((product, index) => ({
  id: `demo-item-${index + 1}`, productId: product.id, name: product.name,
  variant: `${product.variants[0].sizeMl} ml`, quantity: 1, unitPriceMinor: product.variants[0].priceMinor,
  image: `/assets/hero/hero-0${index + 1}.png`, imageAlt: 'Illustrative Golden Rose fragrance campaign, not an inventory photograph',
}));
const event = (status: TrackingEvent['status'], occurredAt: string, description: string): TrackingEvent => ({ status, occurredAt, description });

/** Fictional fixtures only. No personal data, session or customer identifier is accepted from a client. */
const previewData: CustomerDashboardData = {
  mode: 'preview',
  profile: { id: 'preview-customer', displayName: 'Fragrance lover', fullName: null, email: null, phone: null },
  addresses: [],
  wishlist: items.map(item => ({ id: `wishlist-${item.productId}`, productId: item.productId, name: item.name, variant: item.variant, priceMinor: item.unitPriceMinor, currency: 'NGN', image: item.image, imageAlt: item.imageAlt })),
  orders: [
    { id: 'demo-order-1', reference: 'GR-DEMO-001', placedAt: '2026-10-18T09:00:00Z', status: 'preparing', currency: 'NGN', totalMinor: items[0].unitPriceMinor + items[1].unitPriceMinor, items: [items[0], items[1]], trackingEvents: [event('placed', '2026-10-18T09:00:00Z', 'Sample order created.'), event('confirmed', '2026-10-18T09:15:00Z', 'Sample confirmation received.'), event('preparing', '2026-10-18T10:00:00Z', 'Fragrances are being prepared in this fictional example.')] },
    { id: 'demo-order-2', reference: 'GR-DEMO-002', placedAt: '2026-10-12T11:00:00Z', status: 'delivered', currency: 'NGN', totalMinor: items[2].unitPriceMinor, items: [items[2]], trackingEvents: [event('placed', '2026-10-12T11:00:00Z', 'Sample order created.'), event('confirmed', '2026-10-12T11:30:00Z', 'Sample order confirmed.'), event('preparing', '2026-10-12T13:00:00Z', 'Sample package prepared.'), event('dispatched', '2026-10-13T09:00:00Z', 'Sample package dispatched.'), event('out_for_delivery', '2026-10-15T08:00:00Z', 'Illustrative delivery run.'), event('delivered', '2026-10-15T14:00:00Z', 'Illustrative delivery completed.')] },
  ],
};

export interface CustomerDataSource { loadDashboard(): Promise<CustomerDashboardData>; }
const previewSource: CustomerDataSource = { async loadDashboard() { return structuredClone(previewData); } };

/** Replace the source with a server-authenticated API later. Client-supplied IDs/roles are never authorization. */
export async function getCustomerDashboard(source: CustomerDataSource = previewSource): Promise<CustomerDashboardData> {
  return source.loadDashboard();
}

export function formatCustomerDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
