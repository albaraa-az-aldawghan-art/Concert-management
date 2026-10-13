import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
const records=new Map();let transactions=0;
const reference=path=>({path,id:path.split('/').at(-1),get:async()=>({exists:records.has(path),data:()=>records.get(path)}),create:async data=>records.set(path,data),update:async data=>records.set(path,{...records.get(path),...data})});
globalThis.incomingFixtureDb={collection:name=>({doc:(id='audit')=>reference(name+'/'+id)}),runTransaction:async fn=>{transactions++;const writes=[];await fn({get:r=>r.get(),update:(r,data)=>writes.push(()=>records.set(r.path,{...records.get(r.path),...data})),delete:r=>writes.push(()=>records.delete(r.path))});for(const write of writes)write();}};
function reset(role,permissions){records.clear();transactions=0;records.set('users/test',{role,customRoleId:'role-test'});records.set('custom_roles/'+(role==='employee'?'role_employee':'role-test'),{permissions});records.set('cost_items/RICE',{name:'أرز مصري',unit:'كجم',totalIn:100,totalOut:0,totalInValue:1000});records.set('cost_incoming/IN',{itemBarcode:'RICE',quantity:12.5,totalBeforeVat:125});}
const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {DELETE} from '@/app/api/costs/incoming/[id]/route';`},bundle:true,write:false,platform:'node',format:'cjs',external:['firebase-admin/*','next/*'],plugins:[{name:'sdk-fixture',setup(b){b.onLoad({filter:/firebase-admin\.ts$/},()=>({contents:`export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'test'}}});export const getAdminDb=()=>globalThis.incomingFixtureDb;`,loader:'ts'}));}}]});
const compiled=new Module(process.cwd()+'/scripts/.incoming-api-test.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(result.outputFiles[0].text,compiled.filename=process.cwd()+'/scripts/.incoming-api-test.cjs');
const remove=token=>compiled.exports.DELETE(new Request('http://localhost/api/costs/incoming/IN',{method:'DELETE',headers:token?{Authorization:'Bearer '+token}:{}}),{params:Promise.resolve({id:'IN'})});
for(const role of ['custom','employee'])for(const permissions of [{},{costs:[]},{costs:['in_view','in_add']},{customers:['edit']}]){
 reset(role,permissions);assert.equal((await remove('TEST')).status,403);assert.equal(transactions,0);assert.equal(records.has('cost_incoming/IN'),true);assert.equal(records.get('cost_items/RICE').totalIn,100);
}
reset('custom',{costs:['in_delete']});assert.equal((await remove()).status,401);assert.equal((await remove('INVALID')).status,401);assert.equal(transactions,0);
for(const role of ['custom','employee','admin']){
 reset(role,role==='admin'?{}:{costs:['in_delete']});assert.equal((await remove('TEST')).status,200);assert.equal(records.has('cost_incoming/IN'),false);assert.equal(records.get('cost_items/RICE').totalIn,87.5);assert.equal(records.get('cost_items/RICE').totalInValue,875);assert.equal((await remove('TEST')).status,404);
}
for(const totalOut of [1,95]){
 reset('custom',{costs:['in_delete']});records.get('cost_items/RICE').totalOut=totalOut;assert.equal((await remove('TEST')).status,400);assert.equal(records.has('cost_incoming/IN'),true);assert.equal(records.get('cost_items/RICE').totalIn,100);assert.equal(records.get('cost_items/RICE').totalInValue,1000);
}
console.log('PASS: actual DELETE/auth/stock service: invalid session 401; unauthorized roles 403 without stock mutation; granted employee/custom/admin deletes precisely 12.5 units and 125 value; repeat 404; consumed/insufficient stock blocks with no writes.');
