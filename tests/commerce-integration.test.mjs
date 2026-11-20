import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const load = createRequire(import.meta.url);
const ts = load('typescript');
function source(path, mocks) {
  const file = resolve(path);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name in mocks) return mocks[name];
    if (name === '@/src/lib/action-result') return source('src/lib/action-result.ts', {'server-only':{}, 'next/navigation':{unstable_rethrow(error) { if (error.message?.startsWith('REDIRECT:')) throw error; }}});
    throw new Error('Unexpected dependency: ' + name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const ids={customer:'11111111-1111-4111-8111-111111111111',store:'22222222-2222-4222-8222-222222222222',doc:'33333333-3333-4333-8333-333333333333'};
const {customerActivity}=source('src/lib/golden-rose/customer-activity.ts',{});
const doc=(overrides={})=>({id:ids.doc,customer_id:ids.customer,location_id:ids.store,kind:'invoice',state:'issued',balance_minor:700,paid_minor:300,payments:[],lines:[],...overrides});
test('CRM links exact customer and store IDs, never matching names',()=>{
 const result=customerActivity([doc(),doc({customer_id:'other'}),doc({location_id:'other'})],ids.customer,ids.store);
 assert.equal(result.documents.length,1);assert.equal(result.outstandingMinor,700);
});
test('only issued invoices contribute outstanding balances; quotes and drafts do not',()=>{
 const result=customerActivity([doc(),doc({kind:'quotation'}),doc({state:'draft'}),doc({state:'voided'})],ids.customer,ids.store);
 assert.equal(result.outstandingMinor,700);
});
test('POS links require verified allocations and cannot duplicate revenue',()=>{
 const payments=[{id:'a',source:'pos',status:'verified',reference:'POS 4',amount_minor:300},{id:'b',source:'offline',status:'pending',reference:'POS 9',amount_minor:500},{id:'c',source:'pos',status:'rejected',reference:'POS 8',amount_minor:200}];
 const result=customerActivity([doc({payments}),doc({payments})],ids.customer,ids.store);
 assert.equal(result.receipts.length,1);assert.equal(result.receipts[0].search,'4');assert.equal(result.receipts[0].amountMinor,300);
});
function billingFixture({role='owner',reason,error=null,data=doc()}={}){
 const calls=[],refresh=[];
 const api=source('app/workspace/invoices/billing-actions.ts',{
 'next/cache':{revalidatePath:path=>refresh.push(path)},
 '@/src/domain/permissions':{canViewModule:(r)=>['owner','manager','accountant'].includes(r)},
 '@/src/lib/golden-rose/staff':{getStaffAccess:async()=>reason?{reason}:{role}},
 '@/src/lib/supabase/server':{createClient:async()=>({rpc:async(name,payload)=>{calls.push({name,payload});return {data,error};}})},
 });return {api,calls,refresh};
}
test('billing denies customers, cashiers and unavailable identities before RPC',async()=>{
 for(const options of [{role:'customer'},{role:'cashier'},{reason:'unavailable'}]){
 const f=billingFixture(options);assert.ok((await f.api.updateBilling('issue',{id:ids.doc})).error);assert.equal(f.calls.length,0);assert.equal(f.refresh.length,0);
 }
});
test('billing refreshes linked modules only after acknowledged writes and retains retry key',async()=>{
 const payload={id:ids.doc,requestKey:'fixture-retry-key'};
 const f=billingFixture();assert.ok((await f.api.updateBilling('issue',payload)).data);
 assert.equal(f.calls[0].payload.p_payload.requestKey,payload.requestKey);
 assert.deepEqual(f.refresh,['/workspace/invoices','/workspace/customers','/workspace/orders']);
 const failed=billingFixture({error:{code:'GR409',message:'Receipt is already allocated.'}});
 assert.equal((await failed.api.updateBilling('apply_pos',payload)).error,'Receipt is already allocated.');assert.equal(failed.refresh.length,0);
});
test('document deep-link reads reject malformed IDs and mismatched records',async()=>{
 const f=billingFixture();assert.ok((await f.api.getBillingDocument('invalid')).error);assert.equal(f.calls.length,0);
 assert.ok((await billingFixture({data:doc({id:'other'})}).api.getBillingDocument(ids.doc)).error);
 assert.ok((await f.api.getBillingDocument(ids.doc)).data);
});
test('missing billing migration is an actionable unavailable state',async()=>{
 const f=billingFixture({error:{code:'PGRST202',message:'missing'}});assert.equal((await f.api.loadBilling({})).unavailable,true);
});
test('sales forwards store and normalizes printed receipt numbers; rejects corrupt financial rows',async()=>{
 const original=globalThis.fetch;let requested;
 const sale={status:'completed',currency:'NGN',subtotalMinor:1000,discountMinor:100,taxMinor:0,totalMinor:900,units:1,lineCount:1};
 globalThis.fetch=async(url)=>{requested=new URL(url);return Response.json({ok:true,items:[sale],hasMore:false});};
 try {
 const api=source('app/workspace/orders/data.ts',{'server-only':{},'@/src/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://fixture.invalid',publishableKey:'fixture'})}});
 const filters={search:'GR-0000004',locationId:ids.store,from:'',to:'',offset:0};
 assert.equal((await api.loadSalesPage('fixture',filters)).items.length,1);
 assert.equal(requested.searchParams.get('search'),'4');assert.equal(requested.searchParams.get('locationId'),ids.store);
 sale.totalMinor=999;await assert.rejects(api.loadSalesPage('fixture',filters),/unexpected response/);
 await assert.rejects(api.loadSalesPage('fixture',{...filters,from:'2026-11-20',to:'2026-11-01'}),/start date/);
 }finally{globalThis.fetch=original;}
});
source('src/lib/golden-rose/invoice-draft.test.ts',{'node:test':load('node:test'),'node:assert/strict':{default:assert},'./invoice-draft':source('src/lib/golden-rose/invoice-draft.ts',{})});

