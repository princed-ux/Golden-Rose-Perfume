import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);
const { PGlite } = load(process.env.GR_PGLITE_MODULE || '@electric-sql/pglite');
const readMigration = suffix => fs.readFileSync('supabase/migrations/' + fs.readdirSync('supabase/migrations').find(name => name.endsWith(suffix)), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema golden_rose;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous bool,banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table golden_rose.staff_members(user_id uuid primary key,role text,status text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
      create policy broad_fixture_policy on storage.objects for all to anon,authenticated using (true) with check (true);
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
    await db.exec(readMigration('_bulk_data_import_foundation.sql'));
    await db.exec(readMigration('_golden_rose_owner_access.sql'));
    return db;
  } catch (error) {
    await db.close();
    const position = Number(error.position || 0);
    const excerpt = position && error.query ? error.query.slice(Math.max(0,position - 100),position + 75) : '';
    throw new Error([error.message,error.where,excerpt].filter(Boolean).join('\n'));
  }
}

async function query(db, sql, values = []) {
  return (await db.query(sql,values)).rows;
}

function call(db, procedure) {
  return async (action, payload = {}) =>
    (await query(db,'select ' + procedure + '($1,$2::jsonb) as value',[action,JSON.stringify(payload)]))[0].value;
}

function claim(db, user) {
  return query(db,"select set_config('request.jwt.claim.sub',$1,false)",[user]);
}

function jobParams(tag, source = 'fixture-erp', kind = 'template', expected = 1) {
  const sourceHash = hash(tag);
  return {
    source, kind, expected, sourceHash, fingerprint: hash(sourceHash + ':'), filename: 'export.csv', extension: 'csv', entry: null,
    currency: kind === 'variant' ? 'NGN' : '', review: hash('review-' + tag),
    mapping: kind === 'variant' ? { externalId:0,parentExternalId:1,sku:2,priceMinor:3,sizeMl:4,databaseId:5 }
      : { externalId:0,name:1,databaseId:2 },
  };
}

