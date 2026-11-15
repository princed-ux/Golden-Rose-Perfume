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
        is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb,encrypted_password text);
      create table auth.sessions (id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    `);
    for (const filename of [
      '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
      '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
      '20261113182003_golden_rose_owner_access.sql',
      '20261114141541_golden_rose_atomic_cash_pos_register.sql',
      '20261114141844_golden_rose_pos_price_verification.sql',
      '20261114172002_golden_rose_pos_actor_authorization.sql',
      '20261115131653_golden_rose_staff_management.sql',
      '20261115170000_owner_created_employee_accounts.sql',
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

    // Auth emulator: the only simulated operations are Admin user/password writes
    // and confirmation. All membership, authorization and session checks are real SQL.
    const [directUser, directSession, currentSession, replacementSession, finalSession] = Array.from({ length: 5 }, randomUUID);
    const payload = { fullName: 'Direct Cashier', email: 'direct@fixture.example', username: 'direct.cashier', role: 'cashier', locationId: firstStore };
    const provision = (actor, action, input) => call(
      'select public.gr_owner_employee_account($1,$2,$3::jsonb) as value', [actor, action, JSON.stringify(input)]);
    const credentials = (id, sid) => call('select public.gr_employee_session_allowed($1,$2) as value',[id,sid]);
    const passwordState = async (id, sid, finish=false) => {
      if (finish) {
        await db.exec('set role service_role');
        return call('select public.gr_employee_password_complete($1,$2) as value',[id,sid]);
      }
      await login(id);
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})]);
      return call('select public.gr_employee_password_state() as value');
    };
    const addSession = async (id, sid) => {
      await db.exec('reset role');
      await db.query('insert into auth.sessions values ($1,$2,clock_timestamp())',[sid,id]);
    };

    await login(owner);
    await assert.rejects(provision(owner,'reserve',payload), { code:'42501' });
    await db.exec('set role service_role');
    await assert.rejects(provision(shopper,'reserve',payload), { code:'42501' });
    await assert.rejects(provision(cashier,'reserve',payload), { code:'42501' });
    await assert.rejects(provision(owner,'reserve',{...payload,email:emails[3]}), { code:'22023' });
    const held = await provision(owner,'reserve',payload);
    assert.equal(held.userId, null);
    await assert.rejects(provision(owner,'complete_creation',{...payload,id:shopper}), {code:'22023'});
    await db.exec('reset role');
    await db.query('insert into auth.users (id,email,raw_app_meta_data,encrypted_password) values ($1,$2,$3,$4)',
      [directUser,payload.email,JSON.stringify({gr_staff_provision:held.version}),'fixture-initial-hash']);
    await db.exec('set role service_role');
    assert.deepEqual(await provision(otherOwner,'reserve',payload),{ version:held.version, userId:directUser });
    await provision(otherOwner,'complete_creation',{...payload,id:directUser});
    await assert.rejects(provision(owner,'reserve',payload), { code:'22023' });
    assert.equal((await session(directUser)).isStaff,false);
    assert.equal(await credentials(directUser,null),false);
    await assert.rejects(pos(directUser), { code:'GR403' });
    assert.equal(await credentials(owner,null),true);
    assert.equal((await pos(owner)).locations.length,2);
    assert.equal((await provision(owner,'list',{}))[directUser],'awaiting_verification');
    await login(owner);
    await assert.rejects(manage('restore',{id:directUser}), { code:'22023' });

    await addSession(directUser,directSession);
    await login(directUser);
    await assert.rejects(call('select public.gr_employee_password_complete($1,$2) as value',[directUser,directSession]),{code:'42501'});
    assert.equal(await passwordState(directUser,directSession,true),'denied');
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[directUser]);
    assert.equal(await passwordState(directUser,directSession),'change_required');
    assert.equal(await passwordState(directUser,directSession,true),'change_required');
    await db.exec('reset role');
    await db.query("update auth.users set encrypted_password='fixture-changed-hash' where id=$1",[directUser]);
    assert.equal(await passwordState(directUser,directSession,true),'complete');
    await db.exec('set role service_role');
    assert.equal((await session(directUser)).role,'cashier');
    assert.equal(await credentials(directUser,directSession),false);
    await addSession(directUser,currentSession);
    await db.exec('set role service_role');
    assert.equal(await credentials(directUser,currentSession),true);
    assert.deepEqual((await pos(directUser)).locations.map(store=>store.id),[firstStore]);

    const reset = await provision(owner,'begin_reset',{id:directUser});
    await assert.rejects(provision(owner,'begin_reset',{id:directUser}), { code:'22023' });
    await assert.rejects(provision(owner,'begin_reset',{id:otherOwner}), { code:'22023' });
    await assert.rejects(provision(owner,'complete_reset',{id:directUser,version:reset.version}), {code:'22023'});
    assert.equal(await credentials(directUser,currentSession),false);
    await assert.rejects(pos(directUser), { code:'GR403' });
    await db.exec('reset role');
    await db.query("update auth.users set encrypted_password='fixture-replacement-hash',raw_app_meta_data=raw_app_meta_data || $2::jsonb where id=$1",
      [directUser,JSON.stringify({gr_staff_reset:reset.version})]);
    await db.exec('set role service_role');
    await provision(owner,'complete_reset',{id:directUser,version:reset.version});
    await addSession(directUser,replacementSession);
    assert.equal(await passwordState(directUser,currentSession,true),'denied');
    assert.equal(await passwordState(directUser,replacementSession,true),'change_required');
    await db.exec('reset role');
    await db.query("update auth.users set encrypted_password='fixture-final-hash' where id=$1",[directUser]);
    assert.equal(await passwordState(directUser,replacementSession,true),'complete');
    await addSession(directUser,finalSession);
    await db.exec('set role service_role');
    assert.equal(await credentials(directUser,finalSession),true);
    assert.equal(await credentials(directUser,replacementSession),false);
    await login(owner);
    const audit = (await manage('list')).audit;
    for (const event of ['account_created','temporary_password_replaced','password_changed']) assert.ok(audit.some(entry=>entry.action===event));
    await manage('suspend',{id:directUser});
    await db.exec('set role service_role');
    assert.equal((await session(directUser)).isStaff,false);
    await assert.rejects(pos(directUser), {code:'GR403'});
  } finally {
    await db.close();
  }
});
