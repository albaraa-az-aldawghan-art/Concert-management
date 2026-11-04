"use client";
import { useRef,useState } from "react";
import { normalizeClientContact } from "@/lib/customer-choices";
import { Modal } from "./modal";
import { Input } from "./input";
import { Button } from "./button";
import { useToast } from "./toast";
import { Pencil } from "lucide-react";
export function ConcertClientEditor({name,phone,phone2,canEdit,onSave}:{name:string|null;phone:string|null;phone2:string|null;canEdit:boolean;onSave:(contact:{clientName:string;clientPhone:string;clientPhone2:string|null})=>Promise<void>}){
  const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState({clientName:"",clientPhone:"",clientPhone2:""});
  const lock=useRef(false);const {showToast}=useToast();
  if(!canEdit)return null;
  async function save(e:React.FormEvent){e.preventDefault();if(lock.current)return;let contact;try{contact=normalizeClientContact(form);}catch(error){showToast((error as Error).message,"error");return;}lock.current=true;setSaving(true);try{await onSave(contact);setOpen(false);showToast("تم حفظ بيانات العميل وأرقام الجوال");}catch(error){showToast(error instanceof Error?error.message:"تعذر حفظ البيانات","error");}finally{setSaving(false);lock.current=false;}}
  return <><Button type="button" variant="secondary" size="sm" onClick={()=>{setForm({clientName:name??"",clientPhone:phone??"",clientPhone2:phone2??""});setOpen(true);}}><Pencil size={13}/> تعديل بيانات العميل</Button>
  <Modal open={open} onClose={()=>{if(!saving)setOpen(false);}} title="تعديل بيانات العميل والجوال">
    <form onSubmit={save} className="space-y-4" noValidate><fieldset disabled={saving} className="space-y-4">
      <Input label="اسم العميل" value={form.clientName} onChange={e=>setForm({...form,clientName:e.target.value})} required maxLength={120}/>
      <Input label="رقم الجوال الأول" type="tel" value={form.clientPhone} onChange={e=>setForm({...form,clientPhone:e.target.value})} required maxLength={24}/>
      <Input label="رقم الجوال الثاني" type="tel" value={form.clientPhone2} onChange={e=>setForm({...form,clientPhone2:e.target.value})} maxLength={24}/>
      <p className="text-xs leading-6 text-slate-500">يُحفظ التعديل لهذه الحفلة وفي قائمة العميل للحفلات المقبلة، دون تغيير بيانات الحفلات السابقة.</p>
      <div className="flex gap-2"><Button type="submit" loading={saving}>حفظ بيانات العميل</Button><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>إلغاء</Button></div>
    </fieldset></form>
  </Modal></>;
}
