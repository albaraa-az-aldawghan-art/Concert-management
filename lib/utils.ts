import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "—";
  const d = timestamp.toDate();
  const weekday = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long" }).format(d);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${weekday}، ${dd}/${mm}/${d.getFullYear()}`;
}

export function formatDateTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "—";
  const d = timestamp.toDate();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const time = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${dd}/${mm}/${d.getFullYear()} ${time}`;
}

// Extracts the start time from a concert Timestamp → "06:30 م"
export function formatTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "";
  const d = timestamp.toDate();
  const h = d.getHours();
  const suffix = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "مدير",
    warehouse_manager: "مدير المخازن",
    supervisor: "مشرف",
    employee: "موظف",
    kitchen: "مطبخ",
    custom: "دور مخصص",
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
