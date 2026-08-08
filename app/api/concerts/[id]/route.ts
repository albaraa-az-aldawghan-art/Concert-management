import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcUpdateConcert, svcDeleteConcert } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** تعديل حقول الحفلة المسموح بها فقط — القائمة في concerts-core */
/* لكل حقل صلاحيته: من يملك «تعديل الملاحظات» لا يغيّر السعر.
   الحقل غير المذكور هنا يتبع «تعديل اسم المكان» بوصفه بيانات أساسية. */
const FEATURE_BY_FIELD: Record<string, string> = {
  date: "edit_date",
  venueName: "edit_venue",
  name: "edit_venue",
  clientName: "edit_venue",
  clientPhone: "edit_venue",
  clientPhone2: "edit_venue",
  peopleCount: "edit_people",
  location: "edit_location",
  notes: "edit_notes",
  price: "edit_price",
  vatRate: "edit_price",
  hallCostType: "edit_hall",
  hallCostValue: "edit_hall",
  hallCostDate: "edit_hall",
  hallCostRecipient: "edit_hall",
  supervisorIds: "assign_supervisors",
  employeeIds: "assign_employees",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);

    /* يُفحص كل حقل وصل فعلاً — لا صلاحية واحدة عامة تفتح كل شيء */
    for (const key of Object.keys(body)) {
      if (key === "callerIdToken") continue;
      const feature = FEATURE_BY_FIELD[key];
      if (!feature) continue; // حقل غير قابل للتعديل — يسقطه svcUpdateConcert

      /* إسناد الموظفين يفعله طرفان: من يدير الحفلات من لوحة الأدمن،
         والمشرف من صفحة حفلته. لكلٍّ مفتاحه في صفحته، وأيّهما يكفي. */
      if (key === "employeeIds" && caller.feat("supervisor", "assign_employees")) continue;

      require_(caller, "concerts", feature, `تعديل هذا الحقل (${key})`);
    }

    const { id } = await params;
    await svcUpdateConcert(caller.db, id, body);
  });
}

/** حذف الحفلة — يُفرج عن مواردها المحجوزة أولاً */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "delete", "حذف الحفلات");
    const { id } = await params;
    await svcDeleteConcert(caller.db, id);
  });
}
