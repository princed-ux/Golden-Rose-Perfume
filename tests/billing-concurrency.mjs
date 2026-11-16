import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const psql = process.env.GR_BILLING_PSQL;
const port = process.env.GR_BILLING_TEST_PORT;

test('separate PostgreSQL connections issue each draft once and share a single sequence',
  { skip: !psql || !port, timeout: 25000 }, async () => {
    assert.match(port, /^\d{4,5}$/);
    // Run against a newly initialized loopback-only test cluster. This test does
    // not accept a database URI, use the application environment, or clean up
    // a database that is already populated.
    function query(sql) {
      return new Promise((resolve,reject) => {
        const child=spawn(psql,['-X','-w','-qAt','-v','ON_ERROR_STOP=1',
          '-h','127.0.0.1','-p',port,'-U','postgres','-d','gr_billing_fixture'], { windowsHide:true });
        let result='',error='';
        child.on('error',reject);
        child.stdout.on('data',chunk=>{result+=chunk;});
        child.stderr.on('data',chunk=>{error+=chunk;});
        child.on('close',code=>code===0 ? resolve(result.trim()) : reject(new Error(error || 'psql exited with '+code)));
        child.stdin.end(sql);
      });
    }
    assert.equal(await query("select case when exists(select 1 from pg_namespace where nspname in ('auth','golden_rose')) then 'occupied' else 'empty' end;"),'empty');
    await query("create role anon; create role authenticated; create role service_role bypassrls; create schema auth;" +
      "grant usage on schema auth to authenticated,service_role;" +
      "create table auth.users (id uuid primary key,email text unique,email_confirmed_at timestamptz,is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);" +
      "create table auth.sessions (id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);" +
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
      "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;");
    for (const name of [
      '20261112003607_golden_rose_replace_kolextrader_with_catalogue_inventory.sql',
      '20261112004128_golden_rose_staff_atomic_stock_transactions.sql',
      '20261113182003_golden_rose_owner_access.sql',
      '20261114141541_golden_rose_atomic_cash_pos_register.sql',
      '20261115131653_golden_rose_staff_management.sql',
      '20261116150000_golden_rose_customer_crm.sql',
      '20261116180000_golden_rose_billing.sql',
    ]) await query(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    const [store,actor,session]=Array.from({length:3},randomUUID);
    await query("insert into auth.users values ('"+actor+"','owner@fixture.example',now(),false,null,'{}');"+
      "insert into auth.sessions values('"+session+"','"+actor+"',now());"+
      "insert into golden_rose.locations(id,name,code) values('"+store+"','Fixture store','B');"+
      "insert into golden_rose.staff_members(user_id,role,status) values('"+actor+"','owner','active');");
    async function command(action,payload,rollback=false) {
      const result=await query((rollback?'begin;':'')+"set role authenticated; set request.jwt.claim.sub='"+actor+"';"+
        "set request.jwt.claims='"+JSON.stringify({ session_id:session })+"';"+
        "select public.gr_billing('"+action+"','"+JSON.stringify({ ...payload,requestKey:randomUUID() }).replaceAll("'","''")+"'::jsonb);"+
        (rollback?'rollback;':''));
      return JSON.parse(result);
    }
    await command('configure',{storeId:store,name:'Billing fixture',address:'Fixture address',
      contact:'billing@fixture.example',taxBps:0,taxBasis:'Synthetic local fixture'});
    const drafts=[];
    for (const index of [0,1,2]) drafts.push(await command('save',{storeId:store,kind:'invoice',recipient:'Fixture '+index,
      issueDate:'2026-01-01',dueDate:'2099-01-01',discountMinor:0,lines:[{description:'Fixture item',quantity:1,unitPriceMinor:100}]}));
    const issuance=[0,1,0,2,1].map(i=>command('issue',{id:drafts[i].id,revision:drafts[i].revision}));
    const [a,b,aRetry,c,bRetry]=await Promise.all(issuance);
    assert.equal(a.invoice_number,aRetry.invoice_number);
    assert.equal(b.invoice_number,bRetry.invoice_number);
    assert.deepEqual([a.invoice_number,b.invoice_number,c.invoice_number].sort((x,y)=>x-y),[1,2,3]);
    assert.equal(await query("select count(*) from golden_rose_billing.events where action='issue';"),'3');
    assert.equal(await query('select last_number from golden_rose_billing.invoice_counter;'),'3');
    const rollbackDraft=await command('save',{storeId:store,kind:'invoice',recipient:'Rollback fixture',
      issueDate:'2026-01-01',dueDate:'2099-01-01',discountMinor:0,lines:[{description:'Fixture item',quantity:1,unitPriceMinor:100}]});
    const args={id:rollbackDraft.id,revision:rollbackDraft.revision};
    assert.equal((await command('issue',args,true)).invoice_number,4);
    assert.equal((await command('get',{id:rollbackDraft.id})).state,'draft');
    assert.equal((await command('issue',args)).invoice_number,4);
  });
