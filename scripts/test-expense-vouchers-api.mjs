import assert from 'node:assert/strict';
import Module from 'node:module';
import { build } from 'esbuild';
import { NextRequest } from 'next/server.js';
import ExcelJS from 'exceljs';
import { Timestamp } from 'firebase-admin/firestore';
const records=new Map();let seq=0;
const snap=p=>({id:p.split('/').at(-1),ref:ref(p),exists:records.has(p),data:()=>records.get(p)});
const ref=p=>({path:p,id:p.split('/').at(-1),get:async()=>snap(p),create:async d=>records.set(p,d),update:async d=>records.set(p,{...records.get(p),...d}),delete:async()=>records.delete(p)});
const comparable=v=>v?.toMillis?v.toMillis():v;
function query(name,filters=[],orders=[],cap=Infinity,after=[]){return{path:name,doc:(id='auto_'+ ++seq)=>ref(name+'/'+id),where:(f,op,v)=>query(name,[...filters,[f,op,v]],orders,cap,after),orderBy:(f,dir='asc')=>query(name,filters,[...orders,[typeof f==='string'?f:'__name__',dir]],cap,after),limit:n=>query(name,filters,orders,n,after),startAfter:(...v)=>query(name,filters,orders,cap,v),get:async()=>{
  let rows=[...records.keys()].filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(snap);const val=(r,f)=>f==='__name__'?r.id:r.data()[f];
  rows=rows.filter(r=>filters.every(([f,op,v])=>op==='=='?val(r,f)===v:op==='array-contains'?val(r,f)?.includes(v):op==='>='?comparable(val(r,f))>=comparable(v):op==='<='?comparable(val(r,f))<=comparable(v):op==='<'?comparable(val(r,f))<comparable(v):false));
  rows.sort((a,b)=>{for(const[f,dir]of orders){const x=val(a,f),y=val(b,f);if(x!==y)return(x<y?-1:1)*(dir==='desc'?-1:1)}return 0});
  if(after.length)rows=rows.filter(r=>{for(let i=0;i<orders.length;i++){const x=val(r,orders[i][0]),v=after[i];if(x!==v)return orders[i][1]==='desc'?x<v:x>v}return false});
  const docs=rows.slice(0,cap);return{docs,size:docs.length,empty:!docs.length};
}}}
globalThis.voucherApiFixture={collection:query,getAll:async(...refs)=>refs.map(r=>snap(r.path)),runTransaction:async fn=>{let writing=false;const writes=[];const tx={get:async r=>{assert.equal(writing,false);return r.path.split('/').length===2?snap(r.path):r.get()},set:(r,d)=>{writing=true;writes.push(()=>records.set(r.path,d))},create:(r,d)=>{writing=true;writes.push(()=>{assert.equal(records.has(r.path),false);records.set(r.path,d)})},update:(r,d)=>{writing=true;writes.push(()=>records.set(r.path,{...records.get(r.path),...d}))},delete:r=>{writing=true;writes.push(()=>records.delete(r.path))}};const result=await fn(tx);writes.forEach(w=>w());return result;}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {GET,POST} from '@/app/api/expense-vouchers/route';export{POST as PRINT}from'@/app/api/expense-vouchers/print/route';export{POST as EXCEL}from'@/app/api/export/expenses/route'`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*','exceljs'],plugins:[{name:'fixture',setup(b){
  b.onLoad({filter:/firebase-admin\.ts$/},()=>({loader:'ts',contents:`export const getAdminAuth=()=>({verifyIdToken:async t=>{if(t!=='TEST')throw Error('invalid');return{uid:'tester'}}});export const getAdminDb=()=>globalThis.voucherApiFixture;`}));
  b.onLoad({filter:/expense-voucher-pdf\.ts$/},()=>({loader:'ts',contents:`export const renderVoucherPdf=async v=>{globalThis.printedVoucher=v;return Buffer.from('%PDF-1.4 fixture')};`}));
}}]});
const filename=process.cwd()+'/scripts/.voucher-api.cjs',compiled=new Module(filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,filename);
const call=(method,body,search='',token='TEST')=>compiled.exports[method](new NextRequest('http://localhost/api/expense-vouchers'+search,{method:method==='GET'?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}));
const full=['expenses_view','expenses_create','expenses_approve','expenses_print','expenses_void','expenses_settle','expenses_export'];
function reset(features=full){records.clear();records.set('users/tester',{role:'custom',customRoleId:'fixture'});records.set('custom_roles/fixture',{permissions:{finances:features}});records.set('expense_settings/config',{types:[{name:'عمال',kind:'labor'}]});for(const id of['a','b','c'])records.set('concerts/'+id,{name:'حفلة '+id,status:'confirmed',vatRate:5,date:Timestamp.fromDate(new Date('2026-11-21T12:00:00+03:00'))});}
const input={date:'2026-11-21',department:'concerts',recipient:'المستلم',type:'عمال',kind:'labor',method:'bank_transfer',description:'500 موزعة على 3 حفلات',source:'direct',amount:500,vatMode:'none',vatRate:15,targetIds:['a','b','c']};
for(const token of['','INVALID']){reset();assert.equal((await call('POST',{action:'save',id:'v',input},'',token)).status,401);assert.equal((await call('PRINT',{id:'v'},'',token)).status,401)}
for(const[action,key]of[['save','expenses_create'],['approve','expenses_approve'],['void','expenses_void'],['settle','expenses_settle']]){reset(full.filter(k=>k!==key));assert.equal((await call('POST',{action,id:'v',input})).status,403);assert.equal([...records.keys()].some(p=>p.startsWith('expense_vouchers/')),false)}
reset();let response=await call('GET',null,'?choices=concerts&from=2026-11-21&to=2026-11-21');assert.equal((await response.json()).rows.length,3);
response=await call('POST',{action:'save',id:'v',input});assert.equal(response.status,200);let v=(await response.json()).voucher;assert.equal(v.state,'draft');assert.equal(records.get('concerts/a').laborCost,undefined);assert.equal((await call('PRINT',{id:'v'})).status,400);
response=await call('POST',{action:'approve',id:'v',revision:v.revision});assert.equal(response.status,200);v=(await response.json()).voucher;assert.equal(v.number,'PV-2026-000001');assert.equal(records.get('concerts/a').laborCost,166.67);
assert.equal((await call('POST',{action:'approve',id:'v',revision:1})).status,200);assert.equal(records.get('counters/expense_vouchers_2026').value,1);
response=await call('PRINT',{id:'v'});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(globalThis.printedVoucher.gross,50000);
response=await call('EXCEL',{filters:{}});assert.equal(response.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(book.getWorksheet('ملخص المصاريف').getCell('C8').result,500);assert.equal(book.getWorksheet('توزيع السندات').getCell('G7').value,166.66);
let before=JSON.stringify(records.get('expense_vouchers/v'));assert.equal((await call('POST',{action:'settle',id:'v',input:{target:'a',revision:v.revision,mode:'refunded',reason:'refund',amount:200,refundDate:'2026-11-21',refundMethod:'نقدي'}})).status,400);assert.equal(JSON.stringify(records.get('expense_vouchers/v')),before);
response=await call('POST',{action:'settle',id:'v',input:{target:'a',revision:v.revision,mode:'refunded',reason:'refund',amount:100,refundDate:'2026-11-21',refundMethod:'نقدي'}});assert.equal(response.status,200);assert.equal((await response.json()).voucher.refunded,10000);assert.equal(records.get('concerts/a').laborCost,66.67);
records.set('custom_roles/fixture',{permissions:{finances:['expenses_view']}});assert.equal((await call('GET',null,'?id=v')).status,200);assert.equal((await call('PRINT',{id:'v'})).status,403);
records.set('custom_roles/fixture',{permissions:{finances:[]}});assert.equal((await call('GET',null,'?id=v')).status,403);const report=await(await call('GET',null,'?report=1')).json();assert.equal(report.rows.length,1);assert.equal('recipient'in report.rows[0],false);assert.equal('name'in report.rows[0].allocations[0],false);
console.log('Voucher API passed: auth, every mutation permission, date choices, draft/no cost, idempotent approval, per-concert cents, PDF guard, one-count Excel, refund limits, immutable failures and aggregate-only report.');
