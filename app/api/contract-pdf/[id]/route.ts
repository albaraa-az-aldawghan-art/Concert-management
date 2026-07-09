import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let browser: import("puppeteer").Browser | undefined;

  try {
    const host  = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const contractUrl = `${proto}://${host}/contract/${params.id}`;

    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    await page.goto(contractUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait until Firebase data has rendered (contract has real content)
    await page.waitForFunction(
      () => {
        const el = document.getElementById("contract-doc");
        return el !== null && el.scrollHeight > 400;
      },
      { timeout: 20000 }
    );

    // Extra settle time for fonts and images
    await new Promise<void>((r) => setTimeout(r, 1500));

    const clientName = await page
      .title()
      .then((t) => t.replace("الفريج - ", "").trim())
      .catch(() => params.id);

    // Switch to print media so CSS is the same as during PDF generation,
    // then measure the contract's natural print height (zoom removed = 100%).
    await page.emulateMediaType("print");
    await new Promise<void>((r) => setTimeout(r, 400));

    const contentHeightPx = await page.evaluate(() => {
      // Remove any zoom so we measure the true rendered height
      document.documentElement.style.setProperty("--contract-zoom", "100%");
      void document.body.offsetHeight;
      const el = document.getElementById("contract-doc");
      return el ? el.scrollHeight : 1062;
    });

    // 1 CSS px @ 96 dpi = 0.264583 mm
    const contentHeightMm = Math.ceil(contentHeightPx * 0.264583);
    // Add top + bottom margins (8 mm each)
    const pageHeightMm = contentHeightMm + 16;

    // Generate with A4 width and exact content height → no white space
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
    console.error("[contract-pdf]", err);
    return NextResponse.json({ error: "فشل توليد PDF" }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
