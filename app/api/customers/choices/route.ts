import { NextRequest } from "next/server";
import { handle, requireCaller, require_ } from "@/lib/server/guard";
import { listCustomerChoices } from "@/lib/server/customer-choices";
export const dynamic="force-dynamic";
/** Contact-only lookup for concert creators; never returns balances or payments. */
export async function GET(req:NextRequest){return handle(async()=>{const caller=await requireCaller(req);require_(caller,"concerts","create","اختيار عميل لإنشاء حفلة");return listCustomerChoices(caller.db);});}
