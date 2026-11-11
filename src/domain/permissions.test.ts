import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { canViewModule } from './permissions';
import { WORKSPACE_MODULES } from './modules';

describe('Golden Rose preview module permissions', () => {
  it('keeps the customer out of every internal module', () => {
    for (const module of WORKSPACE_MODULES) {
      assert.equal(canViewModule('customer', module.id), false);
    }
  });

  it('gives owners module visibility', () => {
    for (const module of WORKSPACE_MODULES) {
      assert.equal(canViewModule('owner', module.id), true);
    }
  });

  it('does not expose audits, staff or settings to cashiers', () => {
    assert.equal(canViewModule('cashier', 'audit'), false);
    assert.equal(canViewModule('cashier', 'staff'), false);
    assert.equal(canViewModule('cashier', 'settings'), false);
    assert.equal(canViewModule('cashier', 'pos'), true);
  });

  it('limits inventory staff to relevant operations', () => {
    assert.equal(canViewModule('inventory_staff', 'inventory'), true);
    assert.equal(canViewModule('inventory_staff', 'purchases'), true);
    assert.equal(canViewModule('inventory_staff', 'invoices'), false);
  });
});



describe('Planned financial and staff module separation', () => {
  it('limits accountants to their finance and reporting areas', () => {
    assert.equal(canViewModule('accountant', 'expenses'), true);
    assert.equal(canViewModule('accountant', 'invoices'), true);
    assert.equal(canViewModule('accountant', 'staff'), false);
    assert.equal(canViewModule('accountant', 'settings'), false);
  });
  it('does not give sales staff expense or access-management visibility', () => {
    assert.equal(canViewModule('sales_staff', 'orders'), true);
    assert.equal(canViewModule('sales_staff', 'expenses'), false);
    assert.equal(canViewModule('sales_staff', 'staff'), false);
  });
});
