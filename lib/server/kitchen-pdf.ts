import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildKitchenSummaryPdfHtml } from "@/lib/kitchen-pdf";
import type { KitchenExportOrder, KitchenExportFilters } from "@/lib/kitchen-export";
import { launchPdfBrowser } from "./pdf-browser";

export async function renderKitchenSummaryPdf(orders: KitchenExportOrder[], filters: KitchenExportFilters) {
  const font = await readFile(path.join(process.cwd(), "node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2"), "base64");
  const html = buildKitchenSummaryPdfHtml(orders, filters, font);
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true,
      margin: { top: "10mm", bottom: "14mm", left: "9mm", right: "9mm" }, displayHeaderFooter: true,
      headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;color:#64748b;font:8px Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  } finally { await browser.close(); }
}
