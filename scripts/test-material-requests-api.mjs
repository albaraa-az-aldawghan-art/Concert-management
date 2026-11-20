import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import { NextRequest } from 'next/server.js';
import ExcelJS from 'exceljs';

const records = new Map(); let sequence=0,transactions=0;
const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),create:async data=>records.set(path,data),update:async data=>records.set(path,{...records.get(path),...data})});
const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:records.has(path),data:()=>records.get(path)});
function query(name,filters=[],orders=[],limit=Infinity,after=null){
  const field=f=>typeof f==='string'?f:'__name__';
  return{path:name,doc:(id=`auto_${++sequence}`)=>ref(`${name}/${id}`),select:()=>query(name,filters,orders,limit,after),
    where:(f,op,v)=>query(name,[...filters,[field(f),op,v]],orders,limit,after),orderBy:(f,dir='asc')=>query(name,filters,[...orders,[field(f),dir]],limit,after),limit:n=>query(name,filters,orders,n,after),startAfter:(...v)=>query(name,filters,orders,limit,v),
    get:async()=>{
      let rows=[...records.keys()].filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(snap);
      const value=(s,f)=>f==='__name__'?s.id:s.data()[f];
      rows=rows.filter(s=>filters.every(([f,op,v])=>op==='=='?value(s,f)===v:op==='in'?v.includes(value(s,f)):op==='array-contains'?value(s,f)?.includes(v):op==='>='?value(s,f)>=v:op==='<='?value(s,f)<=v:false));
      const compare=(a,b)=>{for(const[f,dir]of orders){const x=value(a,f),y=value(b,f);if(x!==y)return(x<y?-1:1)*(dir==='desc'?-1:1)}return 0};rows.sort(compare);
      if(after)rows=rows.filter(s=>{for(let i=0;i<orders.length;i++){const x=value(s,orders[i][0]),v=after[i];if(x!==v)return orders[i][1]==='desc'?x<v:x>v}return false});
      rows=rows.slice(0,limit);return{docs:rows,size:rows.length,empty:!rows.length};
    }};
}
globalThis.materialFixtureDb={collection:name=>query(name),getAll:async(...refs)=>refs.map(r=>snap(r.path)),runTransaction:async fn=>{transactions++;const writes=[];let writing=false;
  const tx={get:async r=>{assert.equal(writing,false);return r.path.split('/').length===2?snap(r.path):r.get()},set:(r,data,options)=>{writing=true;writes.push(()=>records.set(r.path,options?.merge?{...records.get(r.path),...data}:data))},create:(r,data)=>{writing=true;writes.push(()=>{assert.equal(records.has(r.path),false);records.set(r.path,data)})},update:(r,data)=>{writing=true;writes.push(()=>records.set(r.path,{...records.get(r.path),...data}))},delete:r=>{writing=true;writes.push(()=>records.delete(r.path))}};
  const result=await fn(tx);writes.forEach(w=>w());return result;
}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {GET,POST} from '@/app/api/costs/material-requests/route';export {POST as PRINT} from '@/app/api/costs/material-requests/print/route';export {POST as EXCEL} from '@/app/api/costs/material-requests/export/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*','exceljs'],plugins:[{name:'fixture',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({loader:'ts',contents:`export const getAdminAuth=()=>({verifyIdToken:async t=>{if(t!=='TEST')throw Error('invalid');return{uid:'tester'}}});export const getAdminDb=()=>globalThis.materialFixtureDb;`}));b.onLoad({filter:/server[\\/]material-request-pdf\.ts$/},()=>({loader:'ts',contents:`export async function renderMaterialRequestPdf(request,lines,section,assignee){globalThis.printFixture={request,lines,section,assignee};return Buffer.from('%PDF-1.4 fixture');}`}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.material-api.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,process.cwd()+'/scripts/.material-api.cjs');
const call=(method,body,search='',token='TEST')=>compiled.exports[method](new NextRequest('http://localhost/api/costs/material-requests'+(method==='PRINT'?'/print':method==='EXCEL'?'/export':'')+search,{method:['PRINT','EXCEL'].includes(method)?'POST':method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
function reset(features=[],role='custom'){
  records.clear();transactions=0;records.set('users/tester',{role,customRoleId:'fixture',name:'موظف'});records.set('custom_roles/fixture',{permissions:{costs:features}});
  records.set('cost_items/RICE',{kind:'raw',name:'أرز',unit:'كجم',purchaseUnit:'كيس',purchaseToIssue:10,totalIn:20,totalOut:0,totalInValue:200,minimumStock:5});
  records.set('cost_items/SALE',{kind:'sale',name:'منتج',unit:'حبة',totalIn:0,totalOut:0});
}
const input={operationId:'req_1',requestDate:'2026-11-14',lines:[{barcode:'RICE',quantity:10,enteredUnit:'stock'}]};
for(const token of['','INVALID']){reset(['mat_create']);assert.equal((await call('POST',{action:'create',input},'',token)).status,401);assert.equal(transactions,0)}
for(const action of['create','edit','receive','invoice','void','cancel','policy','classify','assign']){reset([]);assert.equal((await call('POST',{action,input,id:'req_1'})).status,403);assert.equal(transactions,0)}
reset(['mat_receive']);assert.equal((await call('POST',{action:'receive',id:'req_1',input:{invoice:{}}})).status,403);assert.equal(transactions,0);
reset(['mat_create']);assert.equal((await call('POST',{action:'create',input})).status,200);assert.equal(records.get('cost_items/RICE').totalIn,20);assert.equal(records.get('cost_items/RICE').materialOpenQuantity,10);
assert.equal((await call('POST',{action:'create',input})).status,200);assert.equal(records.get('cost_items/RICE').materialOpenQuantity,10);
let response=await call('GET',null,'?choices=1');assert.equal(response.status,200);const choices=await response.json();assert.equal(choices.items.length,1);assert.equal('totalInValue'in choices.items[0],false);
records.get('cost_material_requests/req_1').createdBy='other';assert.equal((await call('GET',null,'?id=req_1')).status,403);
records.set('custom_roles/fixture',{permissions:{costs:['mat_view_all']}});assert.equal((await call('GET',null,'?id=req_1')).status,200);
reset(['mat_view_all']);
for(let i=0;i<45;i++)records.set(`cost_material_requests/req_${String(i).padStart(3,'0')}`,{number:'MR-'+i,requestDate:'2026-11-14',createdBy:i%2?'tester':'other',state:i===3?'partial':'open',source:'manual',lines:[],searchKeys:i===3?['أرز','ارز']:['آخر']});
const seen=[];let cursor='';do{const result=await(await call('GET',null,'?'+new URLSearchParams({cursor}))).json();seen.push(...result.rows.map(r=>r.id));cursor=result.nextCursor??'';}while(cursor);
assert.equal(seen.length,45);assert.equal(new Set(seen).size,45);
const filtered=await(await call('GET',null,'?'+new URLSearchParams({q:'ارز',state:'partial',from:'2026-11-14',to:'2026-11-14'}))).json();assert.deepEqual(filtered.rows.map(r=>r.id),['req_003']);
records.set('custom_roles/fixture',{permissions:{costs:['mat_view']}});const owned=await(await call('GET',null)).json();assert.ok(owned.rows.every(r=>r.createdBy==='tester'));
assert.equal((await call('GET',null,'?from=2026-02-30')).status,400);
// A mixed owner/assignee feed must paginate all matches once, never expose other staff requests.
for (const [path, row] of records) if (path.startsWith('cost_material_requests/')) { row.assignedTo = Number(path.slice(-3)) % 3 === 0 ? 'tester' : 'someone'; }
const scoped=[];cursor='';do{const result=await(await call('GET',null,'?'+new URLSearchParams({cursor}))).json();assert.ok(result.rows.every(r=>r.createdBy==='tester'||r.assignedTo==='tester'));scoped.push(...result.rows.map(r=>r.id));cursor=result.nextCursor??'';}while(cursor);
assert.equal(scoped.length,30);assert.equal(new Set(scoped).size,30);
assert.equal((await call('GET',null,'?employees=1')).status,403);
reset(['mat_create','mat_assign','mat_classify','mat_view','mat_print']);
records.set('users/worker',{name:'أحمد',email:'private@example.test',role:'employee'});
records.set('users/disabled',{name:'غير متاح',disabled:true});
const staff=await(await call('GET',null,'?employees=1')).json();assert.ok(staff.employees.some(e=>e.id==='worker'));assert.ok(staff.employees.every(e=>!('email'in e)&&e.id!=='disabled'));
assert.equal((await call('POST',{action:'classify',barcode:'RICE',sections:['restaurant','concerts']})).status,200);
assert.equal((await call('POST',{action:'create',input:{...input,section:'unknown',assignedTo:'worker'}})).status,400);
assert.equal((await call('POST',{action:'create',input:{...input,section:'general',assignedTo:'worker'}})).status,200);
assert.equal(records.get('cost_material_requests/req_1').assignedToName,'أحمد');
assert.equal((await call('POST',{action:'create',input:{...input,operationId:'cross_department',section:'contracts',assignedTo:'worker'}})).status,200);
assert.equal((await call('PRINT',{id:'cross_department',section:'contracts'})).status,200);assert.equal(globalThis.printFixture.lines[0].barcode,'RICE');
response=await call('PRINT',{id:'req_1',section:'restaurant'});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(globalThis.printFixture.lines.length,1);assert.equal(globalThis.printFixture.assignee,'أحمد');
assert.equal((await call('PRINT',{id:'req_1',section:'contracts'})).status,400);
assert.equal((await call('PRINT',{id:'req_1',section:'general'},'','')).status,401);
records.set('custom_roles/fixture',{permissions:{costs:['mat_view']}});assert.equal((await call('PRINT',{id:'req_1',section:'general'})).status,403);
records.set('custom_roles/fixture',{permissions:{costs:['mat_view','mat_print','mat_assign']}});
records.get('cost_material_requests/req_1').createdBy='stranger';assert.equal((await call('PRINT',{id:'req_1',section:'general'})).status,403);
assert.equal((await call('POST',{action:'assign',id:'req_1',assignedTo:'tester',revision:records.get('cost_material_requests/req_1').updatedAt})).status,403);
records.get('cost_material_requests/req_1').assignedTo='tester';assert.equal((await call('PRINT',{id:'req_1',section:'general'})).status,200);
reset(['mat_create','mat_view']);
const exportFilters={basis:'request',from:'2026-11-14',to:'2026-11-14'};
assert.equal((await call('EXCEL',{preview:true,filters:exportFilters},'','')).status,401);
assert.equal((await call('EXCEL',{preview:true,filters:exportFilters})).status,403);
await call('POST',{action:'create',input});
records.set('custom_roles/fixture',{permissions:{costs:['mat_view','mat_export']}});
records.get('cost_material_requests/req_1').lines[0].received=6;records.get('cost_material_requests/req_1').lines[0].posted=4;
for(const [id,date,quantity,state]of[['s1','2026-11-15',4,'posted'],['s2','2026-11-20',2,'awaiting_invoice'],['void','2026-11-20',999,'void']])records.set('cost_material_receipts/'+id,{requestId:'req_1',receivedDate:date,state,supplierName:'المورد',lines:[{barcode:'RICE',name:'أرز',unit:'كجم',quantity}],notes:''});
let preview=await(await call('EXCEL',{preview:true,filters:exportFilters})).json();assert.equal(preview.requests.length,1);
const deliveryFilters={basis:'delivery',from:'2026-11-20',to:'2026-11-20'};
preview=await(await call('EXCEL',{preview:true,filters:deliveryFilters})).json();assert.equal(preview.requests.length,1);
const exportBody={filters:deliveryFilters,columns:['number','requestDate','received','periodReceived','remaining'],requestIds:['req_1'],summary:false,arrivals:false};
response=await call('EXCEL',exportBody);assert.equal(response.status,200);assert.ok(response.headers.get('Content-Type').includes('spreadsheetml'));
const exported=new ExcelJS.Workbook();await exported.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(exported.worksheets.length,1);const exportedSheet=exported.worksheets[0];assert.equal(exportedSheet.columnCount,5);assert.equal(exportedSheet.getCell('C5').value,6);assert.equal(exportedSheet.getCell('D5').value,2);assert.equal(exportedSheet.getCell('E5').value,4);
assert.equal((await call('EXCEL',{...exportBody,requestIds:['forbidden']})).status,403);
assert.equal((await call('EXCEL',{...exportBody,columns:['password']})).status,400);
records.get('cost_material_requests/req_1').lines[0].received=7;assert.equal((await call('EXCEL',exportBody)).status,400);records.get('cost_material_requests/req_1').lines[0].received=6;
records.get('cost_material_requests/req_1').createdBy='another';assert.equal((await(await call('EXCEL',{preview:true,filters:deliveryFilters})).json()).requests.length,0);
records.get('cost_material_requests/req_1').assignedTo='tester';assert.equal((await(await call('EXCEL',{preview:true,filters:deliveryFilters})).json()).requests.length,1);
records.set('custom_roles/fixture',{permissions:{costs:['mat_view_all','mat_export']}});
for(let i=0;i<45;i++)records.set('cost_material_requests/more_'+i,{...records.get('cost_material_requests/req_1'),number:'MORE-'+i,createdBy:'another'});
assert.equal((await(await call('EXCEL',{preview:true,filters:exportFilters})).json()).requests.length,46);
assert.equal(transactions,1);
console.log('PASS: actual API auth and permissions, scoped owner/assignee feeds, all-page export, request/delivery periods, column checklist, exact xlsx values, void exclusion, counter reconciliation, and no export mutations.');
