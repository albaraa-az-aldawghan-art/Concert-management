"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { type CustomerChoice, searchCustomerChoices } from "@/lib/customer-choices";
import { Input, Select } from "./input";
import { Button } from "./button";
export function CustomerPicker({value,onSelect}:{value:string;onSelect:(choice:CustomerChoice|null)=>void}){
  const [choices,setChoices]=useState<CustomerChoice[]>([]),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  async function load(){setLoading(true);setError(false);try{setChoices(await api.get<CustomerChoice[]>("/api/customers/choices"));}catch{setError(true);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const matched=searchCustomerChoices(choices,query);
  const selected=choices.find(choice=>choice.id===value);
  return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <Input label="البحث في العملاء السابقين" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم العميل أو رقم جواله"/>
    {loading?<p role="status" className="text-xs text-slate-500">جارٍ تحميل قائمة العملاء...</p>:error?<div role="alert" className="text-sm text-amber-800">تعذر تحميل القائمة؛ يمكنك إعادة المحاولة أو تسجيل بيانات العميل يدويًا.<Button type="button" variant="outline" size="sm" onClick={load}>إعادة تحميل العملاء</Button></div>:<>
      <Select label="اختيار عميل سابق" value={selected?value:""} onChange={e=>{onSelect(choices.find(c=>c.id===e.target.value)??null);setQuery("");}}>
        <option value="">عميل جديد / اختر من القائمة</option>
        {selected&&!matched.some(choice=>choice.id===selected.id)&&<option value={selected.id}>العميل المحدد: {selected.name} — {selected.primaryPhone}</option>}
        {matched.map(c=><option key={c.id} value={c.id}>{c.name} — {c.primaryPhone||"بلا رقم"}{c.secondaryPhone?` / ${c.secondaryPhone}`:""}</option>)}
      </Select>
      {!matched.length&&<p className="text-xs text-slate-500">لا يوجد عميل مطابق؛ أدخل بيانات العميل الجديد في الحقول أدناه.</p>}
      {!!value&&!selected&&<p role="alert" className="text-xs text-amber-800">العميل المحفوظ في المسودة غير موجود في القائمة الحالية؛ اختر عميلًا أو اضغط تسجيل عميل جديد.</p>}
    </>}
    <Button type="button" variant="secondary" size="sm" onClick={()=>{onSelect(null);setQuery("");}}>تسجيل عميل جديد</Button>
    <p className="text-xs leading-5 text-slate-500">اختيار العميل يملأ الاسم والجوالين. يُحفظ العميل الجديد عند حفظ الحفلة ويظهر في القائمة مستقبلًا.</p>
  </div>;
}
