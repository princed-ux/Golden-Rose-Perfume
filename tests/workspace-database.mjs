import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');

test('workspace sales, receiving and CRM preserve amounts, store scopes and audit trails', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      grant usage on schema auth to service_role,authenticated;
      create table auth.users (id uuid primary key,email text unique,email_confirmed_at timestamptz,
        is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);
      create table auth.sessions (id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    `);
    for (const name of [
      '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
      '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
      '20261113182003_golden_rose_owner_access.sql',
      '20261114141541_golden_rose_atomic_cash_pos_register.sql',
      '20261114141844_golden_rose_pos_price_verification.sql',
      '20261114172002_golden_rose_pos_actor_authorization.sql',
      '20261115131653_golden_rose_staff_management.sql',
      '20261116132500_golden_rose_sales_history.sql',
      '20261116150000_golden_rose_customer_crm.sql',
    ]) await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));

    const [store, otherStore, product, variant] = Array.from({ length: 4 }, randomUUID);
    await db.query("insert into golden_rose.locations(id,name,code) values($1,'Fixture store A','A'),($2,'Fixture store B','B')", [store, otherStore]);
    await db.query("insert into golden_rose.products(id,name,slug) values($1,'Fixture fragrance','fixture-fragrance')", [product]);
    await db.query("insert into golden_rose.product_variants(id,product_id,sku,barcode,price_minor) values($1,$2,'0007','00123',12500)", [variant, product]);

    const users = {};
    for (const role of ['owner', 'manager', 'sales_staff', 'cashier', 'customer']) {
      const user = { id: randomUUID(), session: randomUUID() };
      users[role] = user;
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [user.id, role + '@fixture.example']);
      await db.query('insert into auth.sessions values($1,$2,now())', [user.session, user.id]);
      if (role !== 'customer') {
        await db.query("insert into golden_rose.staff_members(user_id,role,status,location_id) values($1,$2,'active',$3)",
          [user.id, role, role === 'owner' ? null : store]);
      }
    }
    const { owner, manager, sales_staff: seller, cashier, customer } = users;
    const json = async (sql, args) => (await db.query(sql, args)).rows[0].value;
    const setUser = async (user, session = user.session) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
        [user.id, JSON.stringify({ session_id: session })]);
    };
    const crm = (action, payload = {}) => json('select public.gr_crm_manage($1,$2::jsonb) as value', [action, JSON.stringify(payload)]);
    const sales = (user, action, payload = {}, session = user.session) => json(
      'select public.gr_sales_history($1,$2,$3,$4::jsonb) as value', [user.id, session, action, JSON.stringify(payload)]);
    const receive = (user, location, key) => json('select public.gr_receive_stock($1,$2,$3,8,$4) as value', [user.id, variant, location, key]);
    const buy = (user, location) => json('select public.gr_pos_checked_checkout($1,$2::jsonb) as value', [user.id, JSON.stringify({
      idempotencyKey: randomUUID(), locationId: location, method: 'cash', discountMinor: 1000, tenderedMinor: 30000,
      items: [{ variantId: variant, quantity: 2, expectedPriceMinor: 12500 }],
    })]);

    await db.exec('set role service_role');
    await assert.rejects(receive(cashier, store, 'fixture-denied'), { code: '42501' });
    await assert.rejects(receive(manager, otherStore, 'fixture-cross-store'), { code: '42501' });
    const adjustment = await receive(manager, store, 'fixture-receipt-a');
    assert.equal(await receive(manager, store, 'fixture-receipt-a'), adjustment);
    await receive(owner, otherStore, 'fixture-receipt-b');
    const first = (await buy(cashier, store)).receipt;
    const second = (await buy(owner, otherStore)).receipt;
    assert.deepEqual([first.subtotalMinor, first.discountMinor, first.totalMinor, first.tenderedMinor, first.changeMinor],
      [25000, 1000, 24000, 30000, 6000]);
    assert.deepEqual((await db.query('select on_hand from golden_rose.stock_balances where variant_id=$1 order by on_hand', [variant])).rows,
      [{ on_hand: 6 }, { on_hand: 6 }]);

    await db.exec('reset role');
    await db.query("update golden_rose.pos_sales set created_at='2026-11-15 23:30:00+00' where id=$1", [first.saleId]);
    await db.query("update golden_rose.pos_sales set created_at='2026-11-16 23:30:00+00' where id=$1", [second.saleId]);
    await db.query("update golden_rose.products set name='Renamed catalogue fixture' where id=$1", [product]);
    await db.exec('set role service_role');
    const day = await sales(owner, 'list', { from: '2026-11-16', to: '2026-11-16', search: '0007' });
    assert.deepEqual(day.items.map(item => item.saleId), [first.saleId]);
    assert.equal(day.items[0].units, 2);
    const page1 = await sales(owner, 'list', { limit: 1 });
    assert.equal(page1.hasMore, true);
    assert.equal(page1.items[0].saleId, second.saleId);
    assert.equal((await sales(owner, 'list', { limit: 1, offset: 1 })).items[0].saleId, first.saleId);
    assert.deepEqual((await sales(seller, 'list')).items.map(item => item.saleId), [first.saleId]);
    await assert.rejects(sales(manager, 'receipt', { saleId: second.saleId }), { code: 'P0002' });
    await assert.rejects(sales(seller, 'list', { locationId: otherStore }), { code: 'GR403' });
    await assert.rejects(sales(customer, 'list'), { code: 'GR403' });
    await assert.rejects(sales(owner, 'list', {}, cashier.session), { code: 'GR403' });
    const reprint = (await sales(manager, 'receipt', { saleId: first.saleId })).receipt;
    assert.equal(reprint.items[0].name, 'Fixture fragrance');
    assert.equal(reprint.totalMinor, first.totalMinor);

    await setUser(customer);
    await assert.rejects(crm('list'), { code: 'GR403' });
    await assert.rejects(sales(customer, 'list'), { code: '42501' });
    await setUser(cashier);
    await assert.rejects(crm('list'), { code: 'GR403' });
    await setUser(owner);
    await assert.rejects(db.query('select * from golden_rose_crm.customers'), { code: '42501' });
    const fields = { fullName: 'Fixture recipient', email: 'Recipient@fixture.example', phone: '', notes: '' };
    await assert.rejects(crm('create', { ...fields, email: 'invalid', locationId: store }), { code: '22023' });
    const firstContact = (await crm('create', { ...fields, locationId: store })).customer;
    assert.equal(firstContact.email, 'recipient@fixture.example');
    await assert.rejects(crm('create', { ...fields, locationId: store }), { code: '23505' });
    const otherContact = (await crm('create', { ...fields, fullName: 'Other fixture', locationId: otherStore })).customer;
    await setUser(seller);
    assert.deepEqual((await crm('list', { search: 'RECIPIENT' })).items.map(item => item.id), [firstContact.id]);
    await assert.rejects(crm('list', { locationId: otherStore }), { code: 'GR403' });
    await assert.rejects(crm('update', { ...fields, id: otherContact.id, updatedAt: otherContact.updatedAt }), { code: 'P0002' });
    await assert.rejects(crm('archive', firstContact), { code: 'GR403' });
    const edited = (await crm('update', { ...firstContact, fullName: 'Edited fixture' })).customer;
    await assert.rejects(crm('update', firstContact), { code: 'GR409' });
    await setUser(manager);
    const archived = (await crm('archive', edited)).customer;
    assert.equal(archived.status, 'archived');
    assert.equal((await crm('list', { status: 'active' })).items.length, 0);
    assert.equal((await crm('list', { status: 'archived' })).items[0].id, archived.id);
    assert.equal((await crm('restore', archived)).customer.status, 'active');

    await db.exec('reset role');
    const events = (await db.query('select action from golden_rose_crm.events where customer_id=$1', [firstContact.id])).rows;
    assert.deepEqual(events.map(event => event.action).sort(), ['archive', 'create', 'restore', 'update']);
    await db.query("update golden_rose.staff_members set status='suspended' where user_id=$1", [seller.id]);
    await setUser(seller);
    await assert.rejects(crm('list'), { code: 'GR403' });
    await db.exec('set role service_role');
    await assert.rejects(sales(seller, 'list'), { code: 'GR403' });
  } finally {
    await db.close();
  }
});
