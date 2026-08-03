import { Timestamp } from "firebase/firestore";

export type UserRole = "admin" | "warehouse_manager" | "supervisor" | "employee" | "kitchen" | "custom";

export type PermissionLevel = "view" | "manage";

export type PermissionPage =
  | "dashboard"
  | "finances"
  | "concerts"
  | "users"
  | "warehouse"
  | "warehouse_orders"
  | "food"
  | "missing_items"
  | "kitchen"
  | "supervisor"
  | "employees"
  | "settings"
  | "costs"
  | "profitability";

export interface CustomRole {
  id: string;
  name: string;
  // New format: array of enabled feature keys per page (empty = view only).
  // Legacy format ("view" | "manage") still readable — normalized in lib/permissions.
  permissions: Partial<Record<PermissionPage, string[] | PermissionLevel>>;
  createdAt: Timestamp;
  createdBy: string;
}

export interface KitchenOrder {
  id: string;
  concertId: string;
  concertNumber: number;
  clientName: string;
  concertDate: Timestamp | null;
  venueName: string | null;
  peopleCount?: string | null; // لقطة من الحفلة وقت الإرسال (الطلبات القديمة بدونها)
  status: "sent" | "received";
  sentAt: Timestamp;
  sentBy: string;
  receivedAt: Timestamp | null;
  receivedBy: string | null;
}

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  customRoleId?: string | null;
  createdAt: Timestamp;
  createdBy: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  totalCount: number;
  availableCount: number;
  type: "internal" | "external";
  pricePerUnit?: number | null;
  imageUrl?: string | null;
  order?: number;
  createdAt: Timestamp;
}

export interface ConcertLocation {
  lat: number;
  lng: number;
  address: string;
}

// أربع حالات فقط. الحالات الوسيطة السبع القديمة أصبحت علامات إنجاز
// على الحفلة (deliveryApproved, executingStarted…) وتُترجم عند القراءة
// عبر normalizeStatus في lib/concert-status.ts
export type ConcertStatus =
  | "planned"
  | "confirmed"
  | "completed"
  | "cancelled";

export interface Concert {
  id: string;
  concertNumber: number | null;
  name: string;
  date: Timestamp; // يتضمن وقت بدء الحفلة (datetime-local عند الإنشاء)
  venueName: string | null;
  peopleCount: string | null; // عدد الأشخاص — نص حر يقبل كتابة وأرقاماً (اختياري)
  location: ConcertLocation | null;
  price: number;
  clientName: string | null;
  clientPhone: string | null;
  clientPhone2: string | null;
  supervisorIds: string[];
  employeeIds: string[];
  status: ConcertStatus;
  deliveryApproved: boolean;
  deliveryApprovedBy: string | null;
  deliveryApprovedAt: Timestamp | null;
  returnApproved: boolean;
  returnApprovedBy: string | null;
  returnApprovedAt: Timestamp | null;
  // بدء التنفيذ — كان محفوظاً في الحالة وحدها قبل اختصار المراحل
  executingStarted?: boolean;
  executingStartedAt?: Timestamp | null;
  executingStartedBy?: string | null;
  supervisorDeliveredToWarehouse: boolean;
  supervisorDeliveredToWarehouseAt: Timestamp | null;
  warehouseReturnConfirmed: boolean;
  warehouseReturnConfirmedBy: string | null;
  warehouseReturnConfirmedAt: Timestamp | null;
  deposit: number | null;
  isPaid: boolean;
  paidAt: Timestamp | null;
  paidBy: string | null;
  notes: string | null;
  hallCostType: "percentage" | "fixed" | null;
  hallCostValue: number | null;
  hallCostDate: string | null;
  hallCostRecipient: string | null;
  /* الثلاثة مشتقّة من concert_expenses — تُعاد كتابتها بعد كل فاتورة،
     تماماً كما يُشتق deposit من الدفعات. لا تُكتب يدوياً في أي مكان. */
  transportCost: number | null;
  laborCost: number | null;
  otherExpensesCost?: number | null;
  /** @deprecated بقايا نموذج العمالة القديم — تفصيلته صارت في وصف الفاتورة */
  laborCount: number | null;
  /** @deprecated */
  laborPricePerUnit: number | null;
  vatRate: number | null;
  externalItemsCost?: number | null;
  /** قيمة المواد الداخلية (المملوكة) المستخدمة — للعرض وتقييم الأصول الموظّفة
   *  فقط، ولا تُخصم من الربح لأنها ترجع بعد الحفلة وتُستعمل مرات كثيرة */
  internalItemsValue?: number | null;
  cancelledAt?: Timestamp | null;
  cancellationReason?: string | null;
  refundAmount?: number | null;
  refundDate?: string | null;
  refundMethod?: PaymentMethod | null;
  createdAt: Timestamp;
  createdBy: string;
}

export type DeliveryStatus = "pending" | "confirmed";
export type ReturnStatus = "pending" | "confirmed" | "has_missing";

