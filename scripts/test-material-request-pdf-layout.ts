import { mkdir, writeFile } from "node:fs/promises";
import { renderMaterialRequestPdf } from "../lib/server/material-request-pdf";
import type { MaterialRequest } from "../lib/material-requests";

const request: MaterialRequest = {
  id: "fixture", number: "MR-PRINT-2026-11-20", source: "manual", state: "partial", createdBy: "fixture",
  requestDate: "2026-11-20", createdAt: "", updatedAt: "", lastReceivedAt: null,
  notes: "يرجى مراجعة الكميات عند الاستلام. المواد الواصلة دون فاتورة تبقى معلقة حتى اعتماد الفاتورة.",
  lines: Array.from({ length: 30 }, (_, i) => ({
    barcode: `TEST-${i}`, name: ["أرز بسمتي", "بطاطس ذهبية", "زيت نباتي", "عبوات تغليف الطعام المقاومة للحرارة بأغطية محكمة"][i % 4],
    unit: i % 2 ? "حبة" : "كجم", purchaseUnit: "كيس", purchaseToIssue: 10, enteredUnit: "stock" as const,
    enteredQuantity: 125.5 + i, requested: 125.5 + i, received: 25.25, posted: 0, cancelled: 0, balanceAtRequest: 15, minimumAtRequest: 10,
  })),
};
async function main() {
  await mkdir("tmp/material-requests", { recursive: true });
  await writeFile("tmp/material-requests/request-layout.pdf", await renderMaterialRequestPdf(request, request.lines, "المطعم", "أحمد محمد عبدالرحمن"));
  console.log("Rendered 30-line Arabic PDF fixture: tmp/material-requests/request-layout.pdf");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
