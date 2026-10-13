import { periodBounds, type DateMode } from "./date-period";

export interface SalesExportScope {
  concertIds: string[];
  dateField: "date" | "createdAt";
  from: string;
  to: string;
  financialOnly: boolean;
}

export function salesExportScope(
  concerts: { id: string }[], mode: DateMode, from: string, to: string,
  dateField: SalesExportScope["dateField"], financialOnly = false,
): SalesExportScope {
  const bounds = mode === "custom" ? [from, to] : periodBounds(mode);
  return { concertIds: concerts.map(c => c.id), dateField, from: bounds[0], to: bounds[1], financialOnly };
}

export function salesScopeLabel(scope: SalesExportScope): string {
  const basis = scope.dateField === "createdAt" ? "تاريخ الإنشاء" : "تاريخ الحفلة";
  const period = scope.from || scope.to ? `${scope.from || "البداية"} إلى ${scope.to || "النهاية"}` : "كل الفترات";
  return `${basis}: ${period}`;
}
