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
class EdgeError extends Error { constructor(status) { super('Service error'); this.status = status; } }
function fixture({ state = 'none', role = 'owner', edgeError, authError, sessionError, confirmed = true } = {}) {
  const user = { id: 'owner-fixture', email_confirmed_at: confirmed ? 'confirmed' : null, user_metadata: {full_name:'Owner'} };
  const client = {
    auth: {
      getSession: async () => ({data:{session:{access_token:'fixture'}},error:sessionError}),
      getUser: async () => ({data:{user},error:authError}),
    },
    rpc: async () => ({data:state,error:null}),
  };
  return source('src/lib/golden-rose/staff.ts', {
    'server-only': {}, react:{cache: fn => fn},
    'next/navigation':{redirect: url => {throw new Error('REDIRECT:' + url);}},
    'next/server':{connection:async()=>{}},
    '@/src/domain/types':{ROLES:['owner','manager','cashier','inventory_staff','sales_staff','accountant','customer']},
    '@/src/lib/supabase/server':{createClient:async()=>client},
    './edge':{EdgeError,callEdge:async()=>{if(edgeError)throw new EdgeError(edgeError);return {isStaff:Boolean(role),role};}},
  });
}
test('verified owner and cashier retain their server-authorized roles', async () => {
  for (const role of ['owner','cashier']) assert.equal((await fixture({role}).requireStaff()).role,role);
});

// Run the existing auth-form regression suite against its actual validator.
source('src/components/auth-form.test.ts', {
  'node:test': load('node:test'),
  'node:assert': load('node:assert'),
  './auth-form': source('src/components/auth-form.tsx', {
    react: {}, 'react/jsx-runtime': {},
    '../lib/customer/auth-policy': source('src/lib/customer/auth-policy.ts', {}),
  }),
});
test('temporary Edge failure pauses access without redirecting to sign-in', async () => {
  const staff=fixture({edgeError:503});
  assert.deepEqual(await staff.getStaffAccess(),{reason:'unavailable'});
  await assert.rejects(staff.requireStaff(),{name:'StaffAccessUnavailableError'});
});
test('temporary identity and session failures remain retryable', async () => {
  for(const key of ['authError','sessionError']) assert.deepEqual(await fixture({[key]:{status:503}}).getStaffAccess(),{reason:'unavailable'});
});
test('revoked or non-staff membership cannot enter workspace', async () => {
  for(const role of [null,'customer']) await assert.rejects(fixture({role}).requireStaff(),/REDIRECT:.*reason=denied/);
});
test('expired authentication is sent to sign-in',async()=>{
  await assert.rejects(fixture({authError:{status:401}}).requireStaff(),/REDIRECT:.*reason=session/);
});
test('unconfirmed identity is blocked',async()=>{
  await assert.rejects(fixture({confirmed:false}).requireStaff(),/REDIRECT:.*reason=denied/);
});
test('first-login enrollment redirects to password change, while expired credentials stay blocked',async()=>{
  await assert.rejects(fixture({state:'change_required',role:null}).requireStaff(),/REDIRECT:\/staff\/change-password/);
  await assert.rejects(fixture({state:'expired'}).requireStaff(),/REDIRECT:.*reason=denied/);
});
test('unavailable enrollment never grants workspace access',async()=>{
  await assert.rejects(fixture({state:'unavailable'}).requireStaff(),{name:'StaffAccessUnavailableError'});
});

test('supplier save waits for confirmed RPC success and returns errors without login redirects',async()=>{
  for(const code of [null,'23505','42501','PGRST202']) {
    let writes=0;
    const actions=source('app/workspace/operations/actions.ts',{
      'next/cache':{revalidatePath:()=>{}},
      'next/navigation':{redirect:()=>{throw Error('Unexpected redirect');},notFound:()=>{throw Error('Forbidden');}},
      '@/src/domain/permissions':{canViewModule:()=>true},
      '@/src/lib/golden-rose/contracts':{UUID:/^[0-9a-f-]{36}$/i,nairaToKobo:()=>100},
      '@/src/lib/golden-rose/staff':{requireStaff:async()=>({role:'owner'}),StaffAccessUnavailableError:class extends Error{}},
      '@/src/lib/supabase/server':{createClient:async()=>({rpc:async()=>{writes++;return {data:code?null:{ok:true},error:code?{code}:null};}})},
    });
    const form=new FormData();form.set('name','Isolated supplier fixture');form.set('termsDays','0');
    const result=await actions.saveSupplierState(form);
    assert.equal(writes,1);assert.equal(result.status,code?'error':'success');
    assert.equal(form.get('name'),'Isolated supplier fixture');
  }
});