test('server-only jobs validate metadata, rows, retries, permissions and repeat imports', async () => {
  const db = await fixture();
  try {
    const owner = randomUUID(), cashier = randomUUID(), suspended = randomUUID();
    await db.query("insert into auth.users(id) values ($1),($2),($3)",[owner,cashier,suspended]);
    await db.query("insert into golden_rose.staff_members(user_id,role,status) values ($1,'owner','active'),($2,'cashier','active'),($3,'owner','suspended')",[owner,cashier,suspended]);
    const invoke = call(db,'public.gr_bulk_import');
    const rpc = (action,payload) => invoke(action,{ ...payload,actor:owner });
    const upload = path => db.query("insert into storage.objects values ('golden-rose-imports',$1)",[path]);
    const params = jobParams('many','fixture-erp','template',401);

    for (const role of ['anon','authenticated']) {
      await db.exec('set role ' + role);
      await claim(db,owner);
      await assert.rejects(rpc('begin',params),/permission denied/i);
      await assert.rejects(upload('untrusted.csv'),/row-level security/i);
    }
    await db.exec('set role service_role');
    for (const actor of [cashier,suspended,randomUUID()]) await assert.rejects(invoke('history',{actor}),/Active owner access required/);

    const job = await rpc('begin',params);
    assert.equal((await rpc('begin',{...params,filename:'renamed.csv'})).id,job.id);
    assert.notEqual((await rpc('begin',{...params,source:'another-erp'})).id,job.id);
    assert.notEqual((await rpc('begin',{...params,kind:'category'})).id,job.id);
    await assert.rejects(rpc('begin',{...params,mapping:{...params.mapping,name:3}}),/different import metadata/);
    await assert.rejects(rpc('find',{...params,expected:10}),/different import metadata/);
    await assert.rejects(rpc('begin',{...params,sourceHash:hash('forged')}),/check constraint/);
    const items = Array.from({length:401},(_,i)=>({row:i+2,externalId:'p-'+i,databaseId:String(i+1),name:'Synthetic '+i}));
    const stage = (rows, review=params.review) => rpc('stage',{job:job.id,review,rows:rows.map(data=>({row:data.row,status:'new',data}))});
    await assert.rejects(stage(items.slice(0,1)),/Invalid staging batch/);
    await upload(job.objectPath);
    await db.exec('set role authenticated');
    assert.equal((await query(db,"select name from storage.objects where bucket_id='golden-rose-imports'")).length,0);
    await assert.rejects(db.exec("select * from golden_rose_import.jobs"),/permission denied/);
    await db.exec('set role service_role');
    await assert.rejects(stage(items.slice(0,1),hash('different-review')),/source review/);
    await assert.rejects(stage([items[0],{...items[1],priceMinor:123}]),/Unexpected or invalid field/);
    assert.equal((await rpc('job',{job:job.id})).staged,0);
    await stage(items.slice(0,200));
    await stage(items.slice(0,200));
    await assert.rejects(stage([{...items[0],name:'Conflicting retry'}]),/Retry conflicts/);
    const renewed = hash('new-review');
    assert.equal((await rpc('begin',{...params,review:renewed})).id,job.id);
    assert.equal((await rpc('job',{job:job.id})).staged,0);
    await assert.rejects(stage(items.slice(0,1)),/source review/);
    assert.equal((await rpc('begin',params)).id,job.id);
    await stage(items.slice(0,200));
    await assert.rejects(rpc('ready',{job:job.id,review:params.review}),/incomplete/);
    await stage(items.slice(200,400));
    await stage(items.slice(400));
    await rpc('cancel',{job:job.id});
    assert.equal((await rpc('resume',{job:job.id})).status,'uploading');
    assert.equal((await rpc('ready',{job:job.id,review:params.review})).pending,401);
    await db.exec('reset role');
    await db.exec(`create function golden_rose_import.fixture_interrupt() returns trigger language plpgsql as $$
      begin if new.name='Synthetic 1' then raise exception 'Synthetic interruption'; end if; return new; end;
      $$;
      create trigger fixture_interrupt before insert on golden_rose.products for each row execute function golden_rose_import.fixture_interrupt();`);
    await db.exec('set role service_role');
    await assert.rejects(rpc('apply',{job:job.id}),/Synthetic interruption/);
    assert.equal((await rpc('job',{job:job.id})).pending,401);
    await db.exec('reset role');
    assert.equal((await query(db,'select count(*)::int as count from golden_rose_import.source_links'))[0].count,0);
    assert.equal((await query(db,'select count(*)::int as count from golden_rose.products'))[0].count,0);
    await db.exec('drop trigger fixture_interrupt on golden_rose.products');
    await db.exec('set role service_role');
    assert.equal((await rpc('apply',{job:job.id})).new,200);
    assert.equal((await rpc('cancel',{job:job.id})).status,'cancelled');
    assert.equal((await rpc('apply',{job:job.id})).new,200);
    assert.equal((await rpc('resume',{job:job.id})).status,'ready');
    assert.equal((await rpc('apply',{job:job.id})).new,400);
    assert.equal((await rpc('apply',{job:job.id})).status,'complete');
    assert.equal((await rpc('apply',{job:job.id})).new,401);

    const source = params.source;
    const preflight = async (kind,rows) => (await rpc('preflight',{source,kind,rows})).results;
    const [match, alias, crossed] = await preflight('template',[
      items[0],{...items[0],row:3,externalId:'different'}, {...items[0],row:4,databaseId:'2'},
    ]);
    assert.equal(match.status,'updated');
    assert.match(alias.message,/contradicts an existing alias/);
    assert.match(crossed.message,/different records/);

    const variant = {row:2,externalId:'v-1',parentExternalId:'p-0',sku:'0001',currency:'NGN',priceMinor:990050,sizeMl:50};
    assert.equal((await preflight('variant',[{...variant,parentExternalId:'unknown'}]))[0].status,'invalid');
    async function importOne(kind,tag,data) {
      const [check] = await preflight(kind,[data]);
      const spec = jobParams(tag,source,kind);
      const next = await rpc('begin',spec);
      await upload(next.objectPath);
      await rpc('stage',{job:next.id,review:spec.review,rows:[{row:2,status:check.status,data,targetId:check.targetId}]});
      await rpc('ready',{job:next.id,review:spec.review});
      return rpc('apply',{job:next.id});
    }
    assert.equal((await importOne('variant','variant-first',variant)).new,1);
    await db.exec('reset role');
    await db.exec("update golden_rose.product_variants set updated_at='2000-01-01' where sku='0001'");
    await db.exec('set role service_role');
    assert.equal((await importOne('variant','variant-repeat',variant)).updated,1);

    const duplicate = jobParams('duplicate',source,'template',2);
    const dup = await rpc('begin',duplicate);
    await upload(dup.objectPath);
    for (const row of [2,3]) await rpc('stage',{job:dup.id,review:duplicate.review,
      rows:[{row,status:'new',data:{row,externalId:'duplicate',name:'Duplicate ' + row}}]});
    assert.equal((await rpc('ready',{job:dup.id,review:duplicate.review})).invalid,2);
    assert.equal((await rpc('apply',{job:dup.id})).new,0);
    await db.exec('reset role');
    assert.deepEqual((await query(db,`select
      (select count(*)::int from golden_rose.products) as products,
      (select count(*)::int from golden_rose.product_variants) as variants,
      (select count(*)::int from golden_rose.products where is_published) as published,
      (select count(*)::int from golden_rose.stock_movements) as movements,
      (select count(*)::int from golden_rose.product_variants where updated_at='2000-01-01') as unchanged
    `))[0],{products:401,variants:1,published:0,movements:0,unchanged:1});
  } finally {
    await db.close();
  }
});

