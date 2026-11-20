import { MATERIAL_SECTIONS, MATERIAL_STATES, materialRemaining, materialRound, type MaterialRequest, type MaterialReceipt } from "./material-requests";

export const MATERIAL_EXPORT_COLUMNS = [
  { key:"number",label:"رقم الطلب",width:42 },{ key:"section",label:"قسم الطلب",width:24 },
  { key:"requestDate",label:"تاريخ الطلب",width:17,date:true },{ key:"firstDelivery",label:"أول تاريخ توريد",width:19,date:true },
  { key:"lastDelivery",label:"آخر تاريخ توريد",width:19,date:true },{ key:"deliveryDates",label:"جميع تواريخ التوريد",width:32 },
  { key:"assignedTo",label:"التوجيه / الموظف",width:26 },{ key:"state",label:"حالة الطلب",width:23 },{ key:"source",label:"مصدر الطلب",width:16 },
  { key:"barcode",label:"باركود المادة",width:22 },{ key:"name",label:"اسم المادة",width:32 },{ key:"unit",label:"وحدة المخزون",width:17 },
  { key:"requested",label:"الكمية المطلوبة",width:20,quantity:true },{ key:"received",label:"إجمالي الواصل حاليًا",width:24,quantity:true },
  { key:"periodReceived",label:"الواصل خلال الفترة",width:23,quantity:true },{ key:"posted",label:"المعتمد بالمخزون حاليًا",width:25,quantity:true },
  { key:"pending",label:"بانتظار الفاتورة حاليًا",width:25,quantity:true },{ key:"remaining",label:"المتبقي للتوريد حاليًا",width:25,quantity:true },
  { key:"cancelled",label:"الكمية الملغاة",width:20,quantity:true },{ key:"purchaseUnit",label:"وحدة الشراء",width:17 },
  { key:"conversion",label:"عدد وحدات المخزون لكل وحدة شراء",width:30 },{ key:"suppliers",label:"الموردون",width:30 },
  { key:"invoices",label:"أرقام الفواتير",width:30 },{ key:"notes",label:"ملاحظات الطلب",width:42 },{ key:"cancelReason",label:"سبب إلغاء المتبقي",width:32 },
] as const;
export type MaterialExportColumn = typeof MATERIAL_EXPORT_COLUMNS[number]["key"];
export type MaterialExportFilters = { basis:"request"|"delivery"; from:string; to:string; q?:string; state?:string };
export type MaterialExportData = { requests:MaterialRequest[]; receipts:MaterialReceipt[]; filters:MaterialExportFilters };
export const DEFAULT_MATERIAL_EXPORT_COLUMNS: MaterialExportColumn[] = ["number","section","requestDate","lastDelivery","assignedTo","state","barcode","name","unit","requested","received","periodReceived","posted","pending","remaining","cancelled"];
export const inMaterialPeriod = (date:string, filters:MaterialExportFilters) => (!filters.from || date>=filters.from) && (!filters.to || date<=filters.to);
export function materialExportRows(data:MaterialExportData) {
  return data.requests.flatMap(request => request.lines.map(line => {
    const arrivals = data.receipts.filter(receipt => receipt.requestId===request.id && receipt.state!=="void" && receipt.lines.some(l=>l.barcode===line.barcode));
    const dates = [...new Set(arrivals.map(r=>r.receivedDate))].sort();
    return { number:request.number,section:MATERIAL_SECTIONS[request.section??"general"],requestDate:request.requestDate,
      firstDelivery:dates[0]??"",lastDelivery:dates.at(-1)??"",deliveryDates:dates.join("، "),assignedTo:request.assignedToName||"غير موجّه",
      state:MATERIAL_STATES[request.state],source:request.source==="automatic"?"تلقائي":"يدوي",barcode:line.barcode,name:line.name,unit:line.unit,
      requested:line.requested,received:line.received,periodReceived:materialRound(arrivals.filter(r=>inMaterialPeriod(r.receivedDate,data.filters)).reduce((sum,r)=>sum+(r.lines.find(l=>l.barcode===line.barcode)?.quantity??0),0)),
      posted:line.posted,pending:materialRound(line.received-line.posted),remaining:materialRemaining(line),cancelled:line.cancelled,
      purchaseUnit:line.purchaseUnit,conversion:line.purchaseToIssue,suppliers:[...new Set(arrivals.map(r=>r.supplierName))].join("، "),
      invoices:[...new Set(arrivals.map(r=>r.invoiceNumber).filter(Boolean))].join("، "),notes:request.notes,cancelReason:request.cancelReason??"",
    };
  }));
}
