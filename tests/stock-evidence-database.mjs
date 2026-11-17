import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');

test('the read-only proposal exposes dates and stock evidence without initializing quantities', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;' +
    'create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,' +
    'is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);' +
    'create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);' +
    'create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;' +
    "create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;");
  for (const name of [
    '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
    '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
    '20261113182003_golden_rose_owner_access.sql',
    '20261114141541_golden_rose_atomic_cash_pos_register.sql',
    '20261115131653_golden_rose_staff_management.sql',
  ]) await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));

  const [owner, manager, store, otherStore, product, variant] = Array.from({ length: 6 }, randomUUID);
  await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())", [owner, manager]);
  await db.query("insert into golden_rose.locations(id,name,code) values($1,'Primary fixture','A'),($2,'Other fixture','B')", [store, otherStore]);
  await db.query("insert into golden_rose.staff_members(user_id,role,status,location_id) values($1,'owner','active',null),($2,'manager','active',$3)",
    [owner, manager, store]);
  await db.query("insert into golden_rose.products(id,name,slug) values($1,'Catalogue fixture','catalogue-fixture')", [product]);
  await db.query("insert into golden_rose.product_variants(id,product_id,sku,barcode,size_ml,price_minor) values($1,$2,'0007','000123',50.5,12500)",
    [variant,product]);

  await db.exec(readFileSync(new URL('../docs/sql/stock-count-visibility.sql', import.meta.url), 'utf8'));
  const json = async (sql, args) => (await db.query(sql, args)).rows[0].value;
  assert.equal(await json('select count(*)::integer as value from golden_rose.stock_balances'), 0);
  assert.equal(await json('select count(*)::integer as value from golden_rose.stock_movements'), 0);
  assert.equal(await json('select count(*)::integer as value from golden_rose.stock_count_observations'), 0);

  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.gr_inventory_snapshot($1,100,0)', [owner]), { code: '42501' });
  await db.exec('set role service_role');
  const catalogue = await json('select public.gr_admin_products($1,100,0) as value', [owner]);
  assert.ok(catalogue.items[0].createdAt && catalogue.items[0].updatedAt && catalogue.items[0].variants[0].createdAt);
  assert.equal(catalogue.items[0].variants[0].barcode, '000123');
  const snapshot = (actor) => json('select public.gr_inventory_snapshot($1,100,0) as value', [actor]);
  const before = await snapshot(owner);
  assert.equal(before.items.length, 2);
  assert.ok(before.items.every(row => !row.balanceRecorded && row.countEvidence === null));
  assert.deepEqual((await snapshot(manager)).items.map(row => row.locationId), [store]);
  await assert.rejects(db.query('delete from golden_rose.stock_count_observations'), { code: '42501' });

  await db.exec('reset role');
  await db.query("insert into golden_rose.stock_count_observations(variant_id,location_id,on_hand,counted_at,verified_by) values($1,$2,0,now()-interval '1 day',$3)",
    [variant,store,owner]);
  await db.exec('set role service_role');
  assert.equal((await snapshot(manager)).items[0].countEvidence,'verified-zero');
  await db.query("select public.gr_receive_stock($1,$2,$3,2,'stock-evidence-fixture-receipt')",[owner,variant,store]);
  assert.equal((await snapshot(manager)).items[0].available,2);
  await db.query("select public.gr_sell_stock($1,$2,$3,2,'stock-evidence-fixture-sale')",[owner,variant,store]);
  const [after] = (await snapshot(manager)).items;
  assert.deepEqual([after.onHand,after.balanceRecorded,after.countEvidence],[0,true,'observed']);
});
