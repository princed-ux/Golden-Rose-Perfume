import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const desktop = createRequire(resolve('apps/desktop/package.json'));
const { createServer } = await import(pathToFileURL(desktop.resolve('vite')).href);
const { chromium, expect } = desktop('@playwright/test');
const root = await mkdtemp(join(tmpdir(), 'golden-rose-feedback-'));
await writeFile(join(root, 'index.html'), '<html><body><div id="root"></div><script type="module" src="/entry.jsx"></script></body></html>');
await writeFile(join(root, 'navigation.js'), 'export const useRouter=()=>({refresh:()=>{window.refreshes=(window.refreshes||0)+1}}); export const useSearchParams=()=>new URLSearchParams(); export function unstable_rethrow(e){if(e?.digest?.startsWith("NEXT_REDIRECT"))throw e;}');
await writeFile(join(root, 'entry.jsx'), `import React,{useState,useActionState} from 'react';import {createRoot} from 'react-dom/client';import {ActionForm,ActionStateForm,ActionButton,ActionNotificationHost,ActionNotice} from '@feedback';
function App(){const[success,setSuccess]=useState(false);const[state,dispatch,pending]=useActionState(async()=>{await new Promise(r=>setTimeout(r,250));return{status:'error',message:'Check the entered details.'}},{status:'idle',message:''});
async function save(data){window.calls??=[];window.calls.push(Object.fromEntries(data));await new Promise(r=>setTimeout(r,350));return success?{status:'success',message:'Settings saved after acknowledgement.'}:{status:'error',message:'Duplicate reference: choose a unique value.'};}
return <><ActionNotificationHost/><button onClick={()=>setSuccess(true)}>Enable fixture success</button><ActionForm action={save} data-testid="save-form"><label>Details<input name="details" required/></label><ActionButton name="operation" value="save" type="submit">Save settings</ActionButton></ActionForm><ActionStateForm action={dispatch} pending={pending}><label>Account field<input name="account" required/></label><ActionButton type="submit">Validate account</ActionButton></ActionStateForm><ActionNotice result={state}/><p>{state.message}</p></>};createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile:false, root, cacheDir:join(root,'.vite'), esbuild:{jsx:'automatic'},
  resolve:{alias:[{find:'@feedback',replacement:resolve('src/components/action-feedback.tsx')},{find:'next/navigation',replacement:join(root,'navigation.js')},
    {find:'react-dom',replacement:resolve('node_modules/react-dom')},{find:'react',replacement:resolve('node_modules/react')},{find:'lucide-react',replacement:resolve('node_modules/lucide-react')}]},
  server:{host:'127.0.0.1',port:0,fs:{allow:[root,process.cwd()]}} });
await server.listen();
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByLabel('Details').fill('Retained fixture value');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.getByRole('button',{name:'Processing…',exact:true})).toBeDisabled();
  await expect(page.locator('.gr-action-spinner')).toBeVisible();
  await page.getByTestId('save-form').evaluate(form=>form.requestSubmit());
  await expect(page.locator('.gr-auth-toast--error')).toContainText('Duplicate reference');
  await expect(page.getByLabel('Details')).toHaveValue('Retained fixture value');
  assert.equal(await page.evaluate(()=>window.calls.length),1);
  assert.equal(await page.evaluate(()=>window.calls[0].operation),'save');
  await page.getByRole('button',{name:'Enable fixture success'}).click();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.locator('.gr-auth-toast--success')).toContainText('Settings saved after acknowledgement.');
  assert.equal(await page.evaluate(()=>window.refreshes),1);
  await expect(page.getByRole('button',{name:'Save settings',exact:true})).toBeEnabled();
  await page.getByLabel('Account field').fill('Preserved account field');
  await page.getByRole('button',{name:'Validate account',exact:true}).click();
  await expect(page.locator('.gr-auth-toast--error')).toContainText('Check the entered details.');
  await expect(page.getByLabel('Account field')).toHaveValue('Preserved account field');
  console.log('PASS: pending spinner, duplicate blocking, submitter payload, actionable failure, preserved fields, acknowledged success, refresh, action-state retry. No hosted requests.');
} finally { await browser.close(); await server.close(); }
