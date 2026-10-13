import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
const orders=new Map([
 ['1',{concertId:'1',concertNumber:1,clientName:'أحمد',concertDate:'2026-10-13',status:'received',lines:[{name:'كشري',quantity:3},{name:'كرات البطاطس',quantity:2},{name:'بشمل لحم',quantity:5},{name:'ام علي',quantity:4}]}],
 ['2',{concertId:'2',concertNumber:2,clientName:'محمد',concertDate:'2026-10-14',status:'received',lines:[{name:'كشري',quantity:2}]}],
 ['sent',{concertId:'3',concertNumber:3,clientName:'خالد',concertDate:'2026-10-13',status:'sent',lines:[{name:'كشري',quantity:999}]}],
]);
globalThis.kitchenPerms={};globalThis.kitchenReads=0;
globalThis.kitchenDb={collection:name=>({doc:id=>({id,get:async()=>({exists:true,data:()=>name==='users'?{role:'custom',customRoleId:'TEST'}:{permissions:globalThis.kitchenPerms}}),create:async()=>{},update:async()=>{}})}),getAll:async(...refs)=>{globalThis.kitchenReads++;return refs.map(r=>({id:r.id,exists:orders.has(r.id),data:()=>orders.get(r.id)}))}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export{POST}from'@/app/api/kitchen/export/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*'],plugins:[{name:'sdk',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({contents:`export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'test'}}});export const getAdminDb=()=>globalThis.kitchenDb;`,loader:'ts'}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.kitchen-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.kitchen-api-test.cjs');
const filters={date:{mode:'custom',from:'2026-10-13',to:'2026-10-14'},search:''};
const run=(orderIds=['1','2'],filter=filters,token='TEST')=>compiled.exports.POST(new Request('http://localhost/api/kitchen/export',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({orderIds,filters:filter})}));
for(const perms of [{},{kitchen:[]},{kitchen:['confirm']},{costs:['export']}]){globalThis.kitchenPerms=perms;assert.equal((await run()).status,403);}assert.equal(globalThis.kitchenReads,0);
globalThis.kitchenPerms={kitchen:['export']};assert.equal((await run(['1'],filters,'INVALID')).status,401);
for(const ids of [[],['1','1'],['missing'],['sent'],['1/other']])assert.equal((await run(ids)).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-10-14',to:'2026-10-14'}})).status,400);
assert.equal((await run(['1'],{...filters,search:'محمد'})).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-02-30',to:''}})).status,400);
const response=await run();assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/spreadsheetml/);assert.match(response.headers.get('Content-Disposition'),/\.xlsx/);
const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);assert.equal(wb.worksheets.length,1);const ws=wb.worksheets[0];assert.equal(ws.rowCount,8);
const quantities=new Map([5,6,7,8].map(r=>[ws.getCell('B'+r).value,ws.getCell('C'+r).value]));assert.equal(quantities.get('كشري'),5);assert.equal(quantities.get('كرات البطاطس'),2);assert.equal(quantities.get('بشمل لحم'),5);assert.equal(quantities.get('ام علي'),4);
await fs.mkdir('tmp/kitchen-export',{recursive:true});await fs.writeFile('tmp/kitchen-export/sample.xlsx',bytes);
orders.get('1').lines[0].quantity=null;assert.equal((await run(['1'])).status,400);
console.log('PASS: real export/auth route; permission isolation; date/search recheck; received-only; duplicates and missing records rejected; native XLSX with one sheet and exact quantities; missing quantity blocked.');
