import { NextRequest, NextResponse } from "next/server";
import type { Browser } from "puppeteer-core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildCustomersPdfHtml } from "@/lib/customer-pdf";
import type { CustomerFilters } from "@/lib/customer-list";
import { selectCustomerStatements } from "@/lib/customer-pdf-scope";
import { listConcertCustomers } from "@/lib/server/concert-customers-core";
import { ApiError, require_, requireCaller, withActivityResponse } from "@/lib/server/guard";
import { launchPdfBrowser } from "@/lib/server/pdf-browser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function filtersFrom(value: unknown): CustomerFilters {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    search: text(item.search, 120),
    period: item.period === "month" || item.period === "year" ? item.period : "",
    dateFrom: text(item.dateFrom, 10),
    dateTo: text(item.dateTo, 10),
    frequency: item.frequency === "one" || item.frequency === "returning" ? item.frequency : "",
    financial: item.financial === "paid" || item.financial === "due" ? item.financial : "",
    recorder: text(item.recorder, 120),
  };
}

async function download(req: NextRequest) {
  let browser: Browser | undefined;
  try {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "customers_export", "تصدير قائمة عملاء الحفلات");
    const body = await req.json() as { customerIds?: unknown; filters?: unknown };
    const filters = filtersFrom(body.filters);
    for (const date of [filters.dateFrom, filters.dateTo]) {
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw new ApiError("تاريخ الفلتر غير صحيح");
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new ApiError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
    if (body.customerIds !== undefined && (!Array.isArray(body.customerIds) || body.customerIds.length > 2000 || body.customerIds.some((id) => typeof id !== "string" || id.length > 150))) throw new ApiError("اختيار العملاء غير صحيح");
    const generatedAt = new Date();
    const records = await listConcertCustomers(caller.db);
    const customers = selectCustomerStatements(records, filters, body.customerIds as string[] | undefined, generatedAt);
    if (customers.length > 2000) throw new ApiError("عدد العملاء أكبر من الحد المسموح للتصدير");
    if (!customers.length) throw new ApiError("لا توجد بيانات مطابقة للعملاء والفلاتر المختارة");
    const fontBase64 = await readFile(
      path.join(process.cwd(), "node_modules", "@fontsource", "cairo", "files", "cairo-arabic-400-normal.woff2"),
      "base64",
    );
    const html = buildCustomersPdfHtml(customers, generatedAt, {
      fontBase64,
      filters,
    });

    browser = await launchPdfBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "9mm", bottom: "15mm", left: "9mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;padding:0 9mm;color:#64748b;font:8px Arial;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    const filename = encodeURIComponent(`عملاء-الحفلات-${new Date().toISOString().slice(0, 10)}.pdf`);
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="concert-customers.pdf"; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر إنشاء ملف PDF" }, { status });
  } finally {
    if (browser) await browser.close();
  }
}

export async function POST(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}
