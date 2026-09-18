import { normalizeStatus } from "@/lib/concert-status";

type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};

/** الحد الأدنى من بيانات الحفلة اللازم لحساب تأخر السداد. */
export type PayableConcert = {
  date: unknown;
  price?: number | null;
  deposit?: number | null;
  status: string;
};

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function concertDateKey(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);

  const timestamp = value as TimestampLike;
  if (typeof timestamp.toDate === "function") return localDateKey(timestamp.toDate());
  if (typeof timestamp.seconds === "number") return localDateKey(new Date(timestamp.seconds * 1000));
  return "";
}

export function remainingAmount(concert: PayableConcert): number {
  return Math.max(0, (concert.price ?? 0) - (concert.deposit ?? 0));
}

/**
 * متأخر السداد = حفلة غير ملغاة، لم يُسدَّد كامل مبلغها، وتاريخها قبل اليوم
 * المحلي. تاريخ اليوم نفسه لا يعد متأخراً حتى ينتهي.
 */
export function isOverdueConcert(concert: PayableConcert, today = localDateKey(new Date())): boolean {
  const date = concertDateKey(concert.date);
  return normalizeStatus(concert.status) !== "cancelled" &&
    remainingAmount(concert) > 0 &&
    Boolean(date) &&
    date < today;
}
