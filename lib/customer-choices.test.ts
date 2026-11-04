import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerChoices,normalizeClientContact,searchCustomerChoices } from "./customer-choices";
test("customer choices include legacy and standalone profiles, preserve IDs and never merge matching names",()=>{
 const choices=buildCustomerChoices([{id:"phone_0500000001",name:"أحمد",primaryPhone:"0500000009",secondaryPhone:null,phoneKeys:["0500000001","0500000009"]},{id:"phone_0500000008",name:"عميل جديد",primaryPhone:"0500000008"}], [{id:"old",clientName:"اسم قديم",clientPhone:"٠٥٠٠٠٠٠٠٠١"},{id:"same-name",clientName:"أحمد",clientPhone:"0500000002"}]);
 assert.equal(choices.length,3);assert.equal(choices.find(c=>c.id==="phone_0500000001")?.primaryPhone,"0500000009");
 assert.equal(choices.filter(c=>c.name==="أحمد").length,2);
 assert.equal(searchCustomerChoices(choices,"٠٥٠٠٠٠٠٠٠٩").length,1);
 assert.equal(searchCustomerChoices(choices,"أَحْمَد").length,2);
 assert.ok(choices.every(c=>!('payments'in c)&&!('totalRemaining'in c)));
});
test("contact normalization keeps English digits and supports clearing optional phone",()=>{
 assert.deepEqual(normalizeClientContact({clientName:" أحمد ",clientPhone:"+966 50 000 0001",clientPhone2:""}),{clientName:"أحمد",clientPhone:"0500000001",clientPhone2:null});
 for(const phone of ["", "123", "abc0500000001"])assert.throws(()=>normalizeClientContact({clientName:"أ",clientPhone:phone}));
 assert.throws(()=>normalizeClientContact({clientName:" ",clientPhone:"0500000001"}));
});
