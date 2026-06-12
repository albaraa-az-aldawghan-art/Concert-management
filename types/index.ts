import { Timestamp } from "firebase/firestore";

export type UserRole = "admin" | "warehouse_manager" | "supervisor" | "employee";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Timestamp;
  createdBy: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  totalCount: number;
  availableCount: number;
  type: "internal" | "external";
  createdAt: Timestamp;
}

export interface ConcertLocation {
  lat: number;
  lng: number;
  address: string;
}

export type ConcertStatus = "planned" | "active" | "completed";

export interface Concert {
  id: string;
  name: string;
  date: Timestamp;
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
  supervisorDeliveredToWarehouse: boolean;
  supervisorDeliveredToWarehouseAt: Timestamp | null;
  warehouseReturnConfirmed: boolean;
  warehouseReturnConfirmedBy: string | null;
  warehouseReturnConfirmedAt: Timestamp | null;
  deposit: number | null;
  isPaid: boolean;
  paidAt: Timestamp | null;
  paidBy: string | null;
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
  assignedToEmployeeId: string | null;
  assignedToEmployeeName: string | null;
  deliveryStatus: DeliveryStatus;
  returnStatus: ReturnStatus;
  createdAt: Timestamp;
}

export type RequestStatus = "pending" | "approved" | "rejected";

export interface WarehouseRequest {
  id: string;
  concertId: string;
  concertName: string;
  supervisorId: string;
  supervisorName: string;
  itemId: string;
  itemName: string;
  type: "internal" | "external";
  requestedCount: number;
  status: RequestStatus;
  approvedBy: string | null;
  approvedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface FoodCategory {
  id: string;
  name: string;
  options: string[];
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
