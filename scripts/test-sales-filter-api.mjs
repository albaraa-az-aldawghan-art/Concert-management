import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
import ExcelJS from 'exceljs';
const records={concerts:{a:{name:'نهاية السنة',date:'2026-12-31',price:1000,status:'confirmed'},b:{name:'بداية السنة',date:'2027-01-01',price:2000,status:'confirmed'},cancelled:{name:'ملغاة',date:'2026-12-31',price:500,status:'cancelled'}},concert_payments:{p:{concertId:'b',amount:500,date:'2026-12-31',method:'cash'}}};
globalThis.salesPerms={};globalThis.salesReads=0;
function collection(name,predicates=[]){return{
  doc:id=>({id,collectionName:name,get:async()=>({exists:true,data:()=>name==='users'?{role:'custom',customRoleId:'TEST'}:{permissions:globalThis.salesPerms}}),create:async()=>{},update:async()=>{}}),
  where:(field,op,value)=>collection(name,[...predicates,[field,op,value]]),
  get:async()=>({docs:Object.entries(records[name]||{}).filter(([,c])=>predicates.every(([f,op,v])=>op==='in'?v.includes(c[f]):true)).map(([id,c])=>({id,data:()=>c}))}),
};}
globalThis.salesDb={collection,getAll:async(...refs)=>{globalThis.salesReads++;return refs.map(r=>({id:r.id,exists:!!records[r.collectionName]?.[r.id],data:()=>records[r.collectionName]?.[r.id]}))}};
const built=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export{POST}from'@/app/api/export/sales/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*'],plugins:[{name:'sdk',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({contents:`export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'test'}}});export const getAdminDb=()=>globalThis.salesDb;`,loader:'ts'}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.sales-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(built.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.sales-api-test.cjs');
const scope={concertIds:['a','b'],dateField:'date',from:'2026-12-31',to:'2027-01-01',financialOnly:true};
const run=(value=scope,token='TEST',suffix='')=>compiled.exports.POST(new Request('http://localhost/api/export/sales?cols=name,price,paid,due'+suffix,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({scope:value})}));
for(const perms of [{},{concerts:['create']},{costs:['export']}]){globalThis.salesPerms=perms;assert.equal((await run()).status,403);}assert.equal(globalThis.salesReads,0);
globalThis.salesPerms={concerts:['export']};assert.equal((await run(scope,'INVALID')).status,401);assert.equal((await run(scope,'TEST','&key=invalid')).status,403);
for(const invalid of [null,{...scope,concertIds:[]},{...scope,concertIds:['a','a']},{...scope,concertIds:['a/b']},{...scope,dateField:'other'},{...scope,from:'2026-02-30'},{...scope,from:'2027-02-01'},{...scope,concertIds:['missing']},{...scope,concertIds:['cancelled']},{...scope,to:'2026-12-31'}])assert.equal((await run(invalid)).status,400);
const response=await run();assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/spreadsheetml/);assert.match(response.headers.get('Content-Disposition'),/filtered/);
const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await response.arrayBuffer()));const summary=wb.getWorksheet('ملخص الفترة');assert.equal(summary.getCell('B5').value,2);assert.equal(summary.getCell('D5').value,3000);assert.equal(summary.getCell('G5').value,500);assert.equal(summary.getCell('H5').value,2500);
console.log('PASS: signed filtered export; independent export permission; invalid/duplicate/missing IDs, cancelled financial records, out-of-period and reversed/invalid dates rejected; XLSX totals across two years.');
