import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showStockQuantity, stockState } from './stock-evidence';

test('a legacy zero, an absent balance and a verified zero are different states', () => {
  const zero = { available: 0, onHand: 0 };
  assert.equal(stockState(zero), 'unverified-zero');
  assert.equal(showStockQuantity(zero), false);
  const notCounted = { ...zero, balanceRecorded: false, countEvidence: null };
  assert.equal(stockState(notCounted), 'not-counted');
  assert.equal(showStockQuantity(notCounted), false);
  assert.equal(stockState({ ...zero, balanceRecorded: true, countEvidence: null }), 'unverified-zero');
  const verified = { ...zero, balanceRecorded: false, countEvidence: 'verified-zero' as const };
  assert.equal(stockState(verified), 'verified-zero');
  assert.equal(showStockQuantity(verified), true);
  assert.equal(stockState({ available: 0, onHand: 5 }), 'reserved');
  assert.equal(stockState({ available: 2, onHand: 5, countEvidence: 'verified-zero' }), 'available');
});
