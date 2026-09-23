export type ActivityStatus = "pending" | "success" | "failed" | "interaction";
export interface ActivityEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  path: string;
  targetId: string;
  status: ActivityStatus;
  source: "server" | "browser";
  createdAt: string;
}

const subjects: Record<string, string> = {
  concerts: "الحفلات", contracts: "التعاقدات", payments: "الدفعات",
  warehouse: "الموارد", expenses: "المصروفات", packages: "البكجات",
  "missing-items": "المفقودات", "sales-sections": "منتجات البيع",
  costs: "التكاليف", orders: "الطلبات", "dispense-requests": "طلبات الصرف",
  restaurant: "المطعم", admin: "المستخدمين", roles: "الأدوار والصلاحيات",
  settings: "الإعدادات", drafts: "مسودات الحفلات", export: "التصدير",
};
const actions: Record<string, string> = {
  cancel: "إلغاء", return: "إرجاع الموارد", paid: "تغيير حالة السداد",
  invoice: "تعديل الفاتورة", flag: "تعديل العلامة", food: "أصناف الأكل",
  items: "الأصناف", incoming: "الوارد", outgoing: "المنصرف", damage: "التالف",
  production: "الإنتاج", settle: "التسوية", channel: "قناة الصرف",
  status: "تغيير الحالة", "post-collections": "ترحيل التحصيلات",
  "ledger-config": "إعدادات السجل", "ledger-item-order": "ترتيب السجل",
  "item-order": "ترتيب الأصناف", days: "الجدول اليومي", import: "الاستيراد",
  "create-user": "إنشاء مستخدم", "update-user": "تعديل مستخدم",
  "delete-user": "حذف مستخدم", logs: "إضافة ملاحظة", keys: "مفاتيح التصدير",
};

/** Never include query strings, request bodies, passwords or export keys. */
export function describeActivity(method: string, pathname: string, body?: Record<string, unknown>) {
  const parts = pathname.split("?")[0].split("/").filter(Boolean).slice(1);
  const effectiveMethod = method === "POST" && body?.id && ["roles", "drafts"].includes(parts[0]) ? "PATCH" : method;
  const verb = ({ POST: "إضافة / تنفيذ", PATCH: "تعديل", PUT: "تحديث", DELETE: "حذف", GET: "عرض / تصدير" } as Record<string, string>)[effectiveMethod] ?? "تنفيذ";
  const details = parts.slice(1).filter((p) => actions[p]).map((p) => actions[p]);
  if (parts[0] === "concerts" && parts.includes("flag")) {
    const flags: Record<string, string> = { delivery: "تأكيد التسليم", executing: "بدء التنفيذ", return: "تأكيد الإرجاع", toWarehouse: "تسليم الموارد للمستودع" };
    if (typeof body?.flag === "string" && flags[body.flag]) details.push(`${body.undo ? "تراجع عن " : ""}${flags[body.flag]}`);
  }
  return `${verb} — ${subjects[parts[0]] ?? "النظام"}${details.length ? ` — ${details.join(" / ")}` : ""}`;
}

export function shouldAudit(method: string, path: string) {
  return !path.startsWith("/api/activity") && path !== "/api/admin/last-signin" &&
    (method !== "GET" || path.includes("/export") || path.includes("/contract-pdf"));
}