export interface ConcertItem {
  id: string;
  concertId: string;
  itemId: string;
  itemName: string;
  type: "internal" | "external";
  count: number;
  unitCost?: number | null;
  totalCost?: number | null;
  assignedToEmployeeId: string | null;
  assignedToEmployeeName: string | null;
  deliveryStatus: DeliveryStatus;
  returnStatus: ReturnStatus;
  /** هل هذه المادة تحجز حالياً من رصيد الموارد؟ تُكتب من الكود الجديد فقط،
   *  فالمواد المسجّلة قبل تفعيل الحجز (undefined) لا تُعاد أبداً. */
  stockHeld?: boolean;
  createdAt: Timestamp;
}

/** سطر وصفة: كم يستهلك هذا الصنف من خام معيّن.
 *  الكمية تُكتب «qty لكل perQty وحدة» فيمكن كتابة «5 كجم لكل 10 أطباق»
 *  بدل حساب 0.5 يدوياً. */
export interface RecipeLine {
  /** باركود صنف التكاليف — هو معرّف المستند */
  barcode: string;
  itemName: string;   // مُنسَّخ للعرض إن حُذف الصنف
  unit: string;       // مُنسَّخ للعرض
  qty: number;
  perQty: number;     // الافتراضي 1
}

/** تعريف صنف أكل بمعرّف ثابت — يسمح بتعديل الاسم دون ضياع الوصفة.
 *  المعرّف "" محجوز للأقسام التي بلا أصناف (وصفة القسم نفسه). */
export interface FoodOptionDef {
  id: string;
  name: string;
  recipe?: RecipeLine[];
  /** باركود صنف التكاليف الذي *هو* صنف الأكل نفسه — الخلطة الجاهزة التي
   *  أنتجتها التكاليف. وجوده يعني أن هذا الصنف مصدره التكاليف لا اسماً
   *  مكتوباً، فتُقرأ تكلفته ورصيده منه مباشرة. */
  costItemBarcode?: string | null;
}

export interface FoodCategory {
  id: string;
  name: string;
  /** تبقى كما هي — يقرؤها العقد والمطبخ والموظفون */
  options: string[];
  /** المصدر الجديد: أسماء بمعرّفات ثابتة ووصفات. تُشتق من options إن غابت */
  optionDefs?: FoodOptionDef[];
  order: number;
  createdAt: Timestamp;
  createdBy: string;
}

export interface ConcertFood {
  id: string;
  concertId: string;
  categoryId: string;
  categoryName: string;
  selectedOption: string;
  quantity: number | null;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
}

export type PaymentMethod = "card" | "cash" | "bank_transfer";

export interface ConcertPayment {
  id: string;
  concertId: string;
  method: PaymentMethod;
  amount: number;
  date: string;
  cardType: "visa" | "mada" | null;
  receiverName: string | null;
  bankName: string | null;
  senderName: string | null;
  /** حالة الفاتورة — اختيارية. null = لم تُحدَّد بعد، وهي ليست
   *  «بدون فاتورة». الشبكة تُملأ تلقائياً بفاتورة مسجّلة. */
  hasInvoice?: boolean | null;
  /** مشتقّ من رقم الفاتورة: رقمٌ مكتوب = مسجّلة، وفراغ = لم تُسجَّل بعد */
  invoiceRegistered?: boolean | null;
  invoiceNumber?: string | null;
  createdAt: Timestamp;
  createdBy: string;
}

export interface ConcertLog {
  id: string;
  concertId: string;
  description: string;
  createdAt: Timestamp;
  createdBy: string;
  field?: string;     // which field changed, e.g. "date" | "venueName"
  oldValue?: string;  // previous value (ISO date string for dates, plain text for others)
  newValue?: string;  // new value
}

/* ── فواتير مصروفات الحفلة ─────────────────────────────────────
   كل مصروف تشغيلي (سيارات، عمالة، أخرى) فاتورة مستقلة موجّهة لحفلة.
   مجاميعها تُكتب على الحفلة في transportCost/laborCost/otherExpensesCost. */

/** المفاتيح الثابتة التي تُشتق منها حقول الحفلة — بقية الأنواع تدخل في «أخرى» */
export type ExpenseKind = "transport" | "labor" | "other";

export interface ExpenseType {
  name: string;
  /** أي حقل مشتق يتغذى من هذا النوع */
  kind: ExpenseKind;
}

export interface ExpenseSettings {
  types: ExpenseType[];
}

export interface ConcertExpense {
  id: string;
  concertId: string;
  concertNumber: number | null;
  clientName: string | null;
  /** اسم النوع كما اختير وقت الإدخال */
  type: string;
  kind: ExpenseKind;
  description: string | null;
  supplierName: string | null;
  amount: number;
  /** هل المبلغ المُدخل شامل الضريبة؟ يُطبَّع عند حساب الربح */
  vatIncluded: boolean;
  invoiceDate: string; // yyyy-mm-dd
  createdAt: Timestamp;
  createdBy: string;
}

