import type { StockBalance } from './contracts';

export type StockState = 'available' | 'reserved' | 'not-counted' | 'verified-zero' | 'unverified-zero';

export const stockLabels: Record<StockState, string> = {
  available: 'Available',
  reserved: 'All units reserved',
  'not-counted': 'Not counted',
  'verified-zero': 'Verified zero',
  'unverified-zero': 'Count unverified',
};

type StockEvidence = Pick<StockBalance, 'available' | 'onHand' | 'balanceRecorded' | 'countEvidence'>;

export function stockState(item: StockEvidence): StockState {
  if (item.available > 0) return 'available';
  if (item.onHand > 0) return 'reserved';
  if (item.countEvidence === 'verified-zero') return 'verified-zero';
  if (item.balanceRecorded === false && item.countEvidence === null) return 'not-counted';
  return 'unverified-zero';
}

export function showStockQuantity(item: StockEvidence) {
  const state = stockState(item);
  return state !== 'not-counted' && (state !== 'unverified-zero' || item.balanceRecorded === true);
}
