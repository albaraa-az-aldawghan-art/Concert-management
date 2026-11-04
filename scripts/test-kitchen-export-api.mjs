import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
import fs from 'node:fs/promises';
const orders=new Map([
 ['1',{concertId:'1',concertNumber:900001,clientName:'أحمد',concertDate:'2026-10-13',status:'received',lines:[{name:'كشري',categoryName:'الأطباق الرئيسية',quantity:3},{name:'كرات البطاطس',categoryName:'المقبلات',quantity:2},{name:'ام علي',categoryName:'الحلويات',quantity:4}]}],
 ['2',{concertId:'2',concertNumber:900002,clientName:'محمد',concertDate:'2026-10-14',status:'received',lines:[{name:'كشري',categoryName:'الأطباق الرئيسية',quantity:2}]}],
 ['sent',{concertId:'3',concertNumber:900003,clientName:'خالد',concertDate:'2026-10-13',status:'sent',lines:[{name:'كشري',quantity:999}]}],
]);
globalThis.kitchenPerms={};globalThis.kitchenReads=0;
const cancelled=new Set(),food=new Map();
globalThis.kitchenDb={collection:name=>({where:(field,op,id)=>({get:async()=>({docs:(food.get(id)||[]).map(data=>({data:()=>data}))})}),doc:id=>({id,collection:name,get:async()=>({exists:true,data:()=>name==='users'?{role:'custom',customRoleId:'TEST'}:{permissions:globalThis.kitchenPerms}}),create:async()=>{if(name!=='activity_logs')throw Error('unexpected write')},update:async()=>{if(name!=='activity_logs')throw Error('unexpected write')}})}),getAll:async(...refs)=>{globalThis.kitchenReads++;return refs.map(r=>({id:r.id,exists:r.collection==='concerts'?r.id!=='deleted':orders.has(r.id),data:()=>r.collection==='concerts'?{name:'اسم الحفلة '+r.id,status:cancelled.has(r.id)?'cancelled':'confirmed'}:orders.get(r.id)}))}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export{POST}from'@/app/api/kitchen/export/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*','puppeteer-core','@sparticuz/chromium-min'],plugins:[{name:'sdk',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({contents:`export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'test'}}});export const getAdminDb=()=>globalThis.kitchenDb;`,loader:'ts'}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.kitchen-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.kitchen-api-test.cjs');
const filters={date:{mode:'custom',from:'2026-10-13',to:'2026-10-14'},search:''};
const run=(orderIds=['1','2'],filter=filters,token='TEST',format='pdf',preview=false)=>compiled.exports.POST(new Request('http://localhost/api/kitchen/export',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({orderIds,filters:filter,format,preview})}));
for(const perms of [{},{kitchen:[]},{kitchen:['confirm']},{costs:['export']}]){globalThis.kitchenPerms=perms;assert.equal((await run()).status,403);}assert.equal(globalThis.kitchenReads,0);
globalThis.kitchenPerms={kitchen:['export']};assert.equal((await run(['1'],filters,'INVALID')).status,401);
for(const ids of [[],['1','1'],['missing'],['1/other']])assert.equal((await run(ids)).status,400);
assert.equal((await run(['sent'],filters,'TEST','pdf',true)).status,200);
for(const categories of [null,'all',[true],[''],Array(201).fill('x')])assert.equal((await run(['1'],{...filters,categories})).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-10-14',to:'2026-10-14'}})).status,400);
assert.equal((await run(['1'],{...filters,search:'محمد'})).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-02-30',to:''}})).status,400);
for(const format of ['xlsx','exe'])assert.equal((await run(['1'],filters,'TEST',format)).status,400);
orders.get('1').lines[0].quantity=-1;assert.equal((await run(['1'])).status,400);
orders.get('1').lines[0].quantity=null;
const response=await run();assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.match(response.headers.get('Content-Disposition'),/\.pdf/);assert.equal(response.headers.get('X-Kitchen-Unspecified-Lines'),'1');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await fs.mkdir('tmp/pdfs/kitchen',{recursive:true});await fs.writeFile('tmp/pdfs/kitchen/api-summary.pdf',bytes);
for(const [id,lines] of [['empty',[]],['stale',[]],['cancel',orders.get('2').lines],['deleted',[]]])orders.set(id,{...orders.get('1'),concertId:id,lines});
food.set('stale',[{selectedOption:'صنف مسجل'}]);cancelled.add('cancel');
const ids=['1','sent','empty','stale','cancel','deleted'];
const preview=await (await run(ids,filters,'TEST','pdf',true)).json();
assert.equal(preview.includedCount,2);assert.deepEqual(preview.notices.map(n=>n.code),['no-items','empty-snapshot','cancelled','missing-concert']);
assert.ok(preview.notices.every(n=>n.name.startsWith('اسم الحفلة')));
const selected=await (await run(['1','2'],{...filters,categories:['الحلويات']},'TEST','pdf',true)).json();
assert.equal(selected.includedCount,1);assert.equal(selected.notices[0].code,'category-filter');
const allSkipped=await run(['cancel','empty']);assert.equal(allSkipped.status,400);assert.equal((await allSkipped.json()).notices.length,2);
const mixed=await run(ids,{...filters,categories:['الأطباق الرئيسية']});assert.equal(mixed.status,200);assert.equal(mixed.headers.get('X-Kitchen-Skipped-Orders'),'5');
assert.equal(orders.get('sent').status,'sent');assert.equal((await run(['1'],{...filters,categories:[]})).status,400);
console.log('PASS: actual PDF/auth route; pending accepted without mutation; cancelled/empty/stale/deleted skipped with authoritative reasons; category filters enforced; all-skipped response; invalid/auth cases; actual PDF and unknown warning.');
