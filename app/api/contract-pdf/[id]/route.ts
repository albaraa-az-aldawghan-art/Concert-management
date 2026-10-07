import { NextRequest, NextResponse } from "next/server";
import { requireCaller, withActivityResponse } from "@/lib/server/guard";
import { activityContext } from "@/lib/server/activity-context";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { launchPdfBrowser } from "@/lib/server/pdf-browser";
import type { Browser } from "puppeteer-core";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function download(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let browser: Browser | undefined;

  try {
    const { id } = await params;
    if (req.headers.has("authorization")) await requireCaller(req);
    else {
      const ref = getAdminDb().collection("activity_logs").doc();
      await ref.create({ actorId: "anonymous", actorName: "زائر غير مسجل", actorEmail: "",
        action: "تصدير عقد PDF", path: req.nextUrl.pathname, targetId: id,
        status: "pending", source: "server", createdAt: FieldValue.serverTimestamp() });
      const context = activityContext.getStore();
      if (context) context.ref = ref;
    }
    const host  = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const contractUrl = `${proto}://${host}/contract/${id}`;

    browser = await launchPdfBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    await page.goto(contractUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.waitForFunction(
      () => {
        const el = document.getElementById("contract-doc");
        return el !== null && el.scrollHeight > 400;
      },
      { timeout: 20000 }
    );

    await new Promise<void>((r) => setTimeout(r, 1500));

    const clientName = await page
      .title()
      .then((t) => t.replace("الفريج - ", "").trim())
      .catch(() => id);

    // Measure in SCREEN mode — @page { size: A4 } is only active in print mode,
    // so measuring there always returns A4 height even for short content.
    // Screen mode gives the true content height with no page-size constraints.
    const contentHeightPx = await page.evaluate(() => {
      document.documentElement.style.setProperty("--contract-zoom", "100%");
      void document.body.offsetHeight;
      const el = document.getElementById("contract-doc");
      return el ? el.scrollHeight : 1062;
    });

    // 1 CSS px @ 96 dpi = 0.264583 mm
    const contentHeightMm = Math.ceil(contentHeightPx * 0.264583);
    // top + bottom margins = 8 + 8 = 16 mm
    const pageHeightMm = contentHeightMm + 16;

    // page.pdf() internally switches to print media; --contract-zoom: 100% (set
    // above) persists, so the PDF renders at the same zoom we measured.
    const pdf = await page.pdf({
      width: "210mm",
      height: pageHeightMm + "mm",
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
      printBackground: true,
    });

    const filename = encodeURIComponent(`عقد-${clientName}.pdf`);

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[contract-pdf]", err);
    return NextResponse.json({ error: "فشل توليد PDF", detail }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}

export async function GET(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}
