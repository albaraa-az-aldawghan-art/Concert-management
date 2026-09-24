import type { Contract, ContractType, CostItem } from "@/types";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  collected: "محصّل",
  paid: "مدفوع",
};

export function contractPriceLabel(type?: ContractType | null) {
  return type === "collected" ? "سعر التكلفة" : "سعر البيع";
}

/** A saved contract price is a snapshot; only new terms use current product prices. */
export function productContractPrice(
  item: Pick<CostItem, "totalIn" | "totalOut" | "totalInValue" | "salesSections" | "sectionPrices">,
  type: ContractType,
  sectionId?: string | null,
): number {
  let price: number | undefined;
  if (type === "collected") {
    const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
    if (balance <= 0 || item.totalInValue == null) throw new Error("لا تتوفر تكلفة مخزون للصنف");
    price = item.totalInValue / balance;
  } else {
    if (!sectionId || !item.salesSections?.includes(sectionId)) throw new Error("الصنف غير مرتبط بقسم السعر المختار");
    price = item.sectionPrices?.[sectionId];
  }
  if (price == null || !Number.isFinite(price) || price < 0) throw new Error("لا يوجد سعر صالح للصنف في المصدر المختار");
  return Math.round(price * 100) / 100;
}

export function contractPricingDescription(contract: Pick<Contract, "contractType" | "priceSectionName">) {
  if (!contract.contractType) return "عقد سابق — أسعار محفوظة";
  return `${CONTRACT_TYPE_LABELS[contract.contractType]} · ${contractPriceLabel(contract.contractType)}${contract.priceSectionName ? ` · ${contract.priceSectionName}` : ""}`;
}
