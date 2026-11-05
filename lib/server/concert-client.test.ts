import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { svcCreateConcert,svcUpdateConcert } from "./concerts-core";
import { listCustomerChoices } from "./customer-choices";
import { updateConcertCustomer } from "./concert-customers-core";
type Data=Record<string,unknown>;
function mock(){
 const records=new Map<string,Data>();let seq=0;
 const doc=(collection:string,id=`new${++seq}`)=>({id,key:`${collection}/${id}`,get:async()=>({exists:records.has(`${collection}/${id}`),data:()=>records.get(`${collection}/${id}`)}),update:async(p:Data)=>records.set(`${collection}/${id}`,{...records.get(`${collection}/${id}`),...p})});
 const docs=(collection:string)=>[...records].filter(([key])=>key.startsWith(collection+"/")).map(([key,value])=>({id:key.split('/')[1],data:()=>value}));
 const db={collection:(name:string)=>({doc:(id?:string)=>doc(name,id),get:async()=>({docs:docs(name)}),where:(field:string,op:string,value:string)=>({limit:()=>({get:async()=>({docs:docs(name).filter(d=>op==='array-contains'?Array.isArray(d.data()[field])&&(d.data()[field] as string[]).includes(value):d.data()[field]===value).slice(0,2)})})})}),runTransaction:async(fn:(tx:unknown)=>Promise<void>)=>{const writes:(()=>void)[]=[];const tx={get:async(ref:ReturnType<typeof doc>)=>ref.get(),set:(ref:ReturnType<typeof doc>,data:Data,options?:{merge:boolean})=>writes.push(()=>records.set(ref.key,options?.merge?{...records.get(ref.key),...data}:data)),update:(ref:ReturnType<typeof doc>,data:Data)=>writes.push(()=>records.set(ref.key,{...records.get(ref.key),...data}))};await fn(tx);writes.forEach(w=>w());},batch:()=>{const writes:(()=>void)[]=[];return {set:(ref:ReturnType<typeof doc>,data:Data)=>writes.push(()=>records.set(ref.key,{...records.get(ref.key),...data})),update:(ref:ReturnType<typeof doc>,data:Data)=>writes.push(()=>records.set(ref.key,{...records.get(ref.key),...data})),commit:async()=>writes.forEach(w=>w())};}} as unknown as Firestore;
 return {db,records};
}
test("new customer becomes selectable; selecting again reuses one profile, English phones and preserves previous events",async()=>{
 const {db,records}=mock();const data={name:"حفلة",clientName:"أحمد",clientPhone:"٠٥٠٠٠٠٠٠٠١",clientPhone2:"0500000002",date:"2026-11-04"};
 const first=await svcCreateConcert(db,data,"u");const choice=(await listCustomerChoices(db))[0];assert.equal(choice.primaryPhone,"0500000001");
 await svcCreateConcert(db,{...data,customerId:choice.id,clientPhone:"0500000009"},"u");
 assert.equal((await listCustomerChoices(db)).length,1);assert.equal((await listCustomerChoices(db))[0].primaryPhone,"0500000009");
 assert.equal(records.get(`concerts/${first.id}`)?.clientPhone,"0500000001");
 const saved=JSON.stringify([...records]);await assert.rejects(svcCreateConcert(db,{...data,customerId:"phone_missing"},"u"));assert.equal(JSON.stringify([...records]),saved);
});
test("editing a legacy event keeps customer identity/history, clears second phone and rejects another customer's phone",async()=>{
 const {db,records}=mock();records.set("concerts/a",{clientName:"أحمد",clientPhone:"0500000001",clientPhone2:"0500000002"});records.set("concerts/b",{clientName:"أحمد",clientPhone:"0500000001"});
 await svcUpdateConcert(db,"a",{clientName:"أحمد جديد",clientPhone:"٠٥٠٠٠٠٠٠٠٩",clientPhone2:""},"u");
 assert.equal(records.get("concerts/a")?.customerId,"phone_0500000001");assert.equal(records.get("concerts/b")?.clientPhone,"0500000001");
 assert.equal(records.get("concert_customers/phone_0500000001")?.secondaryPhone,null);
 assert.equal((await listCustomerChoices(db)).length,1);
 records.set("concert_customers/phone_0500000007",{name:"عميل آخر",primaryPhone:"0500000007",phoneKeys:["0500000007"]});
 const before=JSON.stringify([...records]);await assert.rejects(svcUpdateConcert(db,"a",{clientPhone:"0500000007"},"u"));assert.equal(JSON.stringify([...records]),before);
 records.set("concerts/legacy-other",{clientName:"عميل قديم آخر",clientPhone:"+966 50 000 0006"});
 await assert.rejects(svcUpdateConcert(db,"a",{clientPhone:"0500000006"},"u"));
});
test("choosing a legacy customer with a corrected phone creates their profile under the same stable ID",async()=>{
 const {db,records}=mock();records.set("concerts/old",{clientName:"عميل قديم",clientPhone:"+966 50 000 0001"});
 const choice=(await listCustomerChoices(db))[0];
 const saved=await svcCreateConcert(db,{name:choice.name,clientName:choice.name,clientPhone:"0500000009",customerId:choice.id,date:"2026-11-04"},"u");
 assert.equal(records.get(`concerts/${saved.id}`)?.customerId,choice.id);assert.equal((await listCustomerChoices(db)).length,1);assert.equal(records.get("concerts/old")?.clientPhone,"+966 50 000 0001");
});
test("customer profile editor rejects a phone already owned by another profile before writing",async()=>{
 const {db,records}=mock();records.set("concert_customers/phone_0500000001",{name:"أحمد",primaryPhone:"0500000001",phoneKeys:["0500000001"]});records.set("concert_customers/phone_0500000002",{name:"خالد",primaryPhone:"0500000002",phoneKeys:["0500000002"]});
 const before=JSON.stringify([...records]);
 await assert.rejects(updateConcertCustomer(db,"phone_0500000001",{name:"أحمد",primaryPhone:"0500000002",secondaryPhone:null,source:null,referralName:null,notes:null},"u"),/مرتبط/);
 await assert.rejects(updateConcertCustomer(db,"phone_0500000001",{name:"أحمد",primaryPhone:"0500000001",secondaryPhone:"0500000002",source:null,referralName:null,notes:null},"u"),/مرتبط/);
 await assert.rejects(svcUpdateConcert(db,"missing",{clientPhone:"0500000002"},"u"));
 await assert.rejects(svcCreateConcert(db,{name:"عميل جديد",clientPhone:"0500000003",clientPhone2:"0500000002",date:"2026-11-05"},"u"),/الثاني/);
 assert.equal(JSON.stringify([...records]),before);
});
