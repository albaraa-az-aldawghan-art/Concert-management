// Shared client-side PDF generation for printable sheets (kitchen/warehouse).
// The sheets are FIXED-WIDTH documents (like the contract page), so capture
// needs no viewport tricks — same pixel-perfect output on every device, fast.

export const isMobileDevice = () =>
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

export async function generateElementPDF(el: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { default: jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  await document.fonts.ready;

  const w = el.offsetWidth;
  const h = el.scrollHeight;
  const opts = {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    width: w,
    height: h,
    // Resolved auto-margins on the clone shift the capture sideways — zero them
    style: { margin: "0", marginLeft: "0", marginRight: "0" },
  };

  // Safari loads fonts/images inside SVG foreignObject lazily — first pass
  // warms the cache, second produces the complete capture.
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) await toCanvas(el, opts);
  const canvas = await toCanvas(el, opts);

  const pdfW = 210; // mm
  const pdfH = Math.round((canvas.height / canvas.width) * pdfW * 10) / 10;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pdfW, pdfH] });
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
