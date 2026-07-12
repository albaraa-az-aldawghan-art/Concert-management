// Shared client-side PDF generation for printable sheets (kitchen/warehouse).
//
// Strategy: never capture the live node (scrolled ancestors and flex/grid
// parents can shift the clone sideways). Instead, mount an ISOLATED off-screen
// copy inside a clean white wrapper with generous padding — any residual
// sideways shift lands in the padding instead of clipping content.

export const isMobileDevice = () =>
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

const PAD = 32; // white safety margin around the sheet inside the PDF

export async function generateElementPDF(el: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { default: jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

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
    const canvas = await toCanvas(wrapper, opts);

    const pdfW = 210; // mm
    const pdfH = Math.round((canvas.height / canvas.width) * pdfW * 10) / 10;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pdfW, pdfH] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, pdfW, pdfH);
    return pdf.output("blob");
  } finally {
    wrapper.remove();
  }
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
