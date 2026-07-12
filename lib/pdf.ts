// Shared client-side PDF generation for printable sheets (kitchen/warehouse).
// window.print() takes ~60s on iOS Safari, so mobile devices generate a real
// PDF via html-to-image (native text rendering — Arabic stays perfect) and
// hand it to the native share sheet, which includes Print and Save to Files.

export const isMobileDevice = () =>
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

export async function generateElementPDF(
  el: HTMLElement,
  captureWidth = 780
): Promise<Blob> {
  const [{ toCanvas }, { default: jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  await document.fonts.ready;

  // Force a desktop-width layout during capture so responsive grids render
  // their print form (e.g. 6-column material grids) even on a phone.
  const vpMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  const savedVp = vpMeta?.content ?? "";
  if (vpMeta) vpMeta.content = "width=1000";

  const savedW = el.style.width;
  const savedMaxW = el.style.maxWidth;
  el.style.setProperty("width", captureWidth + "px", "important");
  el.style.setProperty("max-width", captureWidth + "px", "important");

  try {
    await new Promise<void>((r) => setTimeout(r, 250));

    const captureH = el.scrollHeight;
    const opts = {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: captureWidth,
      height: captureH,
      // Zero out resolved auto-margins on the clone (they shift the capture)
      style: {
        margin: "0",
        marginLeft: "0",
        marginRight: "0",
        width: captureWidth + "px",
        maxWidth: captureWidth + "px",
      },
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
  } finally {
    el.style.width = savedW;
    el.style.maxWidth = savedMaxW;
    if (vpMeta) vpMeta.content = savedVp;
  }
}

// Mobile: native share sheet (includes Print + Save to Files on iOS).
// Falls back to a download anchor if sharing is unavailable.
export async function sharePdf(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      const m = String(err).toLowerCase();
      if (m.includes("abort") || m.includes("cancel")) return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
