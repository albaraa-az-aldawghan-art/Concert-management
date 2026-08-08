/* كتالوج الصلاحيات المفصّل.
   ═══════════════════════════════════════════════════════════════
   ثلاث مراتب: الصفحة ← مجموعة داخلها ← صلاحية مفردة.

   • الإجراءات (actions): ما يستطيع فعله — إضافة، تعديل، حذف…
   • الحقول (fields): ما يستطيع رؤيته داخل المجموعة — المبلغ، البنك،
     رقم الفاتورة، من سجّلها…

   المفتاح المخزَّن هو مفتاح الصلاحية المفرد داخل الصفحة، فيبقى شكل
   التخزين كما هو: { صفحة: [مفاتيح] } — ولا تتغيّر دالة الفحص.

   قاعدتان تحكمان هذا الملف:
   ١. لا تكرار: كل إجراء يظهر في مكان واحد فقط. البكجات مثلاً لها
      صفحتها ولا تُعاد تحت الحفلات.
   ٢. لا صلاحية بلا أثر: كل مفتاح هنا يُفحص فعلاً في الواجهة، وكل
      إجراء يكتب في قاعدة البيانات يُفحص في الخادم أيضاً. يحرس ذلك
      اختبار يقارن الكتالوج بالشيفرة.
   ═══════════════════════════════════════════════════════════════ */

import { PermissionPage } from "@/types";

export interface PermItem {
  key: string;
  label: string;
  /** توضيح يظهر تحت الاسم عند الحاجة */
  hint?: string;
  /** صلاحية حسّاسة — تُميَّز بصرياً لأن منحها بلا انتباه مكلف */
  sensitive?: boolean;
  /** لم تُربط بعد بأي زر في الواجهة — تُعرض معطَّلة فلا تُوهم بتحكّم لا يقع */
  pending?: boolean;
}

export interface PermGroup {
  key: string;
  label: string;
  hint?: string;
  /** ما يستطيع فعله */
  actions: PermItem[];
  /** ما يستطيع رؤيته من حقول هذه المجموعة. غيابها = لا تفصيل حقول */
  fields?: PermItem[];
}

export interface PermissionPageDef {
  key: PermissionPage;
  label: string;
  href: string;
  hint?: string;
  groups: PermGroup[];
}

/* اختصار: عرض المجموعة نفسها. يتكرّر في كل مجموعة تقريباً فيُكتب مرة. */
const VIEW = (label = "عرض القسم"): PermItem => ({ key: "view", label });

