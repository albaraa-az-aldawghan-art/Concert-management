import { NextRequest, NextResponse } from "next/server";
import type { Browser } from "puppeteer-core";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Must match the installed @sparticuz/chromium-min version
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.tar";

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    chromium.setGraphicsMode = false;

    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });
  }

  // Local development: use system Chrome
  const puppeteer = (await import("puppeteer-core")).default;
  return puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let browser: Browser | undefined;

  try {
    const host  = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const contractUrl = `${proto}://${host}/contract/${params.id}`;

    browser = await launchBrowser();

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
      .catch(() => params.id);

    await page.emulateMediaType("print");
    await new Promise<void>((r) => setTimeout(r, 400));

    const contentHeightPx = await page.evaluate(() => {
      document.documentElement.style.setProperty("--contract-zoom", "100%");
      void document.body.offsetHeight;
      const el = document.getElementById("contract-doc");
      return el ? el.scrollHeight : 1062;
    });

    const contentHeightMm = Math.ceil(contentHeightPx * 0.264583);
    const pageHeightMm = contentHeightMm + 16;

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
