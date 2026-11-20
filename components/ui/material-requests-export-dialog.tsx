"use client";
import { useRef,useState } from "react";
import { Download,Search } from "lucide-react";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/download-file";
import { MATERIAL_STATES } from "@/lib/material-requests";
import { DEFAULT_MATERIAL_EXPORT_COLUMNS,MATERIAL_EXPORT_COLUMNS,type MaterialExportColumn,type MaterialExportFilters } from "@/lib/material-requests-export";
import { Modal } from "./modal";
import { Button } from "./button";
import { Input,Select } from "./input";
import { useToast } from "./toast";

const endpoint="/api/costs/material-requests/export";
export function MaterialRequestsExportDialog({initial,onClose}:{initial:{from:string;to:string;q:string;state:string};onClose:()=>void}) {
  const {showToast}=useToast();
  const [filters,setFilters]=useState<MaterialExportFilters>({basis:"request",...initial});
  const [columns,setColumns]=useState<MaterialExportColumn[]>(DEFAULT_MATERIAL_EXPORT_COLUMNS);
  const [ids,setIds]=useState<string[]|null>(null);
  const [summary,setSummary]=useState(false),[arrivals,setArrivals]=useState(false);
  const [busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState("");
  const generation=useRef(0),lock=useRef(false);
  function changeFilters(next:Partial<MaterialExportFilters>){generation.current++;setFilters(f=>({...f,...next}));setIds(null);setBusy(false);setError("");}
  async function preview(){const version=++generation.current;setBusy(true);setError("");setIds(null);
    try{const data=await api.post<{requests:{id:string}[]}>(endpoint,{preview:true,filters});if(version===generation.current)setIds(data.requests.map(r=>r.id));}
    catch(e){if(version===generation.current)setError(e instanceof Error?e.message:"تعذر تحميل نتائج التصدير");}
    finally{if(version===generation.current)setBusy(false);}
  }
  async function download(){if(lock.current||!ids?.length||!columns.length)return;lock.current=true;setExporting(true);setError("");
    try{const token=await auth.currentUser?.getIdToken();if(!token)throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({filters,columns,requestIds:ids,summary,arrivals})});
      if(!response.ok){const result=await response.json();throw new Error(result.error||"تعذر التصدير");}
      const blob=await response.blob();if(blob.size<1000)throw new Error("ملف Excel غير مكتمل؛ أعد المحاولة");
      downloadBlob(blob,"طلبات-المواد.xlsx");showToast("تم تنزيل ملف طلبات المواد");onClose();
    }catch(e){setError(e instanceof Error?e.message:"تعذر التصدير");}finally{lock.current=false;setExporting(false);}
  }
  return <Modal open onClose={()=>{if(!exporting){generation.current++;onClose();}}} title="تصدير طلبات المواد إلى Excel" size="xl"><div className="space-y-5" dir="rtl">
    <fieldset disabled={exporting} className="space-y-3"><legend className="mb-2 text-sm font-bold text-[#1C2D50]">الفترة والفلاتر</legend>
      <Select label="الفترة حسب" value={filters.basis} onChange={e=>changeFilters({basis:e.target.value as "request"|"delivery"})}><option value="request">تاريخ الطلب</option><option value="delivery">تاريخ التوريد الفعلي</option></Select>
      <div className="grid grid-cols-2 gap-3"><Input label="من تاريخ" type="date" value={filters.from} onChange={e=>changeFilters({from:e.target.value})}/><Input label="إلى تاريخ" type="date" value={filters.to} onChange={e=>changeFilters({to:e.target.value})}/></div>
      <div className="grid gap-3 sm:grid-cols-2"><Input label="البحث في الطلبات المصدّرة" value={filters.q??""} onChange={e=>changeFilters({q:e.target.value})} placeholder="بداية اسم المادة أو الباركود"/><Select label="حالة الطلب المصدّر" value={filters.state??""} onChange={e=>changeFilters({state:e.target.value})}><option value="">كل الحالات</option>{Object.entries(MATERIAL_STATES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select></div>
      <p className="rounded-xl bg-blue-50 p-3 text-xs leading-6 text-blue-900">الفترة تشمل يومي البداية والنهاية. المتبقي والإجماليات حسب الحالة الحالية، و«الواصل خلال الفترة» حسب تاريخ الوصول. النتائج من جميع الصفحات وبحسب صلاحياتك.</p>
      <Button variant="outline" onClick={()=>void preview()} loading={busy}><Search size={15}/> التحقق من الطلبات المطابقة</Button>
      {ids!==null&&<p role="status" className="text-sm font-semibold text-[#1C2D50]">{ids.length?`سيُصدّر ${ids.length} طلبًا مطابقًا للفلاتر.`:"لا توجد طلبات مطابقة للفترة والفلاتر."}</p>}
    </fieldset>
    <fieldset disabled={exporting} className="space-y-2"><legend className="mb-2 text-sm font-bold">اختر أعمدة Excel ({columns.length} من {MATERIAL_EXPORT_COLUMNS.length})</legend>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setColumns(MATERIAL_EXPORT_COLUMNS.map(c=>c.key))}>تحديد كل الأعمدة</Button><Button size="sm" variant="ghost" onClick={()=>setColumns(DEFAULT_MATERIAL_EXPORT_COLUMNS)}>الأعمدة الافتراضية</Button><Button size="sm" variant="ghost" onClick={()=>setColumns([])}>إلغاء تحديد الأعمدة</Button></div>
      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-xl border p-2 sm:grid-cols-3">{MATERIAL_EXPORT_COLUMNS.map(column=><label key={column.key} className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 text-xs leading-5 ${columns.includes(column.key)?"bg-[#EEF1F7] text-[#1C2D50]":"text-slate-500"}`}><input type="checkbox" className="mt-1" checked={columns.includes(column.key)} onChange={e=>setColumns(keys=>e.target.checked?[...keys,column.key]:keys.filter(key=>key!==column.key))}/>{column.label}</label>)}</div>
    </fieldset>
    <fieldset disabled={exporting} className="space-y-2 text-sm"><legend className="mb-2 font-bold">أوراق إضافية اختيارية</legend><label className="flex items-center gap-2"><input type="checkbox" checked={summary} onChange={e=>setSummary(e.target.checked)}/> ملخص بالكميات المختارة حسب المادة والوحدة</label><label className="flex items-center gap-2"><input type="checkbox" checked={arrivals} onChange={e=>setArrivals(e.target.checked)}/> تفاصيل دفعات التوريد: التاريخ والمادة والكمية والمورد والفاتورة والتوجيه</label></fieldset>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button onClick={()=>void download()} loading={exporting} disabled={busy||!ids?.length||!columns.length}><Download size={16}/> تنزيل Excel ({ids?.length??0} طلب)</Button>
  </div></Modal>;
}
