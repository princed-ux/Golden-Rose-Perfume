import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');

test('catalogue changes flow to the shop, inventory, POS and sales history without changing their identities', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;" +
    "create schema auth; grant usage on schema auth to authenticated,service_role;" +
    "create table auth.users (id uuid primary key,email text unique,email_confirmed_at timestamptz," +
    "is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);" +
    "create table auth.sessions (id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);" +
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
    "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;" +
    "create schema storage; grant usage on schema storage to service_role;" +
    "create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);" +
    "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); grant select on storage.objects to service_role;"
  );
  for (const migration of [
    '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
    '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
    '20261112163007_customer_shopping_and_catalogue_photos.sql',
    '20261113182003_golden_rose_owner_access.sql',
    '20261114141541_golden_rose_atomic_cash_pos_register.sql',
    '20261114141844_golden_rose_pos_price_verification.sql',
    '20261114172002_golden_rose_pos_actor_authorization.sql',
    '20261115131653_golden_rose_staff_management.sql',
    '20261116132500_golden_rose_sales_history.sql',
    '20261116180311_golden_rose_catalogue_management.sql',
  ]) await db.exec(readFileSync(new URL('../supabase/migrations/' + migration, import.meta.url),'utf8'));

  const [store, otherStore] = Array.from({length:2},randomUUID);
  await db.query("insert into golden_rose.locations(id,name,code) values ($1,'Fixture shop','FIX'),($2,'Other shop','OTHER')",[store,otherStore]);
  const users = {};
  for (const role of ['owner','manager','inventory_staff','cashier','customer','suspended']) {
    const id = randomUUID(), session = randomUUID();
    users[role] = { id,session };
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,role+'@fixture.example']);
    await db.query('insert into auth.sessions values($1,$2,now())',[session,id]);
    if (role !== 'customer') await db.query(
      'insert into golden_rose.staff_members(user_id,role,status,location_id) values($1,$2,$3,$4)',
      [id,role === 'suspended' ? 'manager' : role,role === 'suspended' ? 'suspended' : 'active',role === 'owner' ? null : store]);
  }
  const json = async (sql,params) => (await db.query(sql,params)).rows[0].value;
  const act = async (role, session = users[role].session) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [users[role].id,JSON.stringify({session_id:session})]);
  };
  const catalog = (action,payload={}) => json('select public.gr_manage_catalogue($1,$2::jsonb) as value',[action,JSON.stringify(payload)]);
  const change = (action,payload,requestId=randomUUID()) => catalog(action,{...payload,requestId});
  const storefront = () => json('select public.gr_public_catalog(30,0,$1) as value',['Fixture fragrance']);
  const pos = (search) => json('select public.gr_pos_register($1,$2,$3::jsonb) as value',
    [users.cashier.id,'catalog',JSON.stringify({search,locationId:store})]);
  const receive = (role,location,variant,key) => json('select public.gr_receive_stock($1,$2,$3,4,$4) as value',
    [users[role].id,variant,location,key]);
  const fields = {
    name:'Fixture fragrance',slug:'fixture-fragrance',brandName:'Fixture brand',categoryName:'Fixture category',
    description:'Original fragrance description',sku:'000123',barcode:'0000012345',sizeMl:'50.25',
    variantName:'Travel',concentration:'EDP',priceMinor:195575,
  };
  let product, variantId, nextVariantId;
  const current = () => ({ productId: product.productId, revision: product.revision });

  await t.test('roles, validation, duplicate SKUs/barcodes and safe retries', async () => {
    await db.exec('set role anon');
    await assert.rejects(catalog('list'),{code:'42501'});
    for (const role of ['customer','cashier','suspended']) {
      await act(role);
      await assert.rejects(change('create',fields),{code:'GR403'});
    }
    await act('inventory_staff');
    assert.equal((await catalog('list')).total,0);
    await assert.rejects(change('create',fields),{code:'GR403'});
    await act('owner',users.cashier.session);
    await assert.rejects(catalog('list'),{code:'GR403'});
    await act('owner');
    await assert.rejects(db.query('select * from golden_rose_catalogue.changes'),{code:'42501'});
    await assert.rejects(change('create',{...fields,sizeMl:'3.999'}),{code:'GR422'});
    await assert.rejects(change('create',{...fields,priceMinor:19.55}),{code:'GR422'});
    await assert.rejects(change('create',{...fields,priceMinor:0}),{code:'GR422'});
    const key=randomUUID();
    product=await change('create',{...fields,published:true},key);
    assert.equal(product.published,false);
    assert.equal((await change('create',{...fields,published:true},key)).productId,product.productId);
    await assert.rejects(change('create',{...fields,published:false},key),{code:'GR409'});
    assert.equal((await catalog('list',{search:'0000012345',publication:'draft'})).items[0].productId,product.productId);
    assert.equal((await catalog('list')).total,1);
    [variantId]=product.variants.map(variant=>variant.variantId);
    const variant=product.variants[0];
    assert.deepEqual([variant.sku,variant.barcode,variant.sizeMl,variant.priceMinor,variant.name],
      ['000123','0000012345',50.25,195575,'Travel']);
    await assert.rejects(change('create',{...fields,slug:'duplicate-sku',barcode:'changed'}),{code:'GR409',message:/SKU/});
    await assert.rejects(change('create',{...fields,slug:'duplicate-barcode',sku:'DIFFERENT'}),{code:'GR409',message:/barcode/});
    assert.equal((await catalog('list')).total,1);
    await db.exec('reset role');
    assert.equal(await json('select count(*)::integer as value from golden_rose.stock_balances'),0);
    await db.exec('set role service_role');
    assert.equal((await storefront()).items.length,0);
  });

  await t.test('product and variant editing preserve IDs and control storefront publication', async () => {
    await act('manager');
    const previous=current();
    product=await change('details',{...fields,...previous,name:'Fixture fragrance edited',slug:'fixture-fragrance-edited',
      description:'Edited fragrance description'});
    assert.equal(product.productId,previous.productId);
    assert.equal(product.variants[0].variantId,variantId);
    assert.equal((await catalog('get',{productId:product.productId})).description,'Edited fragrance description');
    await assert.rejects(change('details',{...fields,...previous}),{code:'GR409',message:/changed/});
    product=await change('variant',{...fields,...current(),variantId,active:true,priceMinor:225599});
    assert.equal(product.variants[0].priceMinor,225599);
    const otherVariant={...fields,sku:'00100',barcode:'0000012355',sizeMl:'100',variantName:'Full bottle',active:true};
    product=await change('variant',{...otherVariant,...current()});
    nextVariantId=product.variants.find(variant=>variant.sku==='00100').variantId;
    assert.notEqual(nextVariantId,variantId);
    await assert.rejects(change('variant',{...fields,...current(),variantId:nextVariantId,active:true}),{code:'GR409',message:/SKU/});
    await assert.rejects(change('variant',{...fields,...current(),variantId:randomUUID(),active:true}),{code:'GR404'});
    product=await change('publication',{...current(),published:true});
    await db.exec('set role service_role');
    const publicProduct=(await storefront()).items[0];
    assert.equal(publicProduct.slug,'fixture-fragrance-edited');
    assert.equal(publicProduct.variants.find(variant=>variant.id===variantId).priceMinor,225599);
    assert.equal((await pos('0000012345')).items[0].available,0);
  });

  await t.test('receiving and checkout keep accurate stock, receipt, prices and permissions', async () => {
    await assert.rejects(receive('customer',store,variantId,'fixture-denied-customer'),{code:'42501'});
    await assert.rejects(receive('cashier',store,variantId,'fixture-denied-cashier'),{code:'42501'});
    await assert.rejects(receive('manager',otherStore,variantId,'fixture-receive-cross-store'),{code:'42501'});
    const movement=await receive('manager',store,variantId,'fixture-catalogue-receipt');
    assert.equal(await receive('manager',store,variantId,'fixture-catalogue-receipt'),movement);
    assert.deepEqual((await pos('0000012345')).items.map(item=>[item.id,item.available,item.priceMinor]),[[variantId,4,225599]]);
    assert.equal((await pos('Fixture fragrance edited')).items.length,2);
    const payload={idempotencyKey:randomUUID(),locationId:store,method:'cash',discountMinor:0,tenderedMinor:230000,
      items:[{variantId,quantity:1,expectedPriceMinor:225599}]};
    const sell=(role,request)=>json('select public.gr_pos_checked_checkout($1,$2::jsonb) as value',[users[role].id,JSON.stringify(request)]);
    await assert.rejects(sell('customer',payload),{code:'GR403'});
    await assert.rejects(sell('cashier',{...payload,items:[{variantId,quantity:1,expectedPriceMinor:195575}]}),{code:'22023'});
    const {receipt}=await sell('cashier',payload);
    assert.deepEqual([receipt.totalMinor,receipt.changeMinor],[225599,4401]);
    assert.equal((await sell('cashier',payload)).receipt.saleId,receipt.saleId);
    assert.equal((await pos('0000012345')).items[0].available,3);
    const history=await json('select public.gr_sales_history($1,$2,$3,$4::jsonb) as value',
      [users.owner.id,users.owner.session,'list',JSON.stringify({search:'000123'})]);
    assert.equal(history.items[0].saleId,receipt.saleId);
    await act('owner');
    product=await change('variant',{...fields,...current(),variantId,active:false,priceMinor:225599});
    await assert.rejects(change('variant',{...fields,...current(),variantId:nextVariantId,sku:'00100',barcode:'0000012355',active:false}),
      {code:'GR409',message:/active variant/});
    product=await change('publication',{...current(),published:false});
    await db.exec('reset role');
    assert.equal(await json('select on_hand as value from golden_rose.stock_balances where variant_id=$1',[variantId]),3);
    await db.exec('set role service_role');
    assert.equal((await storefront()).items.length,0);
    assert.equal((await pos('0000012345')).items.length,0);
  });
});