test('CRM create, edit, archive and restore retain identity/revision and refresh only acknowledged changes',async()=>{
 const refresh=[],calls=[];
 const api=source('app/workspace/customers/actions.ts',{
 'next/cache':{revalidatePath:p=>refresh.push(p)},
 '@/src/domain/permissions':{canViewModule:r=>r==='owner'},
 '@/src/lib/golden-rose/staff':{getStaffAccess:async()=>({role:'owner'})},
 '@/src/lib/supabase/server':{createClient:async()=>({rpc:async(name,payload)=>{calls.push({name,payload});return {data:{ok:true,customer:{id:ids.customer}},error:null};}})},
 './data':{crmMessage:()=> 'Conflict: refresh before editing.'},
 });
 for(const mode of ['create','update','archive','restore']){
 const form=new FormData();for(const [key,value] of Object.entries({mode,id:ids.customer,locationId:ids.store,updatedAt:'2026-11-20T00:00:00Z',fullName:'Isolated Fixture',email:'fixture@example.invalid',phone:'',notes:''}))form.set(key,value);
 const result=await api.submitCrmCustomer({status:'idle',message:''},form);assert.equal(result.status,'success');
 assert.equal(calls.at(-1).payload.p_action,mode);assert.equal(calls.at(-1).payload.p_payload.locationId,ids.store);
 }
 assert.equal(refresh.length,8);
});
test('customer history is bounded, exact-ID linked, and reports incomplete reads as failures',async()=>{
 let active=0,maxActive=0,fail=false;
 const api=source('app/workspace/customers/history-actions.ts',{
 '@/src/lib/golden-rose/billing':{billingFilters:{search:'',kind:'',status:'',storeId:'',from:'',to:'',page:0}},
 '@/src/lib/golden-rose/customer-activity':{customerActivity},
 '../invoices/billing-actions':{
 loadBilling:async filters=>({data:{documents:Array.from({length:12},(_,i)=>({id:String(i)})),more:true,page:filters.page}}),
 getBillingDocument:async id=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return fail?{error:'Read denied'}:{data:doc({id,customer_id:id==='0'?ids.customer:'other'})};},
 }});
 const result=await api.loadCustomerActivity(ids.customer,ids.store,2);assert.equal(result.data.documents.length,1);assert.equal(result.data.page,2);assert.equal(result.data.more,true);assert.ok(maxActive<=5);
 fail=true;assert.equal((await api.loadCustomerActivity(ids.customer,ids.store)).error,'Read denied');
 assert.ok((await api.loadCustomerActivity('not-an-id',ids.store)).error);
});
