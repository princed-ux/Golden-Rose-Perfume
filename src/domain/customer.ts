export type CustomerOrderStatus = 'placed' | 'confirmed' | 'preparing' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';

export interface CustomerProfile { id: string; displayName: string; fullName: string | null; email: string | null; phone: string | null; }
export interface DeliveryAddress { id: string; label: string; recipient: string; line1: string; line2?: string; city: string; region: string; country: string; postalCode?: string; isDefault: boolean; }
export interface CustomerOrderItem { id: string; productId: string; name: string; variant: string; quantity: number; unitPriceMinor: number; image: string; imageAlt: string; }
export interface TrackingEvent { status: CustomerOrderStatus; occurredAt: string; description: string; }
export interface CustomerOrder { id: string; reference: string; placedAt: string; status: CustomerOrderStatus; currency: 'NGN'; totalMinor: number; items: CustomerOrderItem[]; trackingEvents: TrackingEvent[]; }
export interface WishlistItem { id: string; productId: string; name: string; variant: string; priceMinor: number; currency: 'NGN'; image: string; imageAlt: string; }
export interface CustomerDashboardData { mode: 'preview'; profile: CustomerProfile; orders: CustomerOrder[]; addresses: DeliveryAddress[]; wishlist: WishlistItem[]; }

export const TRACKING_STAGES = [
  { status: 'placed', label: 'Order placed' }, { status: 'confirmed', label: 'Confirmed' },
  { status: 'preparing', label: 'Preparing' }, { status: 'dispatched', label: 'Dispatched' },
  { status: 'out_for_delivery', label: 'Out for delivery' }, { status: 'delivered', label: 'Delivered' },
] as const;
export const ORDER_STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  placed: 'Order placed', confirmed: 'Confirmed', preparing: 'Preparing', dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};

/** Terminal states preserve recorded history without inventing delivery progress. */
export function getTrackingSteps(status: CustomerOrderStatus, events: TrackingEvent[]) {
  const current = TRACKING_STAGES.findIndex(step => step.status === status);
  const terminal = status === 'cancelled' || status === 'returned';
  return TRACKING_STAGES.map((step, index) => {
    const event = events.find(event => event.status === step.status);
    const state: 'complete' | 'current' | 'upcoming' = terminal
      ? event ? 'complete' : 'upcoming'
      : index === current ? 'current' : index < current ? 'complete' : 'upcoming';
    return { ...step, state, occurredAt: event?.occurredAt };
  });
}
