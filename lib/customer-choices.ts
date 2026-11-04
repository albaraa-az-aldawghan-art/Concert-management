import { concertCustomerId, normalizeCustomerPhone } from "./concert-customers";
export interface CustomerChoice { id:string; name:string; primaryPhone:string; secondaryPhone:string|null }
type Row={id:string;[key:string]:unknown};
export function normalizeClientContact(value:{clientName:unknown;clientPhone:unknown;clientPhone2?:unknown}){
  const name=String(value.clientName??"").trim();
  if(!name||name.length>120)throw new Error("اسم العميل مطلوب وبحد أقصى 120 حرفًا");
  const phone=(input:unknown,required:boolean)=>{
    const raw=String(input??"").trim();if(!raw&&!required)return null;
    const normalized=normalizeCustomerPhone(raw);
    if(!/^[\d٠-٩۰-۹+()\s.-]+$/.test(raw)||!/^\d{8,15}$/.test(normalized))throw new Error("رقم الجوال يجب أن يحتوي من 8 إلى 15 رقمًا");
    return normalized;
  };
  return {clientName:name,clientPhone:phone(value.clientPhone,true)!,clientPhone2:phone(value.clientPhone2,false)};
}
export function buildCustomerChoices(profiles:Row[],concerts:Row[]):CustomerChoice[]{
  const owners=new Map<string,Set<string>>();
  for(const p of profiles)for(const key of [p.primaryPhone,p.secondaryPhone,...(Array.isArray(p.phoneKeys)?p.phoneKeys:[])]){const phone=normalizeCustomerPhone(key);if(phone){const ids=owners.get(phone)??new Set<string>();ids.add(p.id);owners.set(phone,ids);}}
  const choices=new Map<string,CustomerChoice>();
  const text=(v:unknown)=>typeof v==="string"?v.trim():"";
  const time=(v:unknown)=>{if(v&&typeof v==="object"&&"seconds"in v)return Number(v.seconds)||0;return Date.parse(String(v??""))||0;};
  for(const c of [...concerts].sort((a,b)=>time(a.createdAt)-time(b.createdAt))){
    const phone=normalizeCustomerPhone(c.clientPhone);const ids=owners.get(phone);
    const id=text(c.customerId)||(ids?.size===1?[...ids][0]:concertCustomerId(c.clientPhone,c.id));
    choices.set(id,{id,name:text(c.clientName)||text(c.name)||"عميل بلا اسم",primaryPhone:phone,secondaryPhone:normalizeCustomerPhone(c.clientPhone2)||null});
  }
  for(const p of profiles){const previous=choices.get(p.id);choices.set(p.id,{id:p.id,name:text(p.name)||previous?.name||"عميل بلا اسم",primaryPhone:normalizeCustomerPhone(p.primaryPhone)||previous?.primaryPhone||"",secondaryPhone:p.secondaryPhone===null?null:normalizeCustomerPhone(p.secondaryPhone)||previous?.secondaryPhone||null});}
  return [...choices.values()].sort((a,b)=>a.name.localeCompare(b.name,"ar")||a.primaryPhone.localeCompare(b.primaryPhone));
}
export function searchCustomerChoices(choices:CustomerChoice[],query:string){
  const fold=(text:string)=>text.trim().normalize("NFKC").toLocaleLowerCase("ar").replace(/[\u064B-\u065F\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي");
  const q=fold(query);
  const phone=normalizeCustomerPhone(query);
  return choices.filter(c=>!q||fold(c.name).includes(q)||!!phone&&[c.primaryPhone,c.secondaryPhone??""].some(p=>normalizeCustomerPhone(p).includes(phone)));
}
