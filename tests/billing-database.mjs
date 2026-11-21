import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');

test('billing preserves saved and issued snapshots and reconciles authorized, unique payments', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth;" +
    "grant usage on schema auth to authenticated,service_role;" +
    "create table auth.users (id uuid primary key,email text unique,email_confirmed_at timestamptz," +
    "is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);" +
    "create table auth.sessions (id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);" +
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
    "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;"
  );
  for (const name of [
    '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
    '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
    '20261113185953_golden_rose_owner_access.sql',
    '20261114141541_golden_rose_atomic_cash_pos_register.sql',
    '20261115131653_golden_rose_staff_management.sql',
    '20261116150000_golden_rose_customer_crm.sql',
    '20261117164015_golden_rose_billing.sql',
  ]) await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  const [a,b,product,variant,contact] = Array.from({length:5}, randomUUID);
  await db.query("insert into golden_rose.locations(id,name,code) values ($1,'Fixture A','A'),($2,'Fixture B','B')",[a,b]);
  await db.query("insert into golden_rose.products(id,name,slug,is_published) values ($1,'Fixture Perfume','fixture',true)",[product]);
  await db.query("insert into golden_rose.product_variants(id,product_id,sku,price_minor) values ($1,$2,'0009',12500)",[variant,product]);
  const users = {};
  for (const role of ['owner','manager','accountant','cashier','customer','suspended']) {
    const [id,session] = [randomUUID(),randomUUID()];
    users[role] = { id,session };
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,role+'@fixture.example']);
    await db.query("insert into auth.sessions values($1,$2,now())",[session,id]);
    if (role!=='customer') await db.query(
      "insert into golden_rose.staff_members(user_id,role,status,location_id) values($1,$2,$3,$4)",
      [id,role==='suspended'?'accountant':role,role==='suspended'?'suspended':'active',role==='owner'?null:a]
    );
  }
  await db.query("insert into golden_rose_crm.customers(id, location_id,full_name,email,created_by,updated_by)" +
    " values($1,$2,'Actual fixture recipient','contact@fixture.example',$3,$3)",[contact,a,users.owner.id]);
  const actAs = async (role, session = users[role].session) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [users[role].id,JSON.stringify({session_id:session})]);
  };
  const cmd = async (action, payload = {}) => (await db.query('select public.gr_billing($1,$2::jsonb) as value',
    [action, JSON.stringify(payload)])).rows[0].value;
  const change = (action,payload,requestKey=randomUUID()) => cmd(action, { ...payload, requestKey });
  const configure = {name:'Golden Rose fixture',address:'Fixture address',contact:'billing@fixture.example',taxBps:750,taxBasis:'Synthetic tax rule, test only'};
  const draft = {kind:'quotation',storeId:a,customerId:contact,recipient:'Client-supplied name',
    issueDate:'2026-01-01',dueDate:'2099-01-03',discountMinor:1000,terms:'On receipt',
    lines:[{variantId:variant,quantity:2,unitPriceMinor:1}],taxBps:10000,totalMinor:1};

  await t.test('only verified finance staff can use the ledger and assigned staff cannot cross stores', async () => {
    await db.exec('set role anon');
    await assert.rejects(cmd('list'),{code:'42501'});
    await db.exec('set role service_role');
    await assert.rejects(cmd('list'),{code:'42501'});
    for (const role of ['cashier','customer','suspended']) {
      await actAs(role);
      await assert.rejects(cmd('list'),{code:'GR403'});
    }
    await actAs('owner',users.cashier.session);
    await assert.rejects(cmd('list'),{code:'GR403'});
    await actAs('manager');
    await assert.rejects(cmd('list',{storeId:b}),{code:'GR403'});
    await assert.rejects(change('configure',{storeId:a,...configure}),{code:'GR403'});
    await assert.rejects(db.query('select * from golden_rose_billing.documents'),{code:'42501'});
    await actAs('accountant');
    assert.deepEqual((await cmd('customers',{storeId:a,search:'actual'})).map(c=>c.id),[contact]);
    await assert.rejects(cmd('customers',{storeId:b,search:'actual'}),{code:'GR403'});
  });

  let quote, invoice, direct;
  await t.test('draft prices, identity and tax come from the server and saves are idempotent', async () => {
    await actAs('manager');
    const unconfigured = await change('save',draft);
    assert.equal(unconfigured.tax_bps,null);
    await assert.rejects(change('accept',{id:unconfigured.id,revision:1,reason:'Confirmed by customer'}),{code:'GR409'});
    await actAs('owner');
    await change('configure',{storeId:a,...configure});
    await change('configure',{storeId:b,...configure,taxBps:0});
    const key=randomUUID();
    quote = await change('save',draft,key);
    assert.equal((await change('save',draft,key)).id,quote.id);
    await assert.rejects(change('save',{...draft,discountMinor:1001},key),{code:'GR409'});
    assert.equal((await cmd('get',{id:quote.id})).customer.recipient,'Actual fixture recipient');
    assert.deepEqual([quote.subtotal_minor,quote.tax_minor,quote.total_minor],[25000,1800,25800]);
    assert.deepEqual([quote.lines[0].sku,quote.lines[0].unitPriceMinor],['0009',12500]);
    quote = await change('save',{...draft,id:quote.id,revision:quote.revision,discountMinor:2000});
    assert.deepEqual([quote.revision,quote.tax_minor,quote.total_minor],[2,1725,24725]);
    await assert.rejects(change('save',{...draft,id:quote.id,revision:1}),{code:'GR409'});
    await assert.rejects(change('save',{...draft,storeId:b}),{code:'GR422'});
    await assert.rejects(change('save',{...draft,lines:[{description:'Impersonated item',sku:'0009',quantity:1,unitPriceMinor:1}]}),{code:'GR422'});
    await assert.rejects(change('save',{...draft,lines:[{description:'Invalid',quantity:1.2,unitPriceMinor:1}]}),{code:'GR422'});
    await assert.rejects(change('save',{...draft,dueDate:'2099-02-31'}),{code:'GR422'});
  });

  await t.test('accepted quotes are preserved; issue numbers are unique and immutable', async () => {
    await actAs('manager');
    await assert.rejects(change('convert',{id:quote.id}),{code:'GR409'});
    quote = await change('accept',{id:quote.id,revision:quote.revision,reason:'Verified fixture acceptance'});
    assert.equal(quote.state,'accepted');
    invoice = await change('convert',{id:quote.id,dueDate:'2099-01-05'});
    assert.equal((await change('convert',{id:quote.id,dueDate:'2099-01-05'})).id,invoice.id);
    assert.equal(invoice.original_quote_id,quote.id);
    assert.equal(invoice.total_minor,quote.total_minor);
    assert.equal(invoice.due_date,'2099-01-05');
    assert.equal((await cmd('list',{search:'GR-QT-'+quote.id})).documents[0].id,quote.id);
    await db.exec('reset role');
    await db.query("update golden_rose.product_variants set price_minor=45000 where id=$1",[variant]);
    await actAs('accountant');
    invoice = await change('issue',{id:invoice.id,revision:invoice.revision});
    assert.equal(invoice.invoice_number,1);
    assert.equal((await change('issue',{id:invoice.id,revision:1})).invoice_number,1);
    assert.equal(invoice.issuer.address,'Fixture address');
    assert.equal(invoice.lines[0].unitPriceMinor,12500);
    assert.equal((await cmd('get',{id:quote.id})).state,'accepted');
    await assert.rejects(change('save',{...draft,id:invoice.id,kind:'invoice',revision:invoice.revision}),{code:'GR409'});
    await db.exec('reset role');
    await assert.rejects(db.query("update golden_rose_billing.documents set notes='altered' where id=$1",[invoice.id]),{code:'GR409'});
    await actAs('owner');
    direct = await change('save',{...draft,kind:'invoice',storeId:b,customerId:null});
    direct = await change('issue',{id:direct.id,revision:direct.revision});
    assert.equal(direct.invoice_number,2);
    await actAs('manager');
    await assert.rejects(cmd('get',{id:direct.id}),{code:'GR404'});
    const filter = await cmd('list',{kind:'invoice',search:'GR-INV-1',status:'unpaid',storeId:a,from:invoice.issue_date,to:invoice.issue_date});
    assert.deepEqual(filter.documents.map(d=>d.id),[invoice.id]);
  });

  await t.test('only reconciled payments reduce balances; POS receipts and references cannot be double counted', async () => {
    await db.exec('reset role');
    const receipt = (await db.query("insert into golden_rose.pos_sales(idempotency_key,request_hash,location_id,performed_by," +
      "subtotal_minor,total_minor,tendered_minor,change_minor) values($1,repeat('0',32),$2,$3,10000,10000,15000,5000) returning sale_number",
      [randomUUID(),a,users.cashier.id])).rows[0].sale_number;
    await actAs('owner');
    await assert.rejects(change('apply_pos',{id:direct.id,receiptNumber:receipt}),{code:'GR404'});
    const key=randomUUID();
    let paid = await change('apply_pos',{id:invoice.id,receiptNumber:receipt},key);
    assert.equal((await change('apply_pos',{id:invoice.id,receiptNumber:receipt},key)).paid_minor,10000);
    assert.deepEqual([paid.paid_minor,paid.balance_minor,paid.status],[10000,14725,'partially_paid']);
    await assert.rejects(change('apply_pos',{id:invoice.id,receiptNumber:receipt}),{code:'GR409'});
    await assert.rejects(change('propose_payment',{id:invoice.id,amountMinor:14726,reference:'BANK-12',evidence:'Fixture statement entry'}),{code:'GR409'});
    paid = await change('propose_payment',{id:invoice.id,amountMinor:14725,reference:'BANK-12',evidence:'Fixture statement entry'});
    assert.equal(paid.balance_minor,14725);
    const paymentId=paid.payments.find(event=>event.source==='offline').id;
    await assert.rejects(change('review_payment',{id:invoice.id,paymentId,decision:'verified',reason:'Fixture check'}),{code:'GR409'});
    await actAs('manager');
    await assert.rejects(change('review_payment',{id:invoice.id,paymentId,decision:'verified',reason:'Fixture check'}),{code:'GR403'});
    await actAs('accountant');
    await assert.rejects(change('propose_payment',{id:invoice.id,amountMinor:1,reference:'bank-12',evidence:'Repeated statement entry'}),{code:'GR409'});
    paid = await change('review_payment',{id:invoice.id,paymentId,decision:'verified',reason:'Fixture evidence matched'});
    assert.deepEqual([paid.paid_minor,paid.balance_minor,paid.status],[24725,0,'paid']);
    await actAs('owner');
    await assert.rejects(change('void',{id:invoice.id,reason:'Fixture'}),{code:'GR409'});
    direct = await change('void',{id:direct.id,reason:'Fixture amendment'});
    assert.deepEqual([direct.status,direct.invoice_number,direct.balance_minor],['voided',2,null]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as count from golden_rose.pos_sales')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int as count from golden_rose.stock_movements')).rows[0].count,0);
    assert.equal((await db.query("select count(*)::int as count from golden_rose_billing.events where action='issue'")).rows[0].count,2);
  });
});
