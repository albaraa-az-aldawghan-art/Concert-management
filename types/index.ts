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
  | "costs";

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
  transportCost: number | null;
  laborCount: number | null;
  laborPricePerUnit: number | null;
  laborCost: number | null;
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

export interface FoodCategory {
  id: string;
  name: string;
  options: string[];
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
  totalInValue?: number; // مجموع (الكمية × السعر) لكل عمليات الوارد — لحساب متوسط سعر التكلفة
  order?: number;
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
