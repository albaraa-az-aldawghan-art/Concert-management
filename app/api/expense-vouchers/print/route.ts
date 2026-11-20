import { NextRequest,NextResponse } from "next/server";
import { ApiError,requireCaller,requirePage,require_,withActivityResponse } from "@/lib/server/guard";
import { voucherId } from "@/lib/server/expense-vouchers-core";
import { renderVoucherPdf } from "@/lib/server/expense-voucher-pdf";
import type { ExpenseVoucher } from "@/lib/expense-vouchers";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:NextRequest){return withActivityResponse(async()=>{try{
  const caller=await requireCaller(req);requirePage(caller,"finances","المالية");require_(caller,"finances","expenses_view","عرض سندات الصرف");require_(caller,"finances","expenses_print","طباعة سند الصرف");
  const body=await req.json(),s=await caller.db.collection("expense_vouchers").doc(voucherId(body.id)).get();
  if(!s.exists)throw new ApiError("السند غير موجود",404);const v=s.data() as ExpenseVoucher;if(v.state!=="posted")throw new ApiError("تُطبع سندات الصرف المعتمدة فقط");
  const buffer=await renderVoucherPdf(v);return new NextResponse(new Uint8Array(buffer) as BodyInit,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${v.number}.pdf"`,"Cache-Control":"no-store"}});
}catch(e){return NextResponse.json({error:e instanceof ApiError?e.message:"تعذر إنشاء سند PDF؛ أعد المحاولة"},{status:e instanceof ApiError?e.status:500});}});}
