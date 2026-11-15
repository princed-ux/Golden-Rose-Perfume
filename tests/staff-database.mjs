import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');
const hash = text => createHash('sha256').update(text).digest('hex');
const migration = name => readFileSync('supabase/migrations/' + name, 'utf8');

test('employee invitations, role and store changes, and scoped POS transactions', async () => {
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
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    `);
    for (const filename of [
      '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
      '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
      '20261113182003_golden_rose_owner_access.sql',
      '20261114141541_golden_rose_atomic_cash_pos_register.sql',
      '20261114141844_golden_rose_pos_price_verification.sql',
      '20261114172002_golden_rose_pos_actor_authorization.sql',
      '20261115131653_golden_rose_staff_management.sql',
    ]) await db.exec(migration(filename));

    const [owner, otherOwner, cashier, shopper, expired, firstStore, otherStore, product, variant] =
      Array.from({ length: 9 }, randomUUID);
    const emails = ['owner', 'second', 'cashier', 'shopper', 'expired'].map(name => name + '@fixture.example');
    for (const [i, id] of [owner, otherOwner, cashier, shopper, expired].entries()) {
      await db.query('insert into auth.users (id,email,email_confirmed_at) values ($1,$2,now())', [id, emails[i]]);
    }
    await db.query("insert into golden_rose.staff_members(user_id,role,status) values ($1,'owner','active'),($2,'owner','active')", [owner, otherOwner]);
    await db.query("insert into golden_rose.locations(id,name,code) values ($1,'Test store','A'),($2,'Other store','B')", [firstStore, otherStore]);
    await db.query("insert into golden_rose.products(id,name,slug) values($1,'Fixture product','fixture-staff-test')", [product]);
    await db.query("insert into golden_rose.product_variants(id,product_id,sku,barcode,price_minor) values($1,$2,'007','00123',10000)", [variant, product]);
    await db.query("insert into golden_rose.stock_balances(variant_id,location_id,on_hand) values($1,$2,4),($1,$3,8)", [variant, firstStore, otherStore]);

    const call = async (sql, input = []) => (await db.query(sql, input)).rows[0]?.value;
    const login = async id => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const manage = (action, details = {}) => call('select public.gr_staff_manage($1,$2::jsonb) as value', [action, JSON.stringify(details)]);
    const accept = token => call('select public.gr_staff_invite_accept($1) as value', [token]);
    const valid = (token, email) => call('select public.gr_staff_invite_valid($1,$2) as value', [token, email]);
    const token = hash('cashier-invitation');
    const expiredToken = hash('expired-invitation');
    const details = { email: emails[2], username: 'cashier.test', fullName: 'Fixture Cashier', role:'cashier', locationId:firstStore, tokenHash:token };

    await login(shopper);
    await assert.rejects(manage('invite',details), { code:'42501' });
    await login(owner);
    await assert.rejects(manage('invite',{...details,role:'owner'}), { code:'22023' });
    await assert.rejects(manage('suspend',{id:otherOwner}), { code:'22023' });
    const invitation = await manage('invite',details);
    await assert.rejects(manage('invite',details), { code:'22023' });
    assert.equal((await manage('list')).invitations[0].status,'pending');
    assert.equal((await manage('list')).invitations[0].tokenHash,undefined);
    await manage('invite',{...details,email:emails[4],username:'',tokenHash:expiredToken});
    await db.exec('reset role');
    await db.query("update golden_rose_employment.invitations set expires_at=now()-interval '1 minute' where token_hash=$1", [expiredToken]);

    await db.exec('set role anon');
    assert.equal(await valid(token,emails[2]),true);
    assert.equal(await valid(token,emails[3]),false);
    await assert.rejects(accept(token), { code:'42501' });
    await login(expired);
    assert.equal(await valid(expiredToken,emails[4]),false);
    await assert.rejects(accept(expiredToken), { code:'22023' });
    await login(shopper);
    await assert.rejects(accept(token), { code:'22023' });
    await login(cashier);
    assert.equal(await accept(token),'cashier');
    assert.equal(await accept(token),'cashier');
    assert.equal(await valid(token,emails[2]),false);
    await assert.rejects(manage('list'), { code:'42501' });
    await assert.rejects(db.query('select count(*) from golden_rose_employment.profiles'), { code:'42501' });

    const pos = (id, action = 'catalog', payload = {}) => call(
      'select public.gr_pos_register($1,$2,$3::jsonb) as value', [id,action,JSON.stringify(payload)]);
    const cart = { idempotencyKey:randomUUID(), locationId:firstStore, method:'cash', discountMinor:0,
      tenderedMinor:15000, items:[{ variantId:variant, quantity:1, expectedPriceMinor:10000 }] };
    const checkout = (id, payload = cart) => call(
      'select public.gr_pos_checked_checkout($1,$2::jsonb) as value', [id,JSON.stringify(payload)]);
    const inventory = id => call('select public.gr_inventory_snapshot($1,50,0) as value',[id]);
    const session = id => call('select public.gr_staff_session($1) as value',[id]);
    await db.exec('set role service_role');
    await assert.rejects(pos(shopper), { code:'GR403' });
    await assert.rejects(checkout(shopper), { code:'GR403' });
    assert.equal((await pos(owner)).locations.length,2);
    assert.equal((await session(cashier)).locationId,firstStore);
    const catalogue = await pos(cashier,'catalog',{search:'00123'});
    assert.equal(catalogue.locations.length,1);
    assert.equal(catalogue.items[0].id,variant);
    assert.equal(catalogue.items[0].available,4);
    await assert.rejects(pos(cashier,'catalog',{ locationId:otherStore }), { code:'GR403' });
    await assert.rejects(inventory(cashier), { code:'42501' });
    await assert.rejects(checkout(cashier,{ ...cart,locationId:otherStore }), { code:'GR403' });
    const receipt = (await checkout(cashier)).receipt;
    assert.equal(receipt.changeMinor,5000);
    assert.equal((await checkout(cashier)).receipt.saleId,receipt.saleId);
    assert.equal((await pos(cashier)).items[0].available,3);

    await login(owner);
    const before = await manage('list');
    assert.equal(before.invitations.find(i=>i.id===invitation.id).status,'accepted');
    assert.equal(before.employees[0].username,'cashier.test');
    assert.equal(before.audit.filter(event=>event.action==='invite_accepted').length,1);
    await manage('suspend',{id:cashier});
    await db.exec('set role service_role');
    assert.equal((await session(cashier)).isStaff,false);
    await assert.rejects(pos(cashier), { code:'GR403' });
    await assert.rejects(checkout(cashier), { code:'GR403' });

    await login(owner);
    await manage('restore',{id:cashier});
    await manage('update',{id:cashier,role:'inventory_staff',locationId:otherStore});
    await db.exec('set role service_role');
    assert.equal((await session(cashier)).role,'inventory_staff');
    assert.deepEqual((await inventory(cashier)).locations.map(store=>store.id),[otherStore]);
    await assert.rejects(pos(cashier,'receipt',{saleId:receipt.saleId}), { code:'GR403' });
    await login(owner);
    await manage('revoke',{id:cashier});
    await assert.rejects(manage('restore',{id:cashier}), { code:'22023' });
    assert.equal((await manage('list')).employees[0].status,'revoked');
    await db.exec('set role service_role');
    assert.equal((await session(cashier)).isStaff,false);
    assert.equal((await session(otherOwner)).role,'owner');
  } finally {
    await db.close();
  }
});
