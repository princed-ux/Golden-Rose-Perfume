import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);
const { PGlite } = load(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');

test('owner-only bulk RPC stages, cancels, resumes and imports without duplicates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage; create schema golden_rose;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table golden_rose.staff_members(user_id uuid primary key,role text,status text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert on storage.objects to authenticated;
      create table golden_rose.brands(id uuid primary key,name text,slug text unique,description text);
      create table golden_rose.categories(id uuid primary key,name text,slug text unique);
      create table golden_rose.products(id uuid primary key,name text,slug text unique,description text,brand_id uuid,
        category_id uuid,is_published boolean,updated_at timestamptz,odoo_template_id bigint unique);
      create table golden_rose.product_variants(id uuid primary key,product_id uuid references golden_rose.products(id),
        name text,sku text,barcode text unique,size_ml numeric,price_minor bigint,cost_minor bigint,
        currency text,updated_at timestamptz,odoo_variant_id bigint unique);
      create unique index sku_unique on golden_rose.product_variants(lower(sku));
      create table golden_rose.stock_movements(id uuid primary key);
    `);
    const filename = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_bulk_data_import_foundation.sql'));
    await db.exec(fs.readFileSync('supabase/migrations/' + filename, 'utf8'));
    const owner = randomUUID();
    const cashier = randomUUID();
    const suspended = randomUUID();
    await db.query('insert into auth.users values ($1),($2),($3)', [owner, cashier, suspended]);
    await db.query("insert into golden_rose.staff_members values ($1,'owner','active'),($2,'cashier','active'),($3,'owner','suspended')", [owner,cashier,suspended]);
    const rpc = async (action, payload = {}) => (await db.query('select public.gr_bulk_import($1,$2::jsonb) as result', [action, JSON.stringify(payload)])).rows[0].result;
    const claim = async user => db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role anon');
    await assert.rejects(rpc('history'), /permission denied/i);
    await db.exec('set role authenticated');
    for (const user of [cashier,suspended,randomUUID()]) {
      await claim(user);
      await assert.rejects(rpc('history'), /Active owner access required/);
      await assert.rejects(db.exec("insert into storage.objects values ('golden-rose-imports','unsolicited.csv')"), /row-level security/);
    }
    await claim(owner);

    const source = 'fixture-erp';
    const items = Array.from({ length: 401 }, (_, i) => ({ row: i + 2, externalId: 'p-' + i, name: 'Synthetic product ' + i }));
    const params = { source, kind:'template', fingerprint:'a'.repeat(64), filename:'products.csv', extension:'csv', expected:items.length };
    const job = await rpc('begin', params);
    assert.equal((await rpc('begin',params)).id,job.id);
    await db.query("insert into storage.objects values ('golden-rose-imports',$1)", [job.objectPath]);
    const stage = rows => rpc('stage', { job:job.id, rows: rows.map(data=>({ row:data.row,status:'new',data })) });
    await stage(items.slice(0,200));
    await stage(items.slice(0,200));
    await assert.rejects(rpc('ready',{job:job.id}), /incomplete/);
    await stage(items.slice(200,400));
    await stage(items.slice(400));
    assert.equal((await rpc('ready',{job:job.id})).pending,401);
    assert.equal((await rpc('apply',{job:job.id})).new,200);
    assert.equal((await rpc('cancel',{job:job.id})).status,'cancelled');
    assert.equal((await rpc('apply',{job:job.id})).new,200);
    assert.equal((await rpc('resume',{job:job.id})).status,'ready');
    assert.equal((await rpc('apply',{job:job.id})).new,400);
    assert.equal((await rpc('apply',{job:job.id})).status,'complete');
    assert.equal((await rpc('apply',{job:job.id})).new,401);
    assert.equal((await rpc('preflight',{source,kind:'template',rows:items.slice(0,1)})).results[0].status,'updated');
    const variant = { row:2,externalId:'v-1',parentExternalId:'p-0',sku:'0001',currency:'NGN',priceMinor:990050,sizeMl:50 };
    assert.equal((await rpc('preflight',{source,kind:'variant',rows:[{...variant,parentExternalId:'unknown'}]})).results[0].status,'invalid');
    for (const fingerprint of ['b'.repeat(64),'c'.repeat(64)]) {
      const next = await rpc('begin',{source,kind:'variant',fingerprint,filename:'variants.csv',extension:'csv',expected:1});
      await db.query("insert into storage.objects values ('golden-rose-imports',$1)", [next.objectPath]);
      await rpc('stage',{job:next.id,rows:[{row:2,status:'new',data:variant}]});
      await rpc('ready',{job:next.id});
      await rpc('apply',{job:next.id});
    }
    await db.exec('reset role');
    const result = (await db.query(`select
      (select count(*)::int from golden_rose.products) as products,
      (select count(*)::int from golden_rose.product_variants) as variants,
      (select count(*)::int from golden_rose.products where is_published) as published,
      (select count(*)::int from golden_rose.stock_movements) as movements,
      (select count(*)::int from auth.users) as users`)).rows[0];
    assert.deepEqual(result,{ products:401,variants:1,published:0,movements:0,users:3 });
  } finally {
    await db.close();
  }
});
