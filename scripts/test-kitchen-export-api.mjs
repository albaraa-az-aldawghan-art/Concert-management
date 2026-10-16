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
globalThis.kitchenDb={collection:name=>({doc:id=>({id,collection:name,get:async()=>({exists:true,data:()=>name==='users'?{role:'custom',customRoleId:'TEST'}:{permissions:globalThis.kitchenPerms}}),create:async()=>{},update:async()=>{}})}),getAll:async(...refs)=>{globalThis.kitchenReads++;return refs.map(r=>({id:r.id,exists:orders.has(r.id),data:()=>r.collection==='concerts'?{name:'اسم الحفلة '+r.id}:orders.get(r.id)}))}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export{POST}from'@/app/api/kitchen/export/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*','puppeteer-core','@sparticuz/chromium-min'],plugins:[{name:'sdk',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({contents:`export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'test'}}});export const getAdminDb=()=>globalThis.kitchenDb;`,loader:'ts'}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.kitchen-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.kitchen-api-test.cjs');
const filters={date:{mode:'custom',from:'2026-10-13',to:'2026-10-14'},search:''};
const run=(orderIds=['1','2'],filter=filters,token='TEST',format='pdf')=>compiled.exports.POST(new Request('http://localhost/api/kitchen/export',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({orderIds,filters:filter,format})}));
for(const perms of [{},{kitchen:[]},{kitchen:['confirm']},{costs:['export']}]){globalThis.kitchenPerms=perms;assert.equal((await run()).status,403);}assert.equal(globalThis.kitchenReads,0);
globalThis.kitchenPerms={kitchen:['export']};assert.equal((await run(['1'],filters,'INVALID')).status,401);
for(const ids of [[],['1','1'],['missing'],['sent'],['1/other']])assert.equal((await run(ids)).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-10-14',to:'2026-10-14'}})).status,400);
assert.equal((await run(['1'],{...filters,search:'محمد'})).status,400);
assert.equal((await run(['1'],{...filters,date:{mode:'custom',from:'2026-02-30',to:''}})).status,400);
for(const format of ['xlsx','exe'])assert.equal((await run(['1'],filters,'TEST',format)).status,400);
orders.get('1').lines[0].quantity=-1;assert.equal((await run(['1'])).status,400);
orders.get('1').lines[0].quantity=null;
const response=await run();assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.match(response.headers.get('Content-Disposition'),/\.pdf/);assert.equal(response.headers.get('X-Kitchen-Unspecified-Lines'),'1');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await fs.mkdir('tmp/pdfs/kitchen',{recursive:true});await fs.writeFile('tmp/pdfs/kitchen/api-summary.pdf',bytes);
console.log('PASS: actual PDF/auth route; export permission required; invalid dates/search/duplicates/missing/pending/negative rejected; Excel rejected; real PDF generated; null quantity warning preserved.');
