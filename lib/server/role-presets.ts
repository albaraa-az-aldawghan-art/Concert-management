/* الصلاحيات المبدئية للأدوار الجاهزة.
   ═══════════════════════════════════════════════════════════════
   هذه نقطة البداية فقط: بعد إنشائها تصير مستندات عادية في
   custom_roles يعدّلها الأدمن كما يشاء. القيم هنا تعكس ما كان كل
   دور يفعله قبل التحويل حرفياً، حتى لا يكسب أحد صلاحية ولا يفقدها
   لحظة الترحيل.
   ═══════════════════════════════════════════════════════════════ */

import { PermissionPage } from "@/types";

export interface RolePreset {
  id: string;
  baseRole: string;
  name: string;
  hint: string;
  permissions: Partial<Record<PermissionPage, string[]>>;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "role_warehouse_manager",
    baseRole: "warehouse_manager",
    name: "مدير الموارد",
    hint: "يجهّز مواد الحفلات ويستلمها ويتابع المفقودات",
    permissions: {
      warehouse: ["view", "add", "edit", "reorder", "delete", "wf_price", "wf_available"],
      warehouse_orders: ["view", "confirm", "confirm_return"],
      missing_items: ["view", "resolve", "mf_value", "mf_actor"],
      settings: [],
    },
  },
  {
    id: "role_supervisor",
    baseRole: "supervisor",
    name: "مشرف",
    hint: "ينفّذ الحفلة ميدانياً: يستلم المواد ويبدأ التنفيذ ويعيدها",
    permissions: {
      supervisor: [
        "view", "receive_materials", "set_location", "start_executing",
        "return_materials", "deliver_warehouse", "assign_employees", "report_missing",
      ],
      settings: [],
    },
  },
  {
    id: "role_employee",
    baseRole: "employee",
    name: "موظف",
    hint: "يرى الحفلات المسندة إليه ومهامه فيها",
    permissions: {
      employees: ["view"],
      settings: [],
    },
  },
  {
    id: "role_kitchen",
    baseRole: "kitchen",
    name: "مطبخ",
    hint: "يستقبل طلبات الحفلات ويؤكّد استلامها",
    permissions: {
      kitchen: ["view", "confirm"],
      settings: [],
    },
  },
];
