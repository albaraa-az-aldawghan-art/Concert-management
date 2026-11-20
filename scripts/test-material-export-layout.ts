import { mkdir } from "node:fs/promises";
import { buildMaterialRequestsWorkbook } from "../lib/server/material-requests-workbook";
import { DEFAULT_MATERIAL_EXPORT_COLUMNS,type MaterialExportData } from "../lib/material-requests-export";
async function main(){
  const line={barcode:"00042",name:"أرز بسمتي فاخر",unit:"كجم",purchaseUnit:"كيس",purchaseToIssue:10,enteredUnit:"purchase" as const,enteredQuantity:2,requested:20,received:12,posted:10,cancelled:0,balanceAtRequest:3,minimumAtRequest:5};
  const data:MaterialExportData={filters:{basis:"delivery",from:"2026-11-01",to:"2026-11-20"},requests:[{id:"sample",number:"MR-2026-11-SAMPLE",source:"manual",state:"partial",createdBy:"fixture",requestDate:"2026-11-01",createdAt:"",updatedAt:"",lastReceivedAt:"2026-11-15",section:"restaurant",assignedTo:"fixture",assignedToName:"أحمد محمد",notes:"يرجى مراجعة الكمية عند الاستلام.",lines:[line]}],receipts:[{id:"receipt1",requestId:"sample",state:"posted",receivedDate:"2026-11-10",createdAt:"",createdBy:"fixture",supplierName:"مورد المواد الغذائية",invoiceNumber:"INV-42",invoiceDate:"2026-11-10",notes:"الدفعة الأولى",lines:[{...line,quantity:10}]},{id:"receipt2",requestId:"sample",state:"awaiting_invoice",receivedDate:"2026-11-15",createdAt:"",createdBy:"fixture",supplierName:"مورد المواد الغذائية",notes:"بانتظار الفاتورة",lines:[{...line,quantity:2}]}]};
  const book=await buildMaterialRequestsWorkbook(data,DEFAULT_MATERIAL_EXPORT_COLUMNS,true,true);
  await mkdir("tmp/material-requests-xlsx",{recursive:true});await book.xlsx.writeFile("tmp/material-requests-xlsx/sample.xlsx");
  console.log("Created synthetic Excel layout fixture (no production data).");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
