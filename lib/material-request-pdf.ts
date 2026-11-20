import { MATERIAL_STATES, materialRemaining, type MaterialRequest, type MaterialRequestLine } from "./material-requests";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]!);
const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The caller supplies already-authorized lines; no prices or database access here. */
export function buildMaterialRequestPdf(request: MaterialRequest, lines: MaterialRequestLine[], section: string, assignee: string, font: string) {
  if (!lines.length) throw new Error("لا توجد مواد في القسم المختار للطباعة");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
  @font-face{font-family:Cairo;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
  *{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;color:#1c2d50;font-size:11px;line-height:1.7;margin:0}
  h1{font-size:21px;margin:0}header{border-bottom:3px solid #1c2d50;padding-bottom:10px;margin-bottom:12px}
  .ref{font:11px Arial;overflow-wrap:anywhere;color:#64748b;margin-top:4px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;background:#f1f5f9;padding:10px;border-radius:8px;margin:10px 0 14px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #d6deea;padding:7px 5px;text-align:center;overflow-wrap:anywhere}th{background:#1c2d50;color:white;font-weight:normal}td:nth-child(2){text-align:right}tbody tr:nth-child(even){background:#f8fafc}.num{font-family:Arial,sans-serif;direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}.notes{margin-top:12px;padding:10px;border:1px solid #d6deea;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}.hint{font-size:10px;color:#64748b;margin-top:10px}h2{font-size:12px;margin:0 0 4px}
  </style></head><body><header><h1>طلب مواد</h1><div class="ref" dir="ltr">${escape(request.number)}</div></header>
  <div class="meta"><div>القسم: <strong>${escape(section)}</strong></div><div>تاريخ الطلب: <span class="num">${escape(request.requestDate)}</span></div><div>موجّه إلى: <strong>${escape(assignee || "غير موجّه")}</strong></div><div>الحالة: ${escape(MATERIAL_STATES[request.state])}</div></div>
  <table><colgroup><col style="width:5%"><col style="width:27%"><col style="width:12%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>#</th><th>المادة</th><th>الوحدة</th><th>المطلوب</th><th>الواصل</th><th>المتبقي للتوريد</th><th>الملغى</th></tr></thead><tbody>${lines.map((line, index) => `<tr><td class="num">${index+1}</td><td>${escape(line.name)}</td><td>${escape(line.unit)}</td><td class="num">${n(line.requested)}</td><td class="num">${n(line.received)}</td><td class="num">${n(materialRemaining(line))}</td><td class="num">${n(line.cancelled)}</td></tr>`).join("")}</tbody></table>
  ${request.notes ? `<div class="notes"><h2>ملاحظات الطلب</h2>${escape(request.notes)}</div>` : ""}
  ${request.cancelReason ? `<div class="notes"><h2>سبب إلغاء المتبقي</h2>${escape(request.cancelReason)}</div>` : ""}
  <p class="hint">الكميات بوحدة المخزون الموضحة لكل مادة. الواصل قد يشمل كميات بانتظار الفاتورة؛ لا يعني اعتمادها في المخزون. الطباعة لا تغيّر حالة الطلب أو كمياته.</p></body></html>`;
}