export const PERMISSION_CATALOG: PermissionPageDef[] = [
  /* ══════════════════ لوحة التحكم ══════════════════ */
  {
    key: "dashboard",
    label: "لوحة التحكم",
    href: "/admin",
    hint: "الصفحة الأولى بعد الدخول — كل بطاقة فيها تُظهَر أو تُخفى وحدها",
    groups: [
      {
        key: "money",
        label: "الأرقام المالية",
        hint: "أرقام كل الحفلات مجموعة — إظهارها يكشف حجم العمل كاملاً",
        actions: [],
        fields: [
          { key: "rev",             label: "إجمالي الإيرادات", sensitive: true },
          { key: "collected",       label: "إجمالي المحصَّل" },
          { key: "remaining",       label: "إجمالي المتبقي" },
          { key: "costs",           label: "مصاريف القاعات والنقل" },
          { key: "collection_rate", label: "نسبة التحصيل" },
        ],
      },
      {
        key: "widgets",
        label: "البطاقات والمخططات",
        actions: [],
        fields: [
          { key: "counters",     label: "عدادات النظام (موظفون، موارد، مفقودات)" },
          { key: "status_chart", label: "مخطط حالة الحفلات" },
          { key: "recent",       label: "آخر الحفلات" },
          { key: "quick_links",  label: "الروابط السريعة" },
        ],
      },
    ],
  },

  /* ══════════════════ القائمة المالية ══════════════════ */
  {
    key: "finances",
    label: "القائمة المالية",
    href: "/admin/finances",
    hint: "الملخّص المالي لكل الحفلات",
    groups: [
      {
        key: "summary",
        label: "الإجماليات",
        actions: [VIEW("عرض بطاقات الإجماليات")],
        fields: [
          { key: "f_total",     label: "إجمالي قيمة الحفلات", pending: true },
          { key: "f_collected", label: "المحصَّل", pending: true },
          { key: "f_remaining", label: "المتبقي", pending: true },
          { key: "f_vat",       label: "الضريبة والصافي قبلها", pending: true },
        ],
      },
      {
        key: "table",
        label: "الجدول التفصيلي",
        actions: [{ key: "table_view", label: "عرض جدول الحفلات المالي" }],
        fields: [
          { key: "f_client",  label: "اسم العميل", pending: true },
          { key: "f_price",   label: "سعر الحفلة", pending: true },
          { key: "f_paid",    label: "المدفوع والمتبقي", pending: true },
          { key: "f_costs",   label: "التكاليف (القاعة والنقل والعمالة)", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ الحفلات ══════════════════ */
  {
    key: "concerts",
    label: "الحفلات",
    href: "/admin/concerts",
    hint: "القائمة وصفحة تفاصيل الحفلة بكل أقسامها",
    groups: [
      {
        key: "concert",
        label: "الحفلة نفسها",
        actions: [
          { key: "create",    label: "إنشاء حفلة جديدة" },
          { key: "cancel",    label: "إلغاء الحفلة", hint: "يُحرّر موادها ويوقف تكاليفها" },
          { key: "mark_paid", label: "تعليم الحفلة مدفوعة بالكامل" },
          { key: "delete",    label: "حذف الحفلة نهائياً", sensitive: true },
          { key: "export",    label: "تصدير المبيعات إلى إكسل", sensitive: true },
        ],
      },
      {
        key: "basics",
        label: "بيانات الحفلة",
        hint: "الحقول التي تُعدَّل من صفحة التفاصيل",
        actions: [
          { key: "edit_date",      label: "تعديل التاريخ والوقت" },
          { key: "edit_venue",     label: "تعديل اسم المكان" },
          { key: "edit_location",  label: "تعديل الموقع على الخريطة" },
          { key: "edit_people",    label: "تعديل عدد الأشخاص" },
          { key: "edit_notes",     label: "تعديل الملاحظات" },
          { key: "edit_price",     label: "تعديل سعر الحفلة", sensitive: true },
          { key: "edit_hall",      label: "تعديل مبلغ القاعة" },
        ],
      },
      {
        key: "payments",
        label: "الدفعات",
        hint: "دفعات العميل على الحفلة",
        actions: [
          { key: "pay_view",    label: "عرض الدفعات" },
          { key: "pay_add",     label: "إضافة دفعة" },
          { key: "pay_invoice", label: "تسجيل رقم الفاتورة وتعديل حالتها" },
          { key: "pay_delete",  label: "حذف دفعة", sensitive: true },
        ],
        fields: [
          { key: "pf_method",  label: "طريقة الدفع (نقد، تحويل، شبكة)" },
          { key: "pf_date",    label: "تاريخ الدفعة" },
          { key: "pf_amount",  label: "المبلغ" },
          { key: "pf_bank",    label: "البنك واسم المحوِّل والمستلم" },
          { key: "pf_invoice", label: "رقم الفاتورة وحالتها" },
          { key: "pf_actor",   label: "من سجّل الدفعة" },
        ],
      },
      {
        key: "expenses",
        label: "فواتير المصروفات",
        hint: "النقل والعمالة وغيرها",
        actions: [
          { key: "exp_view",   label: "عرض الفواتير" },
          { key: "exp_add",    label: "إضافة فاتورة مصروف" },
          { key: "exp_delete", label: "حذف فاتورة", sensitive: true },
        ],
        fields: [
          { key: "ef_type",     label: "نوع المصروف" },
          { key: "ef_supplier", label: "المورد" },
          { key: "ef_amount",   label: "المبلغ وشمول الضريبة" },
          { key: "ef_date",     label: "تاريخ الفاتورة" },
          { key: "ef_actor",    label: "من سجّل الفاتورة" },
        ],
      },
      {
        key: "materials",
        label: "مواد الحفلة",
        actions: [
          { key: "mat_view",     label: "عرض المواد" },
          { key: "mat_add",      label: "إضافة مواد للحفلة" },
          { key: "mat_edit_qty", label: "تعديل الكميات" },
          { key: "mat_delete",   label: "حذف مادة من الحفلة" },
        ],
        fields: [
          { key: "mf_cost",     label: "تكلفة المادة وقيمتها" },
          { key: "mf_assignee", label: "الموظف المسؤول عن المادة" },
          { key: "mf_status",   label: "حالة التسليم والإرجاع" },
        ],
      },
      {
        key: "food",
        label: "أصناف الأكل",
        actions: [
          { key: "food_view",     label: "عرض الأصناف" },
          { key: "food_add",      label: "إضافة أصناف" },
          { key: "food_edit_qty", label: "تعديل الكميات" },
          { key: "food_delete",   label: "حذف صنف" },
          { key: "send_kitchen",  label: "الإرسال للمطبخ" },
        ],
        fields: [
          { key: "ff_cost",      label: "التكلفة التقديرية للأكل" },
          { key: "ff_available", label: "المتوفر من الخامات" },
        ],
      },
      {
        key: "team",
        label: "الفريق",
        actions: [
          { key: "assign_supervisors", label: "إسناد المشرفين" },
          { key: "assign_employees",   label: "إسناد الموظفين" },
        ],
      },
      {
        key: "docs",
        label: "العقد والسجل",
        actions: [
          { key: "contract_view", label: "عرض العقد وطباعته" },
          { key: "stages_view",   label: "عرض مراحل الحفلة" },
          { key: "log_view",      label: "عرض سجل التعديلات" },
        ],
      },
    ],
  },

  /* ══════════════════ البكجات ══════════════════
     كانت تحت الحفلات ولها صفحتها — فصلها يمنع التكرار */
  {
    key: "packages",
    label: "البكجات",
    href: "/admin/packages",
    hint: "مجموعات جاهزة من أصناف الأكل والمواد",
    groups: [
      {
        key: "packages",
        label: "البكجات",
        actions: [
          VIEW("عرض البكجات"),
          { key: "create", label: "إنشاء بكج", pending: true },
          { key: "edit",   label: "تعديل بكج ومحتوياته", pending: true },
          { key: "delete", label: "حذف بكج", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ التعاقدات ══════════════════ */
  {
    key: "contracts",
    label: "التعاقدات",
    href: "/admin/contracts",
    groups: [
      {
        key: "contract",
        label: "العقد",
        actions: [
          VIEW("عرض التعاقدات"),
          { key: "create", label: "إنشاء عقد" },
          { key: "edit",   label: "تعديل العقد ومدته" },
          { key: "terms",  label: "تعديل بنود العقد وأسعارها" },
          { key: "cancel", label: "إلغاء العقد" },
          { key: "complete", label: "إنهاء العقد" },
          { key: "delete", label: "حذف العقد", sensitive: true },
          { key: "export", label: "تصدير التعاقدات إلى إكسل", sensitive: true, pending: true },
        ],
        fields: [
          { key: "cf_value",  label: "قيمة العقد" },
          { key: "cf_client", label: "بيانات العميل وجوّاله" },
          { key: "cf_actor",  label: "من أنشأ العقد" },
        ],
      },
      {
        key: "payments",
        label: "دفعات العقود",
        actions: [
          { key: "pay_view",   label: "عرض الدفعات", pending: true },
          { key: "pay_add",    label: "تسجيل دفعة" },
          { key: "pay_delete", label: "حذف دفعة", sensitive: true, pending: true },
        ],
        fields: [
          { key: "pf_method",  label: "طريقة الدفع", pending: true },
          { key: "pf_date",    label: "تاريخ الدفعة", pending: true },
          { key: "pf_amount",  label: "المبلغ والمتبقي", pending: true },
          { key: "pf_bank",    label: "البنك واسم المحوِّل", pending: true },
          { key: "pf_invoice", label: "رقم الفاتورة", pending: true },
          { key: "pf_actor",   label: "من سجّل الدفعة", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ المطعم ══════════════════ */
  {
    key: "restaurant",
    label: "المطعم",
    href: "/admin/restaurant",
    hint: "المنصرف الشهري وحسابه",
    groups: [
      {
        key: "costs",
        label: "تكاليف المطعم",
        actions: [
          VIEW("عرض تكاليف المطعم الشهرية"),
          { key: "export", label: "تصدير تكاليف المطعم", sensitive: true, pending: true },
        ],
        fields: [
          { key: "rf_by_dept", label: "التوزيع على الأقسام", pending: true },
          { key: "rf_by_item", label: "تفصيل الأصناف", pending: true },
          { key: "rf_ops",     label: "قائمة العمليات ومن نفّذها", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ منتجات البيع ══════════════════ */
  {
    key: "food",
    label: "منتجات البيع",
    href: "/admin/food",
    hint: "أقسام البيع في القنوات الثلاث وأصنافها",
    groups: [
      {
        key: "sections",
        label: "أقسام البيع",
        actions: [
          VIEW("عرض الأقسام"),
          { key: "add",     label: "إضافة قسم" },
          { key: "rename",  label: "تعديل اسم القسم" },
          { key: "delete",  label: "حذف قسم", pending: true },
          { key: "reorder", label: "إعادة الترتيب بالسحب", pending: true },
          { key: "assign",  label: "ضمّ الأصناف للأقسام وإخراجها", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ التكاليف ══════════════════ */
  {
    key: "costs",
    label: "التكاليف",
    href: "/admin/costs",
    hint: "الخامات: تسجيلها ووارِدها ومنصرفها وإنتاجها وتالفها",
    groups: [
      {
        key: "items",
        label: "الأصناف",
        actions: [
          VIEW("عرض الأصناف"),
          { key: "item_add",     label: "تسجيل صنف جديد" },
          { key: "item_edit",    label: "تعديل صنف", pending: true },
          { key: "item_delete",  label: "حذف صنف", pending: true },
          { key: "item_import",  label: "استيراد عدة أصناف دفعة واحدة", pending: true },
          { key: "item_barcode", label: "توليد الباركود وطباعة الملصق", pending: true },
          { key: "item_config",  label: "تعديل الوحدات والأقسام", hint: "يمسّ كل الأصناف", pending: true },
        ],
        fields: [
          { key: "if_avg_cost", label: "متوسط تكلفة الوحدة", sensitive: true, pending: true },
          { key: "if_dates",    label: "تاريخ الإنتاج والانتهاء", pending: true },
        ],
      },
      {
        key: "incoming",
        label: "الوارد",
        actions: [
          { key: "in_view",   label: "عرض الوارد", pending: true },
          { key: "in_add",    label: "تسجيل وارد من مورّد" },
          { key: "in_delete", label: "حذف عملية وارد", sensitive: true, hint: "يعيد حساب الرصيد والمتوسط", pending: true },
        ],
        fields: [
          { key: "inf_supplier", label: "اسم المورّد", pending: true },
          { key: "inf_price",    label: "السعر والإجمالي", sensitive: true, pending: true },
          { key: "inf_date",     label: "تاريخ الفاتورة", pending: true },
          { key: "inf_actor",    label: "من سجّل العملية", pending: true },
        ],
      },
      {
        key: "outgoing",
        label: "المنصرف",
        actions: [
          { key: "out_view",   label: "عرض المنصرف", pending: true },
          { key: "out_add",    label: "تسجيل منصرف" },
          { key: "out_settle", label: "إرجاع للمخزون أو تسجيل تالف", pending: true },
          { key: "out_delete", label: "حذف عملية منصرف", sensitive: true, pending: true },
        ],
        fields: [
          { key: "of_cost",   label: "تكلفة المنصرف", sensitive: true, pending: true },
          { key: "of_dest",   label: "الجهة (حفلة، عقد، قسم)", pending: true },
          { key: "of_date",   label: "تاريخ الصرف", pending: true },
          { key: "of_actor",  label: "من سجّل العملية", pending: true },
        ],
      },
      {
        key: "production",
        label: "الإنتاج",
        actions: [
          { key: "prod_view",   label: "عرض الإنتاج", pending: true },
          { key: "prod_add",    label: "تسجيل إنتاج (دمج خامات)", pending: true },
          { key: "prod_recipe", label: "كتابة الوصفات وتعديلها", pending: true },
          { key: "prod_label",  label: "طباعة ملصق الدفعة", pending: true },
          { key: "prod_delete", label: "حذف عملية إنتاج", sensitive: true, pending: true },
        ],
        fields: [
          { key: "prf_inputs", label: "المدخلات وتكلفتها", sensitive: true, pending: true },
          { key: "prf_actor",  label: "من سجّل العملية", pending: true },
        ],
      },
      {
        key: "damage",
        label: "التالف",
        actions: [
          { key: "dmg_view",   label: "عرض التالف", pending: true },
          { key: "dmg_add",    label: "تسجيل تالف من المستودع", pending: true },
          { key: "dmg_delete", label: "حذف قيد تالف", sensitive: true, pending: true },
        ],
        fields: [
          { key: "df_cost",  label: "قيمة الخسارة", sensitive: true, pending: true },
          { key: "df_actor", label: "من سجّل العملية", pending: true },
        ],
      },
      {
        key: "balance",
        label: "رصيد الأصناف",
        actions: [
          { key: "bal_view", label: "عرض رصيد الأصناف", pending: true },
          { key: "export",   label: "تصدير التكاليف إلى إكسل", sensitive: true },
        ],
        fields: [
          { key: "bf_value", label: "قيمة المخزون", sensitive: true, pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ الموارد ══════════════════ */
  {
    key: "warehouse",
    label: "الموارد",
    href: "/admin/warehouse",
    hint: "الطاولات والصحون وما يُعار للحفلات ويعود",
    groups: [
      {
        key: "items",
        label: "المواد",
        actions: [
          VIEW("عرض الموارد"),
          { key: "add",     label: "إضافة مادة" },
          { key: "edit",    label: "تعديل مادة وصورتها" },
          { key: "reorder", label: "إعادة الترتيب بالسحب", pending: true },
          { key: "delete",  label: "حذف مادة" },
        ],
        fields: [
          { key: "wf_price",     label: "سعر المادة", sensitive: true, pending: true },
          { key: "wf_available", label: "المتاح فعلياً بعد الحجز", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ طلبات الموارد ══════════════════ */
  {
    key: "warehouse_orders",
    label: "طلبات الموارد",
    href: "/warehouse-manager/orders",
    groups: [
      {
        key: "orders",
        label: "التسليم والاستلام",
        actions: [
          VIEW("عرض الطلبات"),
          { key: "confirm",        label: "تأكيد تسليم الحفلة" },
          { key: "confirm_return", label: "تأكيد استلام المرتجع" },
        ],
      },
    ],
  },

  /* ══════════════════ المفقودات ══════════════════ */
  {
    key: "missing_items",
    label: "المفقودات",
    href: "/admin/missing-items",
    groups: [
      {
        key: "missing",
        label: "المفقودات",
        actions: [
          VIEW("عرض المفقودات"),
          { key: "resolve", label: "معالجة المفقود وتحديثه" },
        ],
        fields: [
          { key: "mf_value", label: "قيمة الخسارة", sensitive: true, pending: true },
          { key: "mf_actor", label: "من أبلغ", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ المطبخ ══════════════════ */
  {
    key: "kitchen",
    label: "طلبات المطبخ",
    href: "/kitchen",
    groups: [
      {
        key: "orders",
        label: "الطلبات",
        actions: [
          VIEW("عرض طلبات المطبخ"),
          { key: "confirm", label: "تأكيد استلام الطلب" },
        ],
      },
    ],
  },

  /* ══════════════════ المشرفون ══════════════════ */
  {
    key: "supervisor",
    label: "المشرفون (تشغيل الحفلة)",
    href: "/supervisor/concerts",
    hint: "خطوات تنفيذ الحفلة ميدانياً",
    groups: [
      {
        key: "flow",
        label: "خطوات التنفيذ",
        actions: [
          VIEW("عرض حفلاته"),
          { key: "receive_materials", label: "استلام المواد من الموارد", pending: true },
          { key: "set_location",      label: "تحديد موقع الحفلة", pending: true },
          { key: "start_executing",   label: "بدء تنفيذ الحفلة", pending: true },
          { key: "return_materials",  label: "استلام المواد من الحفلة", pending: true },
          { key: "deliver_warehouse", label: "تسليم المواد للموارد", pending: true },
          { key: "assign_employees",  label: "إسناد الموظفين للحفلة", pending: true },
          { key: "report_missing",    label: "الإبلاغ عن مفقودات" },
        ],
      },
    ],
  },

  /* ══════════════════ الموظفون (عرض حفلاتهم) ══════════════════ */
  {
    key: "employees",
    label: "مهام الموظفين",
    href: "/employee/assignments",
    hint: "ما يراه الموظف من حفلاته",
    groups: [
      {
        key: "assignments",
        label: "المهام",
        actions: [
          VIEW("عرض المهام المسندة"),
          { key: "view_all", label: "عرض مهام كل الموظفين لا مهامه وحده", sensitive: true, pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ الموظفون (الإدارة) ══════════════════ */
  {
    key: "users",
    label: "الموظفون",
    href: "/admin/users",
    hint: "الحسابات والأدوار وصلاحياتها",
    groups: [
      {
        key: "staff",
        label: "الحسابات",
        actions: [
          VIEW("عرض الموظفين"),
          { key: "create",      label: "إضافة موظف" },
          { key: "edit",        label: "تعديل الاسم وكلمة المرور" },
          { key: "change_role", label: "تغيير دور الموظف", sensitive: true, pending: true },
          { key: "delete",      label: "حذف موظف", sensitive: true },
        ],
        fields: [
          { key: "sf_signin",  label: "آخر تسجيل دخول ومؤشر الخمول", pending: true },
          { key: "sf_creator", label: "من أنشأ الحساب", pending: true },
          { key: "sf_profile", label: "ملف الموظف: حفلاته وعهدته وسجل نشاطه", pending: true },
        ],
      },
      {
        key: "roles",
        label: "الأدوار والصلاحيات",
        hint: "من يملك هذا يملك كل شيء عملياً — يستطيع منح نفسه ما شاء",
        actions: [
          { key: "roles_view",   label: "عرض الأدوار وصلاحياتها" },
          { key: "roles_create", label: "إنشاء دور", sensitive: true },
          { key: "roles_edit",   label: "تعديل صلاحيات دور", sensitive: true },
          { key: "roles_delete", label: "حذف دور", sensitive: true },
        ],
      },
    ],
  },

  /* ══════════════════ ربحية الحفلات ══════════════════ */
  {
    key: "profitability",
    label: "ربحية الحفلات",
    href: "/admin/profitability",
    hint: "الربح الحقيقي لكل حفلة بعد كل التكاليف",
    groups: [
      {
        key: "profit",
        label: "الربحية",
        actions: [VIEW("عرض صفحة الربحية")],
        fields: [
          { key: "pf_revenue", label: "السعر والصافي قبل الضريبة", pending: true },
          { key: "pf_costs",   label: "تفصيل التكاليف", pending: true },
          { key: "pf_profit",  label: "الربح ونسبته", sensitive: true, pending: true },
          { key: "pf_internal", label: "قيمة المواد الداخلية (غير محتسبة)", pending: true },
        ],
      },
    ],
  },

  /* ══════════════════ الإعدادات ══════════════════ */
  {
    key: "settings",
    label: "الإعدادات ومركز التحكم",
    href: "/settings",
    groups: [
      {
        key: "system",
        label: "إعدادات النظام",
        actions: [
          { key: "vat",       label: "تعديل نسبة الضريبة", sensitive: true },
          { key: "control",   label: "فتح مركز التحكم", pending: true },
          { key: "features",  label: "إيقاف الميزات وتشغيلها", sensitive: true, pending: true },
          { key: "labels",    label: "تعديل مسمّيات الأقسام", pending: true },
          { key: "idle",      label: "تعديل حدّ الحساب الخامل", pending: true },
          { key: "health",    label: "عرض فحص سلامة البيانات", pending: true },
        ],
      },
    ],
  },
];

/* ── مشتقّات تُحسب مرة واحدة ─────────────────────────────────── */

/** كل مفاتيح صفحة ما، إجراءات وحقولاً */
export function pageKeys(page: PermissionPageDef): string[] {
  return page.groups.flatMap((g) => [
    ...g.actions.map((a) => a.key),
    ...(g.fields ?? []).map((f) => f.key),
  ]);
}

/** الصفحة ← كل مفاتيحها */
export const KEYS_BY_PAGE: Record<string, string[]> = Object.fromEntries(
  PERMISSION_CATALOG.map((p) => [p.key, pageKeys(p)])
);

/** الصلاحيات المربوطة فعلاً — الوسم pending يعني أنها في الخريطة ولم تُفعَّل بعد */
export const TOTAL_PERMISSIONS = PERMISSION_CATALOG.reduce(
  (s, p) =>
    s +
    p.groups.reduce(
      (g, grp) =>
        g +
        grp.actions.filter((a) => !a.pending).length +
        (grp.fields ?? []).filter((f) => !f.pending).length,
      0
    ),
  0
);

/** ما لم يُربط بعد — يُعرض معطَّلاً ولا يُحتسب */
export const PENDING_PERMISSIONS = PERMISSION_CATALOG.reduce(
  (s, p) =>
    s +
    p.groups.reduce(
      (g, grp) =>
        g +
        grp.actions.filter((a) => a.pending).length +
        (grp.fields ?? []).filter((f) => f.pending).length,
      0
    ),
  0
);

/** بحث عن تعريف صلاحية بمفتاحها داخل صفحة */
export function findPerm(pageKey: string, key: string): PermItem | null {
  const page = PERMISSION_CATALOG.find((p) => p.key === pageKey);
  if (!page) return null;
  for (const g of page.groups) {
    const hit = [...g.actions, ...(g.fields ?? [])].find((i) => i.key === key);
    if (hit) return hit;
  }
  return null;
}
