import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');
const readMigration = name => readFileSync('supabase/migrations/' + name, 'utf8');

// The two original POS migrations are on origin/main until Git reconciliation.
function readPosBaseline(name) {
  try {
    return readMigration(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return execFileSync('git', ['show', 'origin/main:supabase/migrations/' + name], { encoding: 'utf8' });
  }
}

test('POS uses the verified actor while keeping Auth private and cash checkout atomic', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      grant usage on schema auth to service_role;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    `);
    await db.exec(readMigration('20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql'));
    await db.exec(readMigration('20261112004128_golden_rose_staff_atomic_stock_transactions.sql'));
    await db.exec(readPosBaseline('20261114141541_golden_rose_atomic_cash_pos_register.sql'));
    await db.exec(readPosBaseline('20261114141844_golden_rose_pos_price_verification.sql'));

    const [owner, cashier, suspended, customer, unconfirmed, location, product, variant, idempotencyKey] =
      Array.from({ length: 9 }, () => crypto.randomUUID());
    await db.query(`insert into auth.users values
      ($1, now()), ($2, now()), ($3, now()), ($4, now()), ($5, null)`,
    [owner, cashier, suspended, customer, unconfirmed]);
    await db.query(`insert into golden_rose.staff_members (user_id, role, status) values
      ($1, 'owner', 'active'), ($2, 'cashier', 'active'), ($3, 'owner', 'suspended'),
      ($4, 'cashier', 'active')`, [owner, cashier, suspended, unconfirmed]);
    await db.query("insert into golden_rose.locations (id, name, code) values ($1, 'Fixture store', 'TEST')", [location]);
    await db.query("insert into golden_rose.products (id, name, slug) values ($1, 'Fixture perfume', 'fixture-perfume')", [product]);
    await db.query(`insert into golden_rose.product_variants (id, product_id, sku, barcode, price_minor)
      values ($1, $2, 'FIXTURE', '8754321012', 135000)`, [variant, product]);
    await db.query(`insert into golden_rose.stock_balances (variant_id, location_id, on_hand, reserved)
      values ($1, $2, 3, 1)`, [variant, location]);

    async function register(actor, action = 'catalog', payload = {}) {
      const result = await db.query('select public.gr_pos_register($1, $2, $3::jsonb) as value',
        [actor, action, JSON.stringify(payload)]);
      return result.rows[0].value;
    }

    await db.exec('set role service_role');
    await assert.rejects(register(owner), { code: '42501', message: 'permission denied for table users' });
    await db.exec('reset role');

    await db.exec(readMigration('20261114172002_golden_rose_pos_actor_authorization.sql'));

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(register(owner), { code: '42501' });
      await db.exec('reset role');
    }

    await db.exec('set role service_role');
    await assert.rejects(db.query('select id from auth.users'), { code: '42501' });
    const catalogue = await register(owner, 'catalog', { search: '8754321012' });
    assert.equal(catalogue.items.length, 1);
    assert.equal(catalogue.items[0].id, variant);
    assert.equal(catalogue.items[0].available, 2);
    assert.equal((await register(cashier)).items.length, 1);
    for (const actor of [customer, suspended, unconfirmed, crypto.randomUUID(), null]) {
      await assert.rejects(register(actor), { code: 'GR403' });
    }

    const payload = {
      idempotencyKey, locationId: location, method: 'cash', discountMinor: 0, tenderedMinor: 150000,
      items: [{ variantId: variant, quantity: 1, expectedPriceMinor: 135000 }],
    };
    async function checkout(actor, sale = payload) {
      const result = await db.query('select public.gr_pos_checked_checkout($1, $2::jsonb) as value',
        [actor, JSON.stringify(sale)]);
      return result.rows[0].value.receipt;
    }

    await assert.rejects(checkout(customer), { code: 'GR403' });
    await assert.rejects(checkout(suspended), { code: 'GR403' });
    await assert.rejects(checkout(cashier, { ...payload, method: 'card' }), { code: '22023' });
    await assert.rejects(checkout(cashier, {
      ...payload, items: [{ variantId: variant, quantity: 1, expectedPriceMinor: 120000 }],
    }), { code: '22023' });
    await assert.rejects(checkout(cashier, {
      ...payload, tenderedMinor: 500000,
      items: [{ variantId: variant, quantity: 3, expectedPriceMinor: 135000 }],
    }), { code: '23514' });
    assert.equal((await db.query('select count(*)::int as count from golden_rose.pos_sales')).rows[0].count, 0);

    const receipt = await checkout(cashier);
    assert.equal(receipt.changeMinor, 15000);
    assert.equal((await checkout(cashier)).saleId, receipt.saleId);
    assert.equal((await register(owner)).items[0].available, 1);
    assert.equal((await db.query('select count(*)::int as count from golden_rose.pos_sales')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int as count from golden_rose.stock_movements')).rows[0].count, 1);
  } finally {
    await db.close();
  }
});
