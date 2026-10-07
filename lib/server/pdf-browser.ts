import type { Browser } from "puppeteer-core";

const CHROMIUM_VERSION = "149.0.0";

export function chromiumPackUrl(arch = process.arch) {
  const releaseArch = arch === "arm64" ? "arm64" : "x64";
  return `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.${releaseArch}.tar`;
}

export async function launchPdfBrowser(): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const puppeteer = (await import("puppeteer-core")).default;
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(chromiumPackUrl()),
      headless: true,
    });
  }
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
}
