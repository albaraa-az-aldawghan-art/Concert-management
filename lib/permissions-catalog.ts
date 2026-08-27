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

/* لا مفتاح «عرض» مستقل: تفعيل الصفحة في قائمة الدور هو إذن العرض.
   إفراد مفتاح له كان تكراراً — خانتان لمعنى واحد. */

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
          { key: "overdue",         label: "المتأخرات من المدفوعات" },
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
        actions: [],
        fields: [
          { key: "f_total",     label: "إجمالي قيمة الحفلات" },
          { key: "f_collected", label: "المحصَّل" },
          { key: "f_remaining", label: "المتبقي" },
          { key: "f_vat",       label: "الضريبة والصافي قبلها" },
        ],
      },
      {
        key: "table",
        label: "الجدول التفصيلي",
        actions: [{ key: "table_view", label: "عرض جدول الحفلات المالي" }],
        fields: [
          { key: "f_client",  label: "اسم العميل" },
          { key: "f_price",   label: "سعر الحفلة" },
          { key: "f_paid",    label: "المدفوع والمتبقي" },
          { key: "f_costs",   label: "التكاليف (القاعة والنقل والعمالة)" },
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
          { key: "send_warehouse", label: "الإرسال للموارد" },
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
        key: "workflow",
        label: "سير عمل الحفلة",
        hint: "الخطوات الست: استلام المواد · الموقع · بدء التنفيذ · استلام المواد من الحفلة · تسليمها للموارد · تأكيد الموارد",
        actions: [
          { key: "wf_run",  label: "تنفيذ أي خطوة من خطوات الحفلة", hint: "بلا انتظار المشرف — وما قبل الخطوة يُستكمل معها" },
          { key: "wf_undo", label: "التراجع عن خطوة مُنجَزة", hint: "يُسقط ما بعدها، ويعيد حجز المواد إن كان الموارد قد استلمها", sensitive: true },
        ],
        fields: [
          { key: "wf_actor", label: "من نفّذ كل خطوة ومتى" },
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
          { key: "create", label: "إنشاء بكج" },
          { key: "edit",   label: "تعديل بكج ومحتوياته" },
          { key: "delete", label: "حذف بكج" },
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
          { key: "create", label: "إنشاء عقد" },
          { key: "edit",   label: "تعديل العقد ومدته" },
          { key: "terms",  label: "تعديل بنود العقد وأسعارها" },
          { key: "cancel", label: "إلغاء العقد" },
          { key: "complete", label: "إنهاء العقد" },
          { key: "delete", label: "حذف العقد", sensitive: true },
          /* دفعات العقود: لها مسارا خادم محروسان، وشاشتها لم تُبنَ بعد
             فيُكتفى بالإجراءين اللذين يُفرضان فعلاً */
          { key: "pay_add",    label: "تسجيل دفعة على العقد" },
          { key: "pay_delete", label: "حذف دفعة عقد", sensitive: true },
        ],
        fields: [
          { key: "cf_value",  label: "قيمة العقد" },
          { key: "cf_client", label: "بيانات العميل وجوّاله" },
          { key: "cf_actor",  label: "من أنشأ العقد" },
        ],
      },
      {
        key: "ledger",
        label: "الجدول اليومي",
        hint: "دفتر تشغيل المقصف: المورَّد والتالف والمتبقي لكل صنف كل يوم، والتحصيل ومطابقته",
        actions: [
          { key: "ledger_view",   label: "عرض الجدول اليومي وشهوره" },
          { key: "ledger_edit",   label: "تسجيل يوم وتعديله", hint: "المورَّد يخرج من المخزون فعلاً" },
          { key: "ledger_delete", label: "حذف يوم", hint: "يُرجع كل ما صُرف فيه", sensitive: true },
          { key: "ledger_config", label: "إعداد بنود المصروف والعهدة والأقسام" },
          { key: "ledger_post",   label: "ترحيل تحصيل الشهر دفعةً على العقد", sensitive: true },
          { key: "ledger_export", label: "تصدير الشهر إلى إكسل", sensitive: true },
        ],
        fields: [
          { key: "lf_cost",        label: "التكلفة والربح" },
          { key: "lf_collections", label: "التحصيل والمطابقة اليومية" },
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
        ],
        fields: [
          { key: "rf_by_dept", label: "التوزيع على الأقسام" },
          { key: "rf_by_item", label: "تفصيل الأصناف" },
          { key: "rf_ops",     label: "قائمة العمليات ومن نفّذها" },
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
          { key: "add",     label: "إضافة قسم" },
          { key: "rename",  label: "تعديل اسم القسم" },
          { key: "delete",  label: "حذف قسم" },
          { key: "reorder", label: "إعادة الترتيب بالسحب" },
          { key: "assign",  label: "ضمّ الأصناف للأقسام وإخراجها" },
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
          { key: "item_add",     label: "تسجيل صنف جديد" },
          { key: "item_edit",    label: "تعديل صنف" },
          { key: "item_delete",  label: "حذف صنف" },
          { key: "item_import",  label: "استيراد عدة أصناف دفعة واحدة" },
          { key: "item_barcode", label: "توليد الباركود وطباعة الملصق" },
          { key: "item_config",  label: "تعديل الوحدات والأقسام", hint: "يمسّ كل الأصناف" },
        ],
        fields: [
          { key: "if_avg_cost", label: "متوسط تكلفة الوحدة", sensitive: true },
          { key: "if_dates",    label: "تاريخ الإنتاج والانتهاء" },
        ],
      },
      {
        key: "incoming",
        label: "الوارد",
        actions: [
          { key: "in_view",   label: "عرض الوارد" },
          { key: "in_add",    label: "تسجيل وارد من مورّد" },
          { key: "in_delete", label: "حذف عملية وارد", sensitive: true, hint: "يعيد حساب الرصيد والمتوسط" },
        ],
        fields: [
          { key: "inf_supplier", label: "اسم المورّد" },
          { key: "inf_price",    label: "السعر والإجمالي", sensitive: true },
          { key: "inf_date",     label: "تاريخ الفاتورة" },
          { key: "inf_actor",    label: "من سجّل العملية" },
        ],
      },
      {
        key: "outgoing",
        label: "المنصرف",
        actions: [
          { key: "out_view",   label: "عرض المنصرف" },
          { key: "out_add",    label: "تسجيل منصرف" },
          { key: "out_settle", label: "إرجاع للمخزون أو تسجيل تالف" },
          { key: "out_reassign", label: "إعادة إسناد عملية إلى وجهة أخرى", hint: "ينقل التكلفة من حفلة أو عقد إلى غيره", sensitive: true },
          { key: "req_view",    label: "عرض طلبات صرف الحفلات" },
          { key: "req_approve", label: "إقرار طلب صرف حفلة", hint: "الإقرار يصرف الأصناف فعلاً ويحمّلها على الحفلة", sensitive: true },
          { key: "out_delete", label: "حذف عملية منصرف", sensitive: true },
        ],
        fields: [
          { key: "of_cost",   label: "تكلفة المنصرف", sensitive: true },
          { key: "of_dest",   label: "الجهة (حفلة، عقد، قسم)" },
          { key: "of_date",   label: "تاريخ الصرف" },
          { key: "of_actor",  label: "من سجّل العملية" },
        ],
      },
      {
        key: "production",
        label: "الإنتاج",
        actions: [
          { key: "prod_view",   label: "عرض الإنتاج" },
          { key: "prod_add",    label: "تسجيل إنتاج (دمج خامات)" },
          { key: "prod_edit",   label: "تعديل عملية إنتاج مسجّلة", hint: "يعيد حساب المخزون والتكلفة", sensitive: true },
          { key: "prod_recipe", label: "كتابة الوصفات وتعديلها" },
          { key: "prod_label",  label: "طباعة ملصق الدفعة" },
          { key: "prod_delete", label: "حذف عملية إنتاج", sensitive: true },
        ],
        fields: [
          { key: "prf_inputs", label: "المدخلات وتكلفتها", sensitive: true },
          { key: "prf_actor",  label: "من سجّل العملية" },
        ],
      },
      {
        key: "damage",
        label: "التالف",
        actions: [
          { key: "dmg_view",   label: "عرض التالف" },
          { key: "dmg_add",    label: "تسجيل تالف من المستودع" },
          { key: "dmg_delete", label: "حذف قيد تالف", sensitive: true },
        ],
        fields: [
          { key: "df_cost",  label: "قيمة الخسارة", sensitive: true },
          { key: "df_actor", label: "من سجّل العملية" },
        ],
      },
      {
        key: "balance",
        label: "رصيد الأصناف",
        actions: [
          { key: "bal_view", label: "عرض رصيد الأصناف" },
          { key: "export",   label: "تصدير التكاليف إلى إكسل", sensitive: true },
        ],
        fields: [
          { key: "bf_value", label: "قيمة المخزون", sensitive: true },
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
          { key: "add",     label: "إضافة مادة" },
          { key: "edit",    label: "تعديل مادة وصورتها" },
          { key: "reorder", label: "إعادة الترتيب بالسحب" },
          { key: "delete",  label: "حذف مادة" },
          { key: "export",  label: "تصدير الموارد إلى إكسل", sensitive: true },
        ],
        fields: [
          { key: "wf_price",     label: "سعر المادة", sensitive: true },
          { key: "wf_available", label: "المتاح فعلياً بعد الحجز" },
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
          { key: "resolve", label: "معالجة المفقود وتحديثه" },
        ],
        fields: [
          { key: "mf_value", label: "قيمة الخسارة", sensitive: true },
          { key: "mf_actor", label: "من أبلغ" },
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
        key: "scope",
        label: "نطاق ما يراه",
        hint: "المشرف يرى حفلاته وحدها ما لم يُمنح الإشراف على الكل",
        actions: [
          { key: "view_all", label: "عرض كل الحفلات لا المسندة إليه وحده", sensitive: true },
        ],
      },
      {
        key: "flow",
        label: "خطوات التنفيذ",
        actions: [
          { key: "receive_materials", label: "استلام المواد من الموارد" },
          { key: "set_location",      label: "تحديد موقع الحفلة" },
          { key: "start_executing",   label: "بدء تنفيذ الحفلة" },
          { key: "return_materials",  label: "استلام المواد من الحفلة" },
          { key: "deliver_warehouse", label: "تسليم المواد للموارد" },
          { key: "assign_employees",  label: "إسناد الموظفين للحفلة" },
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
          { key: "view_all", label: "عرض مهام كل الموظفين لا مهامه وحده", sensitive: true },
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
          { key: "create",      label: "إضافة موظف" },
          { key: "edit",        label: "تعديل الاسم وكلمة المرور" },
          { key: "change_role", label: "تغيير دور الموظف", sensitive: true },
          { key: "delete",      label: "حذف موظف", sensitive: true },
        ],
        fields: [
          { key: "sf_signin",  label: "آخر تسجيل دخول ومؤشر الخمول" },
          { key: "sf_creator", label: "من أنشأ الحساب" },
          { key: "sf_profile", label: "ملف الموظف: حفلاته وعهدته وسجل نشاطه" },
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
        actions: [],
        fields: [
          { key: "pf_revenue", label: "السعر والصافي قبل الضريبة" },
          { key: "pf_costs",   label: "تفصيل التكاليف" },
          { key: "pf_profit",  label: "الربح ونسبته", sensitive: true },
          { key: "pf_internal", label: "قيمة المواد الداخلية (غير محتسبة)" },
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
          { key: "control",   label: "فتح مركز التحكم" },
          { key: "features",  label: "إيقاف الميزات وتشغيلها", sensitive: true },
          { key: "labels",    label: "تعديل مسمّيات الأقسام" },
          { key: "idle",      label: "تعديل حدّ الحساب الخامل" },
          { key: "health",    label: "عرض فحص سلامة البيانات" },
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
