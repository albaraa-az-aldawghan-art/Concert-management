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

    const pdf = await page.pdf({
      format: "A4",
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
