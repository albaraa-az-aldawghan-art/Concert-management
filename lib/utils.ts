import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "مدير",
    warehouse_manager: "مدير المخازن",
    supervisor: "مشرف",
    employee: "موظف",
  };
  return labels[role] ?? role;
}

export function getTypeLabel(type: string): string {
  return type === "internal" ? "داخلي" : "خارجي";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: "مخطط",
    active: "جارٍ",
    completed: "منتهي",
    pending: "قيد الانتظار",
    approved: "موافق عليه",
    rejected: "مرفوض",
    confirmed: "مؤكد",
    has_missing: "به مفقودات",
  };
  return labels[status] ?? status;
}
