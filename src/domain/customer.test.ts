import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { getTrackingSteps } from './customer';
import { getCustomerDashboard, formatCustomerDate } from '../lib/customer-data';

describe('Customer dashboard preview', () => {
  it('distinguishes completed, current and upcoming delivery steps', () => {
    assert.deepEqual(getTrackingSteps('preparing', []).map(step => step.state), ['complete', 'complete', 'current', 'upcoming', 'upcoming', 'upcoming']);
    assert.equal(getTrackingSteps('delivered', [])[5].state, 'current');
  });
  it('never invents delivery progress for cancelled or returned orders', () => {
    for (const status of ['cancelled', 'returned'] as const) {
      const steps = getTrackingSteps(status, [{ status: 'placed', occurredAt: '2026-10-18T09:00:00Z', description: 'Sample' }]);
      assert.deepEqual(steps.map(step => step.state), ['complete', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    }
  });
  it('isolates local changes from subsequent preview loads', async () => {
    const first = await getCustomerDashboard();
    first.wishlist.length = 0;
    first.orders[0].items[0].quantity = 99;
    const next = await getCustomerDashboard();
    assert.equal(next.wishlist.length, 3);
    assert.equal(next.orders[0].items[0].quantity, 1);
    assert.equal(next.profile.email, null);
  });
  it('keeps sample order totals consistent with existing product prices', async () => {
    for (const order of (await getCustomerDashboard()).orders) {
      assert.equal(order.totalMinor, order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0));
    }
  });
  it('allows an empty future source and propagates its errors', async () => {
    const data = await getCustomerDashboard();
    data.orders = []; data.wishlist = [];
    assert.equal((await getCustomerDashboard({ async loadDashboard() { return data; } })).orders.length, 0);
    await assert.rejects(getCustomerDashboard({ async loadDashboard() { throw new Error('Source unavailable'); } }), /Source unavailable/);
  });
  it('formats fixture dates consistently in UTC', () => {
    assert.equal(formatCustomerDate('2026-10-18T23:30:00Z'), '18 Oct 2026');
  });
});
