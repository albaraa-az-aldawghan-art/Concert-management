import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildMaterialRequestPdf } from "../material-request-pdf";
import type { MaterialRequest, MaterialRequestLine } from "../material-requests";
import { launchPdfBrowser } from "./pdf-browser";

export async function renderMaterialRequestPdf(request: MaterialRequest, lines: MaterialRequestLine[], section: string, assignee: string) {
  const font = await readFile(path.join(process.cwd(), "node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2"), "base64");
  const html = buildMaterialRequestPdf(request, lines, section, assignee, font);
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: "A4", landscape: false, printBackground: true,
      margin: { top: "12mm", bottom: "16mm", left: "10mm", right: "10mm" }, displayHeaderFooter: true,
      headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;color:#64748b;font:9px Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  } finally { await browser.close(); }
}
