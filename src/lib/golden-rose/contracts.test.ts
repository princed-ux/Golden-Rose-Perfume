import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageStockSetup, canReceiveStock, isStockReceipt, nairaToKobo, toProductSlug } from './contracts';

test('naira prices are converted to exact integer kobo', () => {
  assert.equal(nairaToKobo('0.01'), 1);
  assert.equal(nairaToKobo('12.3'), 1230);
  assert.equal(nairaToKobo('25000.99'), 2500099);
  assert.equal(nairaToKobo('0'), 0);
  for (const invalid of ['', '-1', '10.001', '1e3', '99999999999999.99']) {
    assert.equal(nairaToKobo(invalid), null);
  }
  assert.equal(toProductSlug('Éau de Rose & Oud'), 'eau-de-rose-oud');
});

test('only allowed staff roles can submit operations', () => {
  assert.equal(canManageStockSetup('owner'), true);
  assert.equal(canManageStockSetup('manager'), true);
  assert.equal(canManageStockSetup('inventory_staff'), false);
  assert.equal(canReceiveStock('inventory_staff'), true);
  assert.equal(canReceiveStock('cashier'), false);
});

test('pending receipt details survive a storage round trip with the original key', () => {
  const receipt = {
    variantId: '00000000-0000-4000-8000-000000000001',
    locationId: '00000000-0000-4000-8000-000000000002',
    quantity: 4,
    referenceId: 'delivery-test',
    idempotencyKey: '00000000-0000-4000-8000-000000000003',
  };
  const restored: unknown = JSON.parse(JSON.stringify(receipt));
  assert.equal(isStockReceipt(restored), true);
  assert.deepEqual(restored, receipt);
  assert.equal(isStockReceipt({ ...receipt, quantity: 0 }), false);
  assert.equal(isStockReceipt({ ...receipt, quantity: 1.5 }), false);
  assert.equal(isStockReceipt({ ...receipt, idempotencyKey: '' }), false);
});
