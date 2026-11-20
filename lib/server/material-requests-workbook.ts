import ExcelJS from "exceljs";
import { MATERIAL_EXPORT_COLUMNS, materialExportRows, inMaterialPeriod, type MaterialExportColumn, type MaterialExportData } from "../material-requests-export";
import { MATERIAL_SECTIONS, materialRound } from "../material-requests";
import { ApiError } from "./guard";

export function materialExportColumns(value:unknown):MaterialExportColumn[] {
  if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(key=>!MATERIAL_EXPORT_COLUMNS.some(c=>c.key===key)))throw new ApiError("حدد أعمدة صحيحة للتصدير دون تكرار");
  return MATERIAL_EXPORT_COLUMNS.filter(c=>value.includes(c.key)).map(c=>c.key);
}
export async function buildMaterialRequestsWorkbook(data:MaterialExportData, keys:MaterialExportColumn[], summary=true, arrivals=true) {
  const book=new ExcelJS.Workbook(); book.creator="نظام الفريج";book.created=new Date();
  const selected=MATERIAL_EXPORT_COLUMNS.filter(c=>keys.includes(c.key));
  if(!selected.length)throw new ApiError("اختر عمودًا واحدًا على الأقل");
  const scope=`الفترة حسب ${data.filters.basis==="request"?"تاريخ الطلب":"تاريخ التوريد"}: ${data.filters.from||"دون بداية"} إلى ${data.filters.to||"دون نهاية"} | ${data.requests.length} طلب`;
  const note="الكميات بوحدة المخزون لكل مادة. الإجماليات والمتبقي حتى وقت التصدير؛ الواصل خلال الفترة حسب تاريخ الوصول الفعلي. لا تُجمع الوحدات المختلفة معًا.";
  type Column={key:string;label:string;width:number};
  function sheet(name:string,columns:Column[],caption:string) {
    const ws=book.addWorksheet(name,{views:[{rightToLeft:true,showGridLines:false,state:"frozen",ySplit:4}]});
    ws.columns=columns.map(c=>({key:c.key,width:c.width}));
    const headingWidth=Math.max(8,columns.reduce((sum,c)=>sum+c.width,0)-3);
    for(const [i,text]of [name,scope,caption].entries()){ws.addRow([text]);if(columns.length>1)ws.mergeCells(i+1,1,i+1,columns.length);ws.getRow(i+1).height=Math.min(400,Math.max(i===2?40:25,Math.ceil(text.length/headingWidth)*16+8));}
    ws.getRow(1).font={name:"Arial",size:15,bold:true,color:{argb:"FF1C2D50"}};
    ws.getRow(4).values=columns.map(c=>c.label);ws.getRow(4).height=36;
    ws.getRow(4).eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1C2D50"}};cell.font={name:"Arial",size:11,bold:true,color:{argb:"FFFFFFFF"}};cell.alignment={wrapText:true,horizontal:"center",vertical:"middle"};});
    ws.autoFilter={from:{row:4,column:1},to:{row:4,column:columns.length}};
    ws.pageSetup={orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:4"};
    return ws;
  }
  function finish(ws:ExcelJS.Worksheet) {
    ws.eachRow((row,index)=>{
      if(index===4)return;
      row.alignment={horizontal:"right",vertical:"middle",wrapText:true};
      if(index<4){if(index>1)row.font={name:"Arial",size:10,color:{argb:"FF64748B"}};return;}
      row.font={name:"Arial",size:11,color:{argb:"FF1C2D50"}};
      let lines=1;
      row.eachCell((cell,column)=>{
        if(index%2)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F5F9"}};
        if(typeof cell.value==="number"){cell.numFmt='#,##0.00';cell.alignment={horizontal:"center",vertical:"middle"};}
        if(typeof cell.value==="string")cell.numFmt="@";
        if(cell.value instanceof Date){cell.numFmt='yyyy-mm-dd';cell.alignment={horizontal:"center",vertical:"middle"};}
        const value=typeof cell.value==="string"?cell.value:"";
        lines=Math.max(lines,...value.split("\n").map(s=>Math.ceil(s.length/Math.max(8,(ws.getColumn(column).width??20)-3))));
      });row.height=Math.min(400,Math.max(28,lines*15+8));
    });
  }
  const rows=materialExportRows(data), quantityKeys=selected.filter(c=>"quantity"in c).map(c=>c.key);
  if(summary&&quantityKeys.length) {
    const columns=[{key:"barcode",label:"باركود المادة",width:23},{key:"name",label:"المادة",width:32},{key:"unit",label:"الوحدة",width:16},...selected.filter(c=>"quantity"in c)];
    const ws=sheet("ملخص المواد",columns,note);
    const groups=new Map<string,typeof rows[number]>();
    for(const row of rows){const key=JSON.stringify([row.barcode,row.unit]);const previous=groups.get(key);if(!previous)groups.set(key,{...row});else for(const field of quantityKeys)previous[field]=materialRound(Number(previous[field])+Number(row[field]));}
    for(const row of groups.values())ws.addRow(columns.map(c=>row[c.key as keyof typeof row]));finish(ws);
  }
  const ws=sheet("الطلبات والمواد",selected,note);
  for(const row of rows)ws.addRow(selected.map(c=>"date"in c&&row[c.key]?new Date(`${row[c.key]}T00:00:00Z`):row[c.key]===""?null:row[c.key]));finish(ws);
  if(arrivals) {
    const columns=[{key:"request",label:"رقم الطلب",width:42},{key:"section",label:"قسم الطلب",width:23},{key:"assigned",label:"التوجيه",width:26},{key:"date",label:"تاريخ التوريد",width:18},{key:"supplier",label:"المورد",width:28},{key:"name",label:"المادة",width:32},{key:"barcode",label:"الباركود",width:22},{key:"unit",label:"الوحدة",width:15},{key:"quantity",label:"الكمية الواصلة",width:21},{key:"state",label:"حالة الدفعة",width:24},{key:"invoice",label:"رقم الفاتورة",width:23},{key:"invoiceDate",label:"تاريخ الفاتورة",width:18},{key:"notes",label:"ملاحظات التوريد",width:38}];
    const receiptSheet=sheet("دفعات التوريد",columns,"دفعات الوصول الفعالة فقط؛ تُستبعد الملغاة. عند اختيار فترة حسب التوريد تظهر دفعات الفترة فقط. الأسعار غير مشمولة في هذا التقرير.");
    const requests=new Map(data.requests.map(r=>[r.id,r]));
    for(const receipt of [...data.receipts].sort((a,b)=>a.receivedDate.localeCompare(b.receivedDate)||a.id.localeCompare(b.id))) {
      const request=requests.get(receipt.requestId);
      if(!request||receipt.state==="void"||(data.filters.basis==="delivery"&&!inMaterialPeriod(receipt.receivedDate,data.filters)))continue;
      for(const line of receipt.lines)receiptSheet.addRow([request.number,MATERIAL_SECTIONS[request.section??"general"],request.assignedToName||"غير موجّه",new Date(`${receipt.receivedDate}T00:00:00Z`),receipt.supplierName,line.name,line.barcode,line.unit,line.quantity,receipt.state==="posted"?"معتمدة بالمخزون":"بانتظار الفاتورة",receipt.invoiceNumber||null,receipt.invoiceDate?new Date(`${receipt.invoiceDate}T00:00:00Z`):null,receipt.notes||null]);
    }finish(receiptSheet);
  }
  return book;
}
