import ExcelJS from "exceljs";
import { aggregateKitchenOrders, type KitchenExportOrder, type KitchenExportFilters } from "@/lib/kitchen-export";
import { eventDateString } from "@/lib/event-date";
import { periodBounds } from "@/lib/date-period";

export function buildKitchenSummaryWorkbook(orders: KitchenExportOrder[], filters?: KitchenExportFilters) {
  const rows = aggregateKitchenOrders(orders);
  if (!rows.length) throw new Error("لا توجد أصناف للتصدير");
  const wb = new ExcelJS.Workbook();
  wb.creator = "الفريج";
  const ws = wb.addWorksheet("أصناف المطبخ", { views: [{ rightToLeft: true, state: "frozen", ySplit: 4, showGridLines: false }] });
  ws.columns = [{width:8},{width:44},{width:14},{width:28},{width:28}];
  ws.mergeCells("A1:E1"); ws.getCell("A1").value = "أصناف الحفلات المستلمة في المطبخ";
  const dates = orders.map(o=>eventDateString(o.concertDate)).filter(Boolean).sort();
  const bounds=filters?.date.mode==="custom"?[filters.date.from,filters.date.to]:filters?periodBounds(filters.date.mode):["",""];
  ws.mergeCells("A2:E2"); ws.getCell("A2").value = `${orders.length} حفلة · ${rows.length} صنف · ${bounds[0] || dates[0] || "بلا تاريخ"} إلى ${bounds[1] || dates.at(-1) || "بلا تاريخ"}`;
  ws.mergeCells("A3:E3"); ws.getCell("A3").value = `الحفلات: ${orders.slice(0,25).map(o=>`#${o.concertNumber}`).join("، ")}${orders.length>25?`، و${orders.length-25} حفلة أخرى`:""}`;
  ws.getRow(4).values = ["رقم", "اسم الصنف", "العدد", "ملاحظات 1", "ملاحظات 2"];
  rows.forEach((row,i)=>ws.addRow([i+1,row.name,row.quantity,null,null]));
  for (let r=1;r<=ws.rowCount;r++) {
    const row=ws.getRow(r); row.height=r===1?32:r===3?Math.max(26,Math.ceil(Math.min(orders.length,25)/18)*18):28;
    row.eachCell({includeEmpty:true},cell=>{
      cell.font={name:"Arial",size:r===1?15:12,color:{argb:"FF1C2D50"},bold:r===1||r===4};
      cell.alignment={vertical:"middle",horizontal:"center",wrapText:true};
      if(r>4) cell.border={bottom:{style:"thin",color:{argb:"FFD4DCE8"}}};
      if(r===4){cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1C2D50"}};cell.font={name:"Arial",size:12,bold:true,color:{argb:"FFFFFFFF"}};}
    });
    if(r>4){row.getCell(2).alignment={horizontal:"right",vertical:"middle",wrapText:true};row.height=Math.max(28,Math.ceil(String(row.getCell(2).value).length/35)*18);}
  }
  rows.forEach((row,i)=>{
    const decimals=row.quantity.toFixed(9).replace(/0+$/, "").split(".")[1]?.length ?? 0;
    ws.getCell(`C${i+5}`).numFmt=Number.isInteger(row.quantity)?"0":`0.${"0".repeat(decimals)}`;
  });
  ws.autoFilter={from:{row:4,column:1},to:{row:ws.rowCount,column:5}};
  ws.pageSetup={paperSize:9,orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:4",printArea:`A1:E${ws.rowCount}`};
  return wb;
}
