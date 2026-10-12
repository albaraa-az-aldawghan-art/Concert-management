import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
const record={id:'phone_TEST',name:'عميل الاختبار',primaryPhone:'0500000000',secondaryPhone:null,source:'مصدر سري',referralName:'شخص سري',notes:'ملاحظة سرية',firstCreatedBy:'uid-secret',firstCreatedByName:'موظف سري',totalValue:1234,totalCollected:200,totalRemaining:1034,totalRefunded:0,concerts:[],payments:[]};
globalThis.fixtureRecord=record;globalThis.fixturePermissions={};globalThis.fixtureWrites=0;globalThis.fixtureReads=0;
const mocks={
 '/lib/firebase-admin.ts': `export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'employee'}}});export const getAdminDb=()=>({collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>name==='users'?{role:'employee'}:{permissions:globalThis.fixturePermissions}}),create:async()=>{},update:async()=>{}})})});`,
 '/lib/server/concert-customers-core.ts': `export const listConcertCustomers=async()=>{globalThis.fixtureReads++;return[globalThis.fixtureRecord]};export const updateConcertCustomer=async()=>{globalThis.fixtureWrites++;return{ok:true}};`,
 '/lib/server/pdf-browser.ts': `export const launchPdfBrowser=async()=>{throw Error('PDF test boundary')};`,
};
const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {GET,PATCH} from '@/app/api/customers/route';export {POST as PDF} from '@/app/api/customers/export-pdf/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*','puppeteer-core'],plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/\.ts$/},args=>{const path=args.path.replaceAll('\\','/'),key=Object.keys(mocks).find(k=>path.endsWith(k));if(key)return{contents:mocks[key],loader:'ts'};});}}]});
const compiled=new Module(process.cwd()+'/scripts/.customer-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(result.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.customer-api-test.cjs');const routes=compiled.exports;
const request=(method,body={},token='TEST')=>new Request('http://localhost/api/customers'+(method==='POST'?'/export-pdf':''),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const edit={id:'phone_TEST',name:'اسم جديد',primaryPhone:'0500000000'};
for(const permissions of [{},{contracts:['customers_edit','customers_export','edit']}]){
 globalThis.fixturePermissions=permissions;
 assert.equal((await routes.GET(request('GET'))).status,403);
 assert.equal((await routes.PATCH(request('PATCH',edit))).status,403);
 assert.equal((await routes.PDF(request('POST'))).status,403);
}
assert.equal(globalThis.fixtureReads,0);assert.equal(globalThis.fixtureWrites,0);
assert.equal((await routes.GET(request('GET',{},'INVALID'))).status,401);
globalThis.fixturePermissions={customers:[]};
let response=await routes.GET(request('GET'));assert.equal(response.status,200);let data=await response.json();assert.equal(data[0].totalValue,0);assert.equal(data[0].notes,null);assert.equal(data[0].firstCreatedByName,'');
assert.equal((await routes.PATCH(request('PATCH',edit))).status,403);
globalThis.fixturePermissions={customers:['export']};assert.equal((await routes.PDF(request('POST'))).status,403);
globalThis.fixturePermissions={customers:['financial']};response=await routes.GET(request('GET'));data=await response.json();assert.equal(data[0].totalValue,1234);assert.equal(data[0].source,null);
globalThis.fixturePermissions={customers:['edit']};assert.equal((await routes.PATCH(request('PATCH',edit))).status,200);assert.equal(globalThis.fixtureWrites,1);
console.log('PASS: real customer GET/PATCH/PDF routes and real auth guard; invalid token 401; missing/contract-only grants 403 before data access; view-only redaction; financial-only read; editor write; denied PDF bypass.');