export interface MissingItem {
  id: string;
  concertId: string;
  concertName: string;
  itemId: string;
  itemName: string;
  missingCount: number;
  type: "internal" | "external";
  reportedBy: string;
  reportedByName: string;
  reportedAt: Timestamp;
}

/* ── التكاليف (خامات الإنتاج بالباركود) ──────────────────────── */

export interface CostItem {
  id: string; // = الباركود نفسه (معرّف المستند)
  name: string;
  barcodeSource: "supplier" | "generated";
  unit: string; // ثابتة لهذا الصنف — تُختار عند التسجيل ولا تتغيّر تلقائياً
  totalIn: number;
  totalOut: number;
  /** قيمة ما في اليد من هذا الصنف. ترتفع بالوارد والإنتاج وتنخفض
   *  بالصرف والتالف، فمتوسط السعر = القيمة ÷ الرصيد = متوسط متحرك
   *  صادق، لا متوسط عمر الصنف كله. */
  totalInValue?: number;
  /** الخلطة القياسية لإنتاج هذا الصنف من مواد خام أخرى — تُعبّئ نموذج الإنتاج
   *  تلقائياً. وجودها يعني أن هذا صنف «مُنتَج» لا مُشترى مباشرةً. */
  productionRecipe?: RecipeLine[];
  /** تاريخ الإنتاج وتاريخ الانتهاء — اختياريان (مواد كثيرة بلا صلاحية).
   *  يُطبعان على ملصق الباركود. yyyy-mm-dd */
  productionDate?: string | null;
  expiryDate?: string | null;
  order?: number;
  createdAt: Timestamp;
  createdBy: string;
}

/** عملية إنتاج: تستهلك مواد خام وتُنتج كمية من صنف جاهز.
 *  تكلفة المُنتَج = مجموع تكاليف مدخلاته، فيصير متوسط سعره صادقاً تلقائياً. */
export interface CostProduction {
  id: string;
  outputBarcode: string;
  outputName: string;
  outputUnit: string;
  outputQty: number;
  inputs: {
    barcode: string;
    itemName: string;
    unit: string;
    qty: number;
    unitCost: number;   // متوسط سعر المدخل وقت الإنتاج
    totalCost: number;
  }[];
  /** مجموع تكلفة المدخلات = القيمة المضافة لمخزون المُنتَج */
  totalCost: number;
  /** تكلفة الوحدة الواحدة من المُنتَج */
  unitCost: number;
  productionDate: string; // yyyy-mm-dd
  /** انتهاء صلاحية هذه الدفعة تحديداً — يُطبع على ملصقها */
  expiryDate?: string | null;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
}

/** تالف: خامة أو خلطة فُقدت فعلاً — لا تعود للمخزون ولا تُحمَّل على حفلة.
 *  مصدرها إمّا تلف في المستودع، أو جزء صُرف لحفلة ثم تلف (فألغيت مثلاً). */
export interface CostDamage {
  id: string;
  itemBarcode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: string;
  source: "store" | "outgoing";
  /** عملية الصرف التي تلف جزؤها — للتتبع ومنع الحذف المزدوج */
  outgoingId?: string | null;
  concertId?: string | null;
  concertName?: string | null;
  clientName?: string | null;
  damageDate: string; // yyyy-mm-dd
  createdAt: Timestamp;
  createdBy: string;
}

export interface CostIncoming {
  id: string;
  itemBarcode: string;
  itemName: string;
  supplierName: string;
  unit: string; // نسخة من وحدة الصنف وقت التسجيل — للعرض والتدقيق فقط
  quantity: number;
  priceBeforeVat: number;
  totalBeforeVat: number;
  invoiceDate: string; // yyyy-mm-dd
  createdAt: Timestamp;
  createdBy: string;
}

export interface CostOutgoing {
  id: string;
  itemBarcode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  departmentName: string;
  concertId: string | null;
  concertName: string | null;
  /** لقطة من اسم العميل وقت الصرف — اسم الحفلة قابل للتعديل لاحقاً فينحرف */
  clientName?: string | null;
  manualConcertName: string | null;
  dispenseDate: string; // yyyy-mm-dd — تاريخ الصرف الفعلي
  /** قيمة المخزون التي خرجت بمتوسط اللحظة — تُعكس بها العملية عند
   *  الحذف أو الإرجاع، فلا تُقدَّر بمتوسط لاحق مختلف */
  stockValue?: number;
  /** ما رجع للمخزون صالحاً، وما تلف ولم يرجع. الاثنان يُخصمان من
   *  totalCost فلا تُحمَّل الحفلة إلا ما استُهلك فعلاً. */
  returnedQty?: number;
  damagedQty?: number;
  createdAt: Timestamp;
  createdBy: string;
}

export interface CostDepartment {
  name: string;
  concertLinked: boolean;
}

export interface CostSettings {
  units: string[];
  departments: CostDepartment[];
}
