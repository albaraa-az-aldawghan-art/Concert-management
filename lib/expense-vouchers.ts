export const VOUCHER_DEPARTMENTS = { general: "عام", concerts: "الحفلات", restaurant: "المطعم", contracts: "التعاقدات" };
export const VOUCHER_METHODS = { cash: "نقدي", bank_transfer: "تحويل بنكي", mada: "مدى", visa: "بطاقة", employee: "عهدة موظف" };
export const VOUCHER_STATES = { draft: "مسودة", posted: "معتمد", void: "ملغى بقيد عكسي" };
export type VoucherDepartment = keyof typeof VOUCHER_DEPARTMENTS;
export interface VoucherAllocation { id: string; name: string; number: string; gross: number; net: number; tax: number; settlement?: "consumed" | "redistributed" | "refunded" }
export interface ExpenseVoucher {
  id: string; number: string | null; state: keyof typeof VOUCHER_STATES; revision: number;
  date: string; department: VoucherDepartment; recipient: string; type: string; kind: "transport" | "labor" | "other";
  method: keyof typeof VOUCHER_METHODS; description: string; source: "direct" | "inventory"; invoiceId: string;
  amount: number; vatMode: "none" | "inclusive" | "exclusive"; vatRate: number;
  gross: number; net: number; tax: number; refunded: number;
  allocations: VoucherAllocation[]; targetKeys: string[]; createdBy: string; createdAt: string; updatedAt: string; approvedBy?: string;
  events: { at: string; by: string; action: string; reason: string; target?: string; amount?: number }[];
}
/** Exact positive half-up rounding; even large amounts and fractional VAT rates
 * never pass through an imprecise floating-point multiplication. */
export function voucherRatio(a:number,b:number,divisor:number):number {
  if(![a,b,divisor].every(Number.isSafeInteger)||a<0||b<0||divisor<=0)throw new Error("نسبة مالية غير صحيحة");
  return Number((BigInt(a)*BigInt(b)*BigInt(2)+BigInt(divisor))/(BigInt(divisor)*BigInt(2)));
}
export function splitVoucher(gross: number, tax: number, targets: { id: string; name: string; number: string }[]): VoucherAllocation[] {
  if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(tax) || tax < 0 || gross < tax || !targets.length || targets.length > 40 || new Set(targets.map(t => t.id)).size !== targets.length) throw new Error("توزيع غير صحيح");
  return [...targets].sort((a,b) => a.id.localeCompare(b.id)).map((t,i) => {
    const share = Math.floor(gross / targets.length) + (i < gross % targets.length ? 1 : 0);
    const vat = Math.floor(tax / targets.length) + (i < tax % targets.length ? 1 : 0);
    return { ...t, gross: share, tax: vat, net: share - vat };
  });
}
export function voucherTotals(amount: number, mode: ExpenseVoucher["vatMode"], rate: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000 || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("المبلغ أو الضريبة غير صحيح");
  const basisPoints=Math.round(rate*100);
  if(Math.abs(basisPoints-rate*100)>0.0001)throw new Error("نسبة الضريبة تحتوي أكثر من منزلتين عشريتين");
  const gross = mode === "exclusive" ? amount + voucherRatio(amount,basisPoints,10000) : amount;
  const net = mode === "inclusive" ? voucherRatio(gross,10000,10000+basisPoints) : amount;
  return { gross, net: mode === "none" ? gross : net, tax: mode === "none" ? 0 : gross - net };
}
const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
function under1000(n: number): string {
  if (n < 20) return units[n];
  if (n < 100) return (n % 10 ? units[n % 10] + " و" : "") + ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"][Math.floor(n / 10)];
  return ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"][Math.floor(n / 100)] + (n % 100 ? " و" + under1000(n % 100) : "");
}
function words(n: number): string {
  if (!n) return "صفر";
  const parts: string[] = [];
  for (const [base,one,two,many] of [[1_000_000_000,"مليار","ملياران","مليارات"],[1_000_000,"مليون","مليونان","ملايين"],[1000,"ألف","ألفان","آلاف"]] as const) {
    const q = Math.floor(n / base); if (!q) continue;
    parts.push(q === 1 ? one : q === 2 ? two : under1000(q) + " " + (q <= 10 ? many : one)); n %= base;
  }
  if (n) parts.push(under1000(n)); return parts.join(" و");
}
export function voucherAmountWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 200_000_000_000) throw new Error("مبلغ غير صحيح");
  return `${words(Math.floor(cents / 100))} ريال سعودي${cents % 100 ? ` و${words(cents % 100)} هللة` : ""} فقط لا غير`;
}
