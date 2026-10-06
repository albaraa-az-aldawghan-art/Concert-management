import { NextRequest, NextResponse } from "next/server";
import type { Browser } from "puppeteer-core";
import { buildCustomersPdfHtml, type CustomerPdfRecord } from "@/lib/customer-pdf";
import { ApiError, require_, requireCaller, withActivityResponse } from "@/lib/server/guard";
import { launchPdfBrowser } from "@/lib/server/pdf-browser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function recordsFrom(value: unknown): CustomerPdfRecord[] {
  if (!Array.isArray(value)) throw new ApiError("بيانات العملاء غير صحيحة");
  if (value.length > 2000) throw new ApiError("عدد العملاء أكبر من الحد المسموح للتصدير");
  return value.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      name: text(item.name),
      primaryPhone: text(item.primaryPhone, 30),
      secondaryPhone: text(item.secondaryPhone, 30) || null,
      firstRegisteredAt: text(item.firstRegisteredAt, 50) || null,
      firstCreatedByName: text(item.firstCreatedByName),
      source: text(item.source) || null,
      concertCount: Math.max(0, Math.trunc(finite(item.concertCount))),
      totalValue: finite(item.totalValue),
      totalCollected: finite(item.totalCollected),
      totalRemaining: finite(item.totalRemaining),
      lastConcertAt: text(item.lastConcertAt, 50) || null,
    };
  });
}

async function download(req: NextRequest) {
  let browser: Browser | undefined;
  try {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "customers_export", "تصدير قائمة عملاء الحفلات");
    const body = await req.json() as { customers?: unknown };
    const customers = recordsFrom(body.customers);
    const html = buildCustomersPdfHtml(customers);

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
