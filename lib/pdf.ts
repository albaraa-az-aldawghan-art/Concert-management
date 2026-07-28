// Shared client-side PDF generation for printable sheets (kitchen/warehouse).
//
// Strategy: never capture the live node (scrolled ancestors and flex/grid
// parents can shift the clone sideways). Instead, mount an ISOLATED off-screen
// copy inside a clean white wrapper with generous padding — any residual
// sideways shift lands in the padding instead of clipping content.

export const isMobileDevice = () =>
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

const PAD = 32; // white safety margin around the sheet inside the PDF

// Some browsers render the RTL capture shifted a few dozen pixels sideways.
// Measure the actual ink bounding box and redraw so the left/right white
// margins come out equal — self-correcting for any shift on any browser.
function centerHorizontally(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let maxX = -1;
  const step = 3; // sampling is plenty for margin detection
  for (let y = 0; y < height; y += step) {
    const row = y * width;
    for (let x = 0; x < width; x += step) {
      const i = (row + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) return canvas; // nothing drawn — leave as is

  const shift = Math.round((width - 1 - maxX - minX) / 2);
  if (Math.abs(shift) < 3) return canvas; // already balanced

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d")!;
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, width, height);
  outCtx.drawImage(canvas, shift, 0);
  return out;
}

export async function generateElementPDF(el: HTMLElement, pageWidthMm = 210): Promise<Blob> {
  const { toCanvas } = await import("html-to-image");

  await document.fonts.ready;

  const contentW = el.offsetWidth;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("dir", "rtl");
  wrapper.style.cssText =
    `position:fixed;top:0;left:-100000px;z-index:-1;` +
    `background:#ffffff;padding:${PAD}px;` +
    `width:${contentW + PAD * 2}px;box-sizing:border-box;`;

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.margin = "0";
  clone.style.width = contentW + "px";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Cloned <img> elements re-request from cache — wait until they settle
    await Promise.all(
      Array.from(wrapper.querySelectorAll("img")).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 4000); // never hang on a broken image
            })
      )
    );

    const w = wrapper.offsetWidth;
    const h = wrapper.scrollHeight;
    const opts = {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: w,
      height: h,
      // The live wrapper hides off-screen via position:fixed;left:-100000px —
      // the capture clone inherits those computed styles, which would paint
      // the content outside the canvas (blank PDF). Reset them on the clone.
      style: {
        position: "static",
        left: "0",
        top: "0",
        margin: "0",
      },
    };

    // Safari loads fonts/images inside SVG foreignObject lazily — first pass
    // warms the cache, second produces the complete capture.
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) await toCanvas(wrapper, opts);
    const canvas = centerHorizontally(await toCanvas(wrapper, opts));

    return canvasToPdfBlob(canvas, pageWidthMm);
  } finally {
    wrapper.remove();
  }
}

// Wraps a captured canvas in a PDF page sized exactly to it.
//
// Every PDF in the app goes through here so the page-sizing rule below lives
// in exactly one place: jsPDF's getPageFormat SWAPS pageWidth/pageHeight
// whenever they contradict the requested orientation, so hard-coding
// "portrait" on a capture that is wider than it is tall yields a page
// NARROWER than the image — addImage then paints past the right edge and the
// content is silently cut off. Deriving the orientation from the real aspect
// ratio guarantees the page always matches the image.
export async function canvasToPdfBlob(
  canvas: HTMLCanvasElement,
  pageWidthMm = 210
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdfW = pageWidthMm;
  const pdfH = Math.round((canvas.height / canvas.width) * pdfW * 10) / 10;
  const orientation = pdfH >= pdfW ? "portrait" : "landscape";
  const pdf = new jsPDF({ orientation, unit: "mm", format: [pdfW, pdfH] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, pdfW, pdfH);
  return pdf.output("blob");
}

// Direct download on every platform — iOS 13+ Safari shows its download
// manager and stores the file in Files.
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