test('bootstrap and invitations give separate owners audited access with immediate suspension', async () => {
  const db = await fixture();
  try {
    const first = randomUUID(), second = randomUUID(), cashier = randomUUID(), third = randomUUID();
    const identities = [first,second,cashier,third];
    for (const [index,id] of identities.entries()) await query(db,'insert into auth.users values ($1,$2,now(),false,null)',[id,'fixture-'+index+'@example.test']);
    await query(db,"insert into golden_rose.staff_members(user_id,role,status) values ($1,'cashier','active')",[cashier]);
    const rpc = call(db,'public.gr_owner_access');
    await db.exec('set role authenticated');
    await claim(db,first);
    await assert.rejects(query(db,'select golden_rose_access.bootstrap_owner($1,$2,$3)',[first,'fixture-0@example.test','approval fixture']),/permission denied/);
    await assert.rejects(rpc('invite',{email:'fixture-1@example.test',tokenHash:hash('code')}),/Active owner/);
    await db.exec('reset role');
    await claim(db,'');
    await assert.rejects(query(db,'select golden_rose_access.bootstrap_owner($1,$2,$3)',[first,'wrong@example.test','approval fixture']),/verified intended/);
    await query(db,'select golden_rose_access.bootstrap_owner($1,$2,$3)',[first,'fixture-0@example.test','approval fixture']);
    await assert.rejects(query(db,'select golden_rose_access.bootstrap_owner($1,$2,$3)',[second,'fixture-1@example.test','approval fixture']),/already been completed/);

    await db.exec('set role authenticated');
    await claim(db,cashier);
    await assert.rejects(rpc('list'),/Active owner/);
    await claim(db,first);
    const invite = hash('second owner fixture');
    await rpc('invite',{email:'fixture-1@example.test',tokenHash:invite});
    await claim(db,third);
    await assert.rejects(rpc('accept',{tokenHash:invite}),/invalid, expired/);
    await claim(db,second);
    await rpc('accept',{tokenHash:invite});
    await assert.rejects(rpc('accept',{tokenHash:invite}),/invalid, expired/);
    assert.equal((await rpc('list')).owners.filter(item=>item.status==='active').length,2);
    await rpc('invite',{email:'fixture-3@example.test',tokenHash:hash('third owner fixture')});
    await assert.rejects(rpc('suspend',{id:second}),/Another active owner/);
    await claim(db,first);
    await rpc('suspend',{id:second});
    await claim(db,second);
    await assert.rejects(rpc('list'),/Active owner/);
    await db.exec('set role service_role');
    await assert.rejects(call(db,'public.gr_bulk_import')('history',{actor:second}),/Active owner/);
    await db.exec('set role authenticated');
    await claim(db,third);
    await assert.rejects(rpc('accept',{tokenHash:hash('third owner fixture')}),/invalid, expired/);
    await claim(db,first);
    const audit = (await rpc('list')).audit.map(event=>event.action);
    for (const action of ['bootstrap','owner_granted','invitation_created','invitation_accepted','owner_suspended','invitation_revoked']) assert.ok(audit.includes(action));
    await rpc('restore',{id:second});
    await claim(db,second);
    assert.equal((await rpc('list')).owners.filter(item=>item.status==='active').length,2);
    await claim(db,first);
    await assert.rejects(rpc('remove',{id:second}),/status already changed/);
    await rpc('suspend',{id:second});
    await rpc('remove',{id:second});
    const afterRemoval = await rpc('list');
    assert.equal(afterRemoval.owners.length,1);
    assert.ok(afterRemoval.audit.some(event=>event.action==='owner_removed' && event.subject===second && event.actor===first));
    const expiring = hash('expiring fixture');
    await rpc('invite',{email:'fixture-1@example.test',tokenHash:expiring});
    await db.exec('reset role');
    await query(db,"update golden_rose_access.owner_invitations set expires_at=now()-interval '1 hour' where token_hash=$1",[expiring]);
    await db.exec('set role authenticated');
    await claim(db,second);
    await assert.rejects(rpc('accept',{tokenHash:expiring}),/invalid, expired/);
  } finally {
    await db.close();
  }
});
