"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getConcertById, getConcertPayments, getConcertLogs } from "@/lib/firestore/concerts";
import { getConcertFood } from "@/lib/firestore/food";
import { Concert, ConcertPayment, ConcertFood, ConcertLog, PaymentMethod } from "@/types";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "شبكة",
  cash: "كاش",
  bank_transfer: "تحويل",
};

// A4 usable area with 8mm margins at 96 dpi
const PRINT_W = 733; // 194mm
const PRINT_H = 1062; // 281mm

// Calculates the zoom % needed to fit the contract on one A4 page.
// Returns the value but does NOT apply it — caller decides when to apply.
function calcPrintZoom(): number {
  const doc = document.getElementById("contract-doc");
  if (!doc) return 88;

  document.documentElement.classList.add("force-desktop-layout");
  const savedMW = doc.style.maxWidth;
  const savedW  = doc.style.width;
  doc.style.maxWidth = PRINT_W + "px";
  doc.style.width    = PRINT_W + "px";
  void doc.offsetHeight;
  const h = doc.scrollHeight;
  doc.style.maxWidth = savedMW;
  doc.style.width    = savedW;
  document.documentElement.classList.remove("force-desktop-layout");

  return h > PRINT_H ? Math.floor((PRINT_H / h) * 100) : 100;
}

function applyIosBodyFix() {
  // iOS Safari respects min-height: 100vh even during print, creating a blank page 2.
  // Must fix html, body, AND the page-body div (which has inline minHeight: "100vh").
  // setProperty with "important" creates inline !important — highest CSS priority.
  const targets: Array<HTMLElement | null> = [
    document.documentElement,
    document.body,
    document.querySelector(".page-body"),
  ];
  targets.forEach((el) => {
    if (!el) return;
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("height", "auto", "important");
    el.style.setProperty("overflow", "visible", "important");
  });
  // Force a synchronous reflow so iOS captures the new layout before print
  void document.body.offsetHeight;
}

function resetPrintZoom() {
  document.documentElement.style.removeProperty("--contract-zoom");
  [document.documentElement, document.body, document.querySelector(".page-body") as HTMLElement | null].forEach((el) => {
    if (!el) return;
    el.style.removeProperty("min-height");
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
  });
}

const PAYMENT_ORDINALS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface FoodGroup {
  categoryName: string;
  items: string[];
  totalQty: number;
}

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const [concert, setConcert] = useState<Concert | null>(null);
  const [payments, setPayments] = useState<ConcertPayment[]>([]);
  const [foodItems, setFoodItems] = useState<ConcertFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ConcertLog[]>([]);
  const [showIosHint, setShowIosHint] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Pre-calculated zoom so the print button does zero DOM work on click
  const cachedZoom = useRef<number>(88);

  useEffect(() => {
    async function load() {
      const [c, p, f, l] = await Promise.all([
        getConcertById(id),
        getConcertPayments(id),
        getConcertFood(id),
        getConcertLogs(id),
      ]);
      setConcert(c);
      setPayments(p.sort((a, b) => a.createdAt.seconds - b.createdAt.seconds));
      setFoodItems(f);
      setLogs(l); // already sorted descending by createdAt
      setLoading(false);
      if (c?.clientName) {
        document.title = `الفريج - ${c.clientName}`;
      }
    }
    load();
  }, [id]);

  // Calculate zoom after the page renders (not at click time)
  useEffect(() => {
    // Preload watermark-logo — logo.jpg is already inlined as base64
    const img = new window.Image();
    img.src = "/watermark-logo.jpeg";
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      cachedZoom.current = calcPrintZoom();
    }, 400);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    // beforeprint covers Ctrl+P / browser-menu print — recalculate for accuracy
    function handleBeforePrint() {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const zoom = isIOS ? cachedZoom.current : calcPrintZoom();
      document.documentElement.style.setProperty("--contract-zoom", `${zoom}%`);
    }
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", resetPrintZoom);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", resetPrintZoom);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Tahoma, Arial, sans-serif", direction: "rtl", background: "#CDD4DC" }}>
        <div style={{ color: "#1C2D50", fontSize: 18 }}>جاري تحميل الاتفاقية...</div>
      </div>
    );
  }

  if (!concert) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Tahoma, Arial, sans-serif", direction: "rtl" }}>
        <div style={{ color: "#DC2626", fontSize: 18 }}>لم يتم العثور على الحفلة</div>
      </div>
    );
  }

  // ── Food grouping ─────────────────────────────────
  const foodGroups: FoodGroup[] = [];
  const seen = new Map<string, FoodGroup>();
  for (const food of foodItems) {
    if (!seen.has(food.categoryName)) {
      const g: FoodGroup = { categoryName: food.categoryName, items: [], totalQty: 0 };
      seen.set(food.categoryName, g);
      foodGroups.push(g);
    }
    const g = seen.get(food.categoryName)!;
    g.items.push(food.selectedOption);
    g.totalQty += food.quantity ?? 0;
  }

  // ── Financial calculations ────────────────────────
  const price = concert.price ?? 0;
  const priceBeforeVat = Math.round((price / 1.15) * 100) / 100;
  const vat = Math.round((price - priceBeforeVat) * 100) / 100;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = price - totalPaid;

  // ── Dates ─────────────────────────────────────────
  const concertDate = concert.date?.toDate();
  const dayName = concertDate ? AR_DAYS[concertDate.getDay()] : "";
  const formattedConcertDate = concertDate ? fmtDate(concertDate) : "—";
  const createdDate = concert.createdAt?.toDate();
  const formattedCreatedDate = createdDate ? fmtDate(createdDate) : "—";
  const cancelledDate = concert.cancelledAt ? concert.cancelledAt.toDate() : null;
  const formattedCancelledDate = cancelledDate ? fmtDate(cancelledDate) : null;

  // ── Status ────────────────────────────────────────
  const isCancelled = concert.status === "cancelled";
  const isConfirmed = totalPaid > 0;

  // ── Change tracking from logs ─────────────────────
  // Last non-creation log → "آخر تحديث" timestamp
  const lastUpdateLog = logs.find((l) => !l.description.startsWith("تم إنشاء"));
  const lastUpdateDate = lastUpdateLog ? lastUpdateLog.createdAt.toDate() : null;
  const formattedLastUpdate = lastUpdateDate ? fmtDate(lastUpdateDate) : null;

  // Build map: field → most-recent previous value (newest log wins)
  const fieldPrev: Record<string, string> = {};
  for (const log of logs) { // logs sorted newest-first
    if (log.field && log.oldValue !== undefined && !(log.field in fieldPrev)) {
      fieldPrev[log.field] = log.oldValue;
    }
  }
  // Parse previous date for display
  const prevDateStr = fieldPrev["date"] ?? null;
  const prevDateObj = prevDateStr ? new Date(prevDateStr + "T12:00:00") : null;
  const prevDateFmt = prevDateObj ? `${fmtDate(prevDateObj)} — ${AR_DAYS[prevDateObj.getDay()]}` : null;
  const prevVenueName = fieldPrev["venueName"] ?? null;

  // ── Food change tracking ──────────────────────────
  interface DeletedFood { categoryName: string; option: string; qty: number }
  const deletedFoods: DeletedFood[] = [];
  const addedFoodKeys = new Set<string>(); // "categoryName:::option"
  const foodQtyChanges = new Map<string, { oldQty: number; newQty: number }>(); // "categoryName:::option"
  for (const log of logs) {
    if (log.field === "foodDeleted" && log.oldValue) {
      const parts = log.oldValue.split(":::");
      deletedFoods.push({ categoryName: parts[0] ?? "", option: parts[1] ?? "", qty: parseInt(parts[2] ?? "0") || 0 });
    }
    if (log.field === "foodAdded" && log.newValue) {
      const parts = log.newValue.split(":::");
      addedFoodKeys.add(`${parts[0] ?? ""}:::${parts[1] ?? ""}`);
    }
    if (log.field === "foodQty" && log.oldValue && log.newValue) {
      const op = log.oldValue.split(":::");
      const np = log.newValue.split(":::");
      const key = `${op[0] ?? ""}:::${op[1] ?? ""}`;
      if (!foodQtyChanges.has(key)) { // newest log wins (logs sorted newest-first)
        foodQtyChanges.set(key, { oldQty: parseInt(op[2] ?? "0") || 0, newQty: parseInt(np[2] ?? "0") || 0 });
      }
    }
  }

  // ── Price change tracking ─────────────────────────
  const prevPrice = fieldPrev["price"] ? parseFloat(fieldPrev["price"]) : null;
  const prevPriceBeforeVat = prevPrice !== null ? Math.round((prevPrice / 1.15) * 100) / 100 : null;
  const prevVat = prevPrice !== null && prevPriceBeforeVat !== null ? Math.round((prevPrice - prevPriceBeforeVat) * 100) / 100 : null;

  // ── Share as PDF (server-side via Puppeteer API route) ───────────────
  async function shareContractAsPDF() {
    if (!concert) return;
    setSharing(true);
    try {
      const el = document.getElementById("contract-doc");
      if (!el) throw new Error("contract element not found");

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Fix width for consistent capture, then restore
      const savedW = el.style.width;
      el.style.width = PRINT_W + "px";
      void el.offsetHeight;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        width: PRINT_W,
        height: el.scrollHeight,
      });

      el.style.width = savedW;

      // 8mm margins on all sides — PRINT_W already equals A4 minus those margins
      const margin = 8; // mm
      const contentW = 210 - margin * 2; // 194mm
      const contentH = Math.ceil((canvas.height / canvas.width) * contentW);
      const pdfH = contentH + margin * 2;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [210, pdfH] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", margin, margin, contentW, contentH);

      const filename = `عقد-${concert.clientName}.pdf`;
      const blob = pdf.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: filename });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("bort") && !msg.includes("cancel")) {
        alert("خطأ: " + msg);
      }
    } finally {
      setSharing(false);
    }
  }

  // ── Styles ────────────────────────────────────────
  const S = {
    body: {
      fontFamily: "'Arabic Typesetting', 'Traditional Arabic', 'Tahoma', 'Arial', sans-serif",
      direction: "rtl" as const,
      background: "#CDD4DC",
      minHeight: "100vh",
      padding: "16px 12px 32px",
    },
    printBar: {
      maxWidth: 860,
      margin: "0 auto 20px",
      background: "white",
      borderRadius: 10,
      padding: "12px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: "0 1px 4px rgba(0,0,0,0.09)",
      border: "1px solid #D4DAE4",
      flexWrap: "wrap" as const,
    },
    printBtn: {
      background: "#1C2D50",
      color: "white",
      border: "none",
      borderRadius: 8,
      padding: "8px 20px",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit",
    },
    doc: {
      maxWidth: 860,
      margin: "0 auto",
      background: "white",
      border: "1.5px solid #B8C4D0",
      boxShadow: "0 6px 32px rgba(0,0,0,0.14)",
      position: "relative" as const,
    },
    header: {
      background: "#1C2D50",
      color: "white",
      padding: "12px 20px",
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      gap: 16,
      alignItems: "center" as const,
    },
    hdrAr: { fontSize: 10.5, lineHeight: 1.7, opacity: 0.85, textAlign: "right" as const },
    hdrCenter: { display: "flex", flexDirection: "column" as const, alignItems: "center" as const, gap: 5, textAlign: "center" as const },
    logoCircle: {
      width: 60, height: 60, background: "white", borderRadius: "50%",
      display: "flex", flexDirection: "column" as const,
      alignItems: "center" as const, justifyContent: "center" as const,
    },
    logoAr: { fontSize: 16, fontWeight: 900, color: "#1C2D50", lineHeight: 1.1 },
    logoEn: { fontSize: 7, color: "#B0BDC9", letterSpacing: "0.5px", marginTop: 1 },
    restName: { fontSize: 13.5, fontWeight: 700 },
    restNameEn: { fontSize: 9.5, opacity: 0.55, direction: "ltr" as const },
    contractTitle: { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "1.2px", marginTop: 5, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.18)", width: "100%", textAlign: "center" as const },
    hdrEn: { fontSize: 10.5, lineHeight: 1.7, opacity: 0.78, textAlign: "left" as const, direction: "ltr" as const },
    cancelBar: {
      background: "#FEE2E2",
      borderBottom: "1.5px solid #FECACA",
      padding: "7px 20px",
      display: "flex",
      alignItems: "center" as const,
      gap: 10,
      fontSize: 11.5,
      color: "#991B1B",
      fontWeight: 600,
    },
    meta: {
      background: "#EEF1F7",
      borderBottom: "1.5px solid #D4DAE4",
      padding: "7px 20px",
      display: "flex",
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      flexWrap: "wrap" as const,
      gap: 8,
    },
    metaLeft: { display: "flex", gap: 20, flexWrap: "wrap" as const, alignItems: "center" as const },
    metaItem: { fontSize: 11.5 },
    metaLbl: { color: "#64748B", fontWeight: 600, marginLeft: 4 },
    metaVal: { color: "#1C2D50", fontWeight: 700 },
    section: { padding: "9px 20px", borderBottom: "1px solid #E8ECF0" },
    secHd: {
      fontSize: 9.5, fontWeight: 700, color: "#64748B",
      letterSpacing: "1.6px", marginBottom: 8,
      display: "flex", alignItems: "center" as const, gap: 8,
    },
    secAccent: { width: 3, height: 11, background: "#1C2D50", borderRadius: 2, flexShrink: 0 },
    secLine: { flex: 1, height: 1, background: "#E8ECF0" },
    infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 36px" },
    infoCol: { display: "flex", flexDirection: "column" as const, gap: 7 },
    fld: { display: "flex", alignItems: "baseline" as const, gap: 6, fontSize: 12.5 },
    fl: { color: "#64748B", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" as const, minWidth: 82, flexShrink: 0 },
    fv: { color: "#0F1A2E", fontWeight: 500 },
    fvSerial: { fontWeight: 800, color: "#1C2D50", fontSize: 13 },
    tblWrap: { overflowX: "auto" as const },
    tbl: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12.5 },
    th: { padding: "7px 10px", textAlign: "right" as const, fontWeight: 600, fontSize: 11.5, background: "#1C2D50", color: "white" },
    tdCat: { padding: "7px 10px", fontWeight: 700, color: "#1C2D50", fontSize: 12.5, borderBottom: "1px solid #E8ECF0", width: "22%" },
    tdItems: { padding: "7px 10px", color: "#374151", fontSize: 12.5, borderBottom: "1px solid #E8ECF0", lineHeight: 1.45, width: "56%" },
    tdTotal: { padding: "7px 10px", fontWeight: 800, color: "#1C2D50", fontSize: 13, textAlign: "center" as const, borderBottom: "1px solid #E8ECF0", width: "22%" },
    notesBox: {
      background: "#FFFBEB", border: "1px solid #FDE68A",
      borderRadius: 5, padding: "7px 11px",
      fontSize: 12, color: "#44403C", lineHeight: 1.6,
    },
    finRow: { display: "flex", justifyContent: "space-between" as const, alignItems: "flex-start" as const, padding: "6px 20px", borderBottom: "1px solid #E8ECF0", fontSize: 12.5 },
    finLbl: { color: "#64748B", fontWeight: 600 },
    finVal: { fontWeight: 700, color: "#0F1A2E" },
    finBand: { background: "#1C2D50", color: "white", padding: "9px 20px", display: "flex", justifyContent: "space-between" as const, alignItems: "center" as const },
    finBandLbl: { color: "rgba(255,255,255,0.75)", fontSize: 12.5 },
    finBandVal: { color: "white", fontSize: 16, fontWeight: 700 },
    payGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, padding: "6px 20px", borderBottom: "1px solid #E8ECF0" },
    payCell: { border: "1px solid #E8ECF0", borderRadius: 5, padding: "4px 9px", background: "#FAFBFC" },
    payMeta: { marginTop: 2, display: "flex", gap: 6, alignItems: "center" as const, flexWrap: "wrap" as const },
    payMethod: { fontSize: 10, background: "#F1F5F9", color: "#475569", padding: "1px 7px", borderRadius: 4, fontWeight: 700 },
    payDate: { fontSize: 10, color: "#94A3B8" },
    finPaidVal: { fontWeight: 700, color: "#065F46" },
    finRemainingVal: { fontWeight: 700, color: "#DC2626" },
    refundMethod: { fontSize: 10, background: "#FEE2E2", color: "#991B1B", padding: "1px 7px", borderRadius: 4, fontWeight: 700 },
    refundVal: { fontWeight: 700, color: "#DC2626" },
    oldVal: { textDecoration: "line-through", color: "#94A3B8", fontSize: 10.5, marginLeft: 5 },
    updatedBadge: { fontSize: 10, background: "#FEF3C7", color: "#92400E", padding: "1px 7px", borderRadius: 4, fontWeight: 700, border: "1px solid #FDE68A" },
    newBadge: { fontSize: 9, background: "#D1FAE5", color: "#065F46", padding: "0px 5px", borderRadius: 3, fontWeight: 700, marginRight: 4, border: "1px solid #A7F3D0" },
    tdDel: { padding: "7px 10px", textDecoration: "line-through" as const, color: "#CBD5E1", borderBottom: "1px solid #F1F5F9", fontSize: 12 },
    sigs: { padding: "8px 20px", borderTop: "1px solid #E8ECF0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    sigBox: { border: "1px dashed #B0BDC9", borderRadius: 5, padding: "10px 12px 8px", textAlign: "center" as const },
    sigTitle: { fontSize: 12, fontWeight: 700, color: "#1C2D50", marginBottom: 14 },
    sigLine: { borderTop: "1px solid #B0BDC9", paddingTop: 5, fontSize: 10, color: "#94A3B8" },
    footer: { background: "#EEF1F7", padding: "5px 20px", display: "flex", justifyContent: "space-between" as const, fontSize: 9.5, color: "#94A3B8", borderTop: "1px solid #D4DAE4" },
    unit: { fontSize: 10.5, fontWeight: 400, color: "#94A3B8", marginRight: 3 },
    statusBadge: (type: "confirmed" | "unconfirmed" | "cancelled") => ({
      padding: "3px 12px", borderRadius: 100, fontSize: 12, fontWeight: 700,
      background: type === "confirmed" ? "#DCFCE7" : type === "cancelled" ? "#FEE2E2" : "#FEF3C7",
      color: type === "confirmed" ? "#065F46" : type === "cancelled" ? "#991B1B" : "#92400E",
    }),
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; padding: 0 !important; margin: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
          .page-body {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            min-height: 0 !important;
          }
          #contract-doc {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            zoom: var(--contract-zoom, 88%) !important;
          }
          /* Force Chrome/Android to print background colors and images */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            font-family: "Arabic Typesetting", "Geeza Pro", Tahoma, Arial, sans-serif !important;
          }
        }
        #contract-doc::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 340px;
          height: 340px;
          background-image: url('data:image/jpeg;base64,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fefefffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffefrv3L3faT73qOffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdPHzDDDDGffTDDDDP8Avb33333333333333333333333333333333333333333333333333333333333kU8wwwwwwwn2kwwwwwwxwrb333333333333333333333333333333333333333333333333333333325MMMMMMMMMNT30MMMMMMMMNNL33333333333333333333333333333333333333333333333333333333D//AP8A/wD/AP8A/wD32n//AP8A/wD/AP8A/wDv73333333333333333333333333333333333333333333333333333vz330gMMMMMMMMD2kMMMMMMMMdT3337333333333333333333333333333333333333333333333333iKTX32rLPPPPPPPT3zPPPPPPPe3330VfH33333333333333333333333333333333333333333333332gTxj332r/wD/AP8A/wD/APPbP/8A/wD/AP8A/wC99944UT29999999999999999999999999999999999999999999995E885P1999//AP8A/wD/AOPff/8A/wD/AP7Xffc3ReFN/ffffffffffffffffffffffffffffffffffffffffffffRPPOWx9dffev/8A/wD/AKPef/8A/wD/AO3ffZZ43QaXJffffffffffffffffffffffffffffffffffffffffffeT/POWx//APD333H/AP8A/wCj3n//AP8A6HffdMx34356TdvffffffffffffffffffffffffffffffffffffffffZvPOWx/8A+N9v321vPPPT3nPPPf73375fs/uN+fnP3333333333333333333333333333333333333333n/zkMf8A/jH7Pd999EBBU9tBBHe99qWXXHjfzP7jr+999999999999999999999999999999999999999o85bHn/AIx+35y1fffigQPaQRTfff8Ahtttv+tud/Mfj3333333333333333333333333333333333333313lsd/wDjH7fjbHze99KDA9pB/wDffWKa66666625/wDdz333333333333333333333333333333333333331Bsf/AP7H7fjbHhbXe99NI9pQ9950XX13n333H3XH7n0999999999999999999999999999999999999997H/AP4x+342x4Wx+UvvfTPfffea1VV333X111111x+/fffffffffffffffffffffffffffffffffffffbh5/wCMft+NseFsfkEFTX333332MEHF2muuunvvvutut/33333333333333333333333333333333333323f+9/Nuds+XsflEEEFD33331gEEEEGGmmeeWOOOuOvD333333333333333333333333333333333333200000000000013333313333333333330000000000133333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333XHnnXXnnnXXXXXX3n3HnXH3HnXHXHnb3r3j33nH33b3333333333333333333333333333333333332omiyRBBm+fNm9u/dNttdeeevtt1WeeVX3wFf30H+tZb33333333333333333333333333333333333335VBgiTVFkuVO/Mu+feeftt9cPXyNtll33wFf30H+tZb33333333333333333333333333333333333336SQRBimfds3cudtuutt/ceev333zdWX33wFf30H+tZb3333333333333333333333333333333333333pgiyTFum+Vudu+fdceeuvttcD30CmllX3wFf30H+tZb3333333333333333333333333333333333332rBBi2WdMudu/NuueNt9NeeevluddVWFX3wFf30H+tZb33333333333333333333333333333333333326CRRkuO1u/NuddttdeePvt9UWe+WGkFX3gEv30H+tZb33333333333333333333333333333333333335iiXVkX1peduuePs3ttSmeOnp0zh0EFX2zF/30H+tZb33333333333333333333333333333333333335Bim+dBb3q9dttv36fB2lt0533304EFX2yVP30H+tZb3333333333333333333333333333333333332qTVNk+fv3kuffff37sj2mWH33gz34EFX3q/f30H+tZb3333333333333333333333333333333333332pm2dds+fX1Nuut/34fT21l9X2yb34EFX3o/P30H+tZb33333333333333333333333333333333333325lum9Vvfb29dMfP2rtj22WNX0xL34EFX3gmP30H+tZb33333333333333333333333333333333333336VVsudufD3mesuv2qeD31t930Br34EFX3pvf30H+tb73333333333333333333333333333333333333o+fdG/M/b31tdeP27tz32efX0Qz34EFX3puP30H+tZX3333333333333333333333333333333333332plu/cuaZ533946336fD3lN+n31z3o89b2puf30H+tT333333333333333333333333333333333333326dNvdp33333333335sj33333333333332pNv30H+hb333333333333333333333333333333333333336+Vu/b3bfvvfrr/fSWT33fvfvfvf/AH737n7P94Psd9999999999999999999999999999999999999996bPzPe9orrbfXXnjrZc99zblZPjbn7PnbvyM99999999999999999999999999999999999999999999qRP3bW94fGgrj/cXVlw99xZlbPnbnzfnTH2999999999999999999999999999999999999999999999u3bnT29sp99wXl99pbI951bnzfnbPzbnTY9999999999999999999999999999999999999999999999+vzP3e9Ye99Hre9qVn09pnbvzbn7Ljbvnk9999999999999999999999999999999999999999999999+PzLve9orz4/XmxirbI9pnbPnbnzPnTTLt9999999999999999999999999999999999999999999999qLnTb29Qf3nnr7ZXXnk9pnTf3bP3brvvv89999999999999999999999999999999999999999999999ubvn3e9ErrbfXb9Prp899PzbnbLjnXXXXF9999999999999999999999999999999999999999999999+zbLr29UXXnjr298XVA99vjbn3XffffXX+99999999999999999999999999999999999999999999996n3bbe9Er7bfVZ98lpo99PnTbLrrrrrv199999999999999999999999999999999999999999999999qrvnj+9QXXnhpLK7ZVU99brnvvvvrvre999999999999999999999999999999999999999999999999ubbbXW9Er7bdVnnllpU9pnXXXXX19999999999999999999999999999999999999999999999999999+n3nn29UXHlhrbZZZBU9pbbfbXE99999999999999999999999999999999999999999999999999999qrrbfW9Er7ZfX3VFhBU95rrrrrX99999999999999999999999999999999999999999999999999999qXHnr+9QXFljrppZBBU99nnnX3399999999999999999999999999999999999999999999999999999urbffW9Er5bXXVVhBBU95VXTLp399999999999999999999999999999999999999999999999999999+XXnj+9cVFnvlhpBBBU9p7vtlV/99999999999999999999999999999999999999999999999999999+r7bfW9Ap7bZZdBBBBU9pXTZose99999999999999999999999999999999999999999999999999999+Xnnr+9cXHnllpBBBBU99Jpk0UW99999999999999999999999999999999999999999999999999999q77bfW9gr7Z5ZBBBBBU99UcYosd99999999999999999999999999999999999999999999999999999qXHnr+9cXXVFhBBBBBU99os00b999999999999999999999999999999999999999999999999999999qr7bX29orpp5BBBBBBU9pUQIt+999999999999999999999999999999999999999999999999999999+Xnnre98bdVBBBBBBBU9ps1bE9999999999999999999999999999999999999999999999999999999+r7bV29slhpBBBBBBBT9tXUO99999999999999999999999999999999999999999999999999999999+Xnnpe94ZdBBBBBBBF999999999999999999999999999999999999999999999999999999999999996rbZX+9slhBBBBBBd999999999999999999999999999999999999999999999999999999999999999qXllre94ZBBBBBBBd999999999999999999999999999999999999999999999999999999999999999qrZbX+9shBBBBBBF1999999999999999999999999999999999999999999999999999999999999999uVljrW94BBBBBBBE9999999999999999999999999999999999999999999999999999999999999999+pbbZ29oBBBBBBBs9999999999999999999999999999999999999999999999999999999999999999+Vnnle9oBBBBBCN99999999999999999999999999999999999999999999999999999999999999999qrbZZ299+++u99999999999999999999999999999999999999999999999999999999999999999999qXnVle99999999999999999999999999999999999999999999999999999999999999999999999999qrppZ+99999999999999999999999999999999999999999999999999999999999999999999999999uXVVh+99999999999999999999999999999999999999999999999999999999999999999999999999+lppB+999999999999999999999999999999999999999999999999999999999999999999999999996ZVBB+999999999999999999999999999999999999999999999999999999999999999999999999996lpBB+99999999999999999999999999999999999999999999999999999999999999999999999999qZBBB+99999999999999999999999999999999999999999999999999999999999999999999999999qhBBB+99999999999999999999999999999999999999999999999999999999999999999999999999+BBBOe99999999999999999999999999999999999999999999999999999999999999999999999999t99O9999999999999999999999999999999999999999999999999999/9oADAMBAAIAAwAAABD77777777777777777777777777777777777777777777P7r77777777777777777777777777777777777777777777777777777777777777777777777rHi922z7r16w/7/AO++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++4jiCCCCCQ+qCCCCCxm1+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++9ohCCCCCCCU+qCCCCCCCSU2++++++++++++++++++++++++++++++++++++++++++++++++++++++++5+NNNNNNNNNJ+6NNNNNNNNNdY+++++++++++++++++++++++++++++++++++++++++++++++++++++++vy9999999998++9999999996W++++++++++++++++++++++++++++++++++++++++++++++++++++/8++tRxxxxxxxxl+qxxxxxxxx1f++69++++++++++++++++++++++++++++++++++++++++++++++++8/R1++u/wDPPPPPPK/v/PPPPPPODfvvgAevvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuz5vut/vrSAQQQQQR/vwQQQQQQVPvvr2rlXvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuJugh0fvvqQQQQQQUfrgQQQQQUHvvt122qovfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvphumh5ebNvvqPffffbfrvffffbX/AL6l0WdcuIT77777777777777777777777777777777777777777787poeXkF3P775T333336733333376eImUXXEvPz77777777777777777777777777777777777777777bpoeXkF2Fzv775nHHGH77HHHb7773eh1Em2XFun7777777777777777777777777777777777777777r7of3kEWESBjH771X/8A9+q//wDPfvrt+dGJJVUSfSdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvu+h5eWRYRIGRQXvvvv/wCn67/s777800002iyGmVVl/wC++++++++++++++++++++++++++++++++++++++yHl5hFhEgZBFBIR++90p++/d++9pTRxVx1xAwxN5h+++++++++++++++++++++++++++++++++++++++Nl5BF5EkZBFhbF22++qj++5++7+55bdNdddtc8YZp8+++++++++++++++++++++++++++++++++++++7F5BFhFl5BBhbdlnn2++M+9e++VzrBJJrpxhxxRgQYe+++++++++++++++++++++++++++++++++++++u5ZFhFg5BBBbFlnn/J9+++++62//ALy//ddd5bbbfTfP/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuiXbXaHRRaV4ZZ9/wD/APu9++++X/8A/wD/AP7zDNNPZJZh5xv+++++++++++++++++++++++++++++++++++++u++++++++++++uOOOOO+++++OOOOOOOO++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++551xx9x99x99x5xx5811x5111x5191x++6xz+/11512++++++++++++++++++++++++++++++++++++++nOKyKa/Jhh3dRJlZwxNNxxNZxnPxxzc+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++qPKSmSnLTtTJJhFJ0kgBZ5lNamPO5z70+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++uySeayPVlRrlt1RwIJQFkZhtc++vlHzU+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++6yuK2rRLJ/1VVJ1sNRxNNRxNJ15jPP7U+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++uqK2Lz1JtRRZh1MABw1JNxxNbg+NPP3U+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++6WWOTtG0KZh91MQRNJhlZZ1PbxpDnP8A1Pr+3fvawfKFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqsjk701fmedUTUMu+WUaRMZT3Pr+z3/ANT6qNX72sHyhT77777777777777777777777777777777777774pI8nWl35xk3HC36rGV/3ndh7774j/wDU+q3J+9rB8oU+++++++++++++++++++++++++++++++++++++qSnJbpxW+5tRktj+uZ2+9zn8+Pf+9/8A1PvCd/vawfKFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvt29TVeavr2tDCZ/vmYvuc9Vvr+Pvf/ANT6wmX72sHyhT7777777777777777777777777777777777777pPE8k/UVX7YwlHH6pHL7nOX76MD73/wDU+qPR+9rB8oU+++++++++++++++++++++++++++++++++++++uzPRtVRB/wDqIKaQfvsZvqcZfvqrPvf/ANT6hVP72sHyjT7777777777777777777777777777777777777qmG08mmmT71I0nX7pmL6nGHT5pL73/wDU+oRT+9rB8oe+++++++++++++++++++++++++++++++++++++uTRZtt49ce+vMc9+qxy+73XN+9j++xxV+4RH+9rB85e+++++++++++++++++++++++++++++++++++++61J1FQe+++++++++u5m++++++++++++++4Zt+9rB9+++++++++++++++++++++++++++++++++++++++qJ3RdU+9z/z/APvt+988vu9999999899998Ya/uIRnfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuteaadPrjCcZTScZTe5vuaXV06cVRYadESfLPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvri4ZVXPqxUObRWsrT88vqY1xwadVQYUFSQHvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuhdVWfPq9Pv0zZvvD8dvrZ0RaWVUaaUBGefvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqneaZfPm2PvsTdvrj8ZvvVUSaUQYbUUSMNfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqaZWVPrzu89TWNRCcYvuRUadVQaSdCGIQPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrhVScNPkxZcYTWczTdYPqRSWRUaZUDWOea/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukScbNPkzTcVTTTaTTzPvaaVFUbBMCSSSRvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvroVbDPPlzTcZTdvuDTyPvScWQJDFdddffvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukbUEdPi7WcdT8vtw73PradCMJRRRQQQbPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrjSIJfPkzTcZz6sEEzyPqUDEOeeeefsrvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukcMTfPkzWcdz8cc876PvdSSSTTjHvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrtJIAVPnzXc5zec+836Puccdcfd/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjCcRXPq7WcxTZR09/6PuXXQQTX/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvujUcTXPuzX85STz+/8A+j7nHHEGVf77777777777777777777777777777777777777777777777777777qnnUXz7s1vE008/f/APo+tPNplPX+++++++++++++++++++++++++++++++++++++++++++++++++++++qNJhlc+3PbxpjnP/AP8A+j71Unvc9/7777777777777777777777777777777777777777777777777777641lGVz689nFNOd/8A/wD6PqTScwivvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvjccbXPtzWcc87/AP8A/wD6Pvb38qjvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvquWcRXPjzWe283/AP8A/wD6PuRlshmlPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjXYbXPtzTR39//AP8A/wD6PqRiorsXfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvjWcTdPhzTz2/8A/wD/AP8A+j706q7uz777777777777777777777777777777777777777777777777777776o3HG3T5cFc9f/AP8A/wD/APo+tavB/wDvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjWcT9Pg45z/wD/AP8A/wD/APp+r23O+++++++++++++++++++++++++++++++++++++++++++++++++++++++++N5xv0+Tz3f/AP8A/wD/AO3fvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvujeczfPl85//wD/AP8A/wDz77777777777777777777777777777777777777777777777777777777777777643PM3T5vP/wD/AP8A/wD/AFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvje8TfPv9//AP8A/wD/APt3777777777777777777777777777777777777777777777777777777777777777o/OU3z7v/AP8A/wD/AP8A6vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqj+cU9Pv/8A/wD/AP8A/s/77777777777777777777777777777777777777777777777777777777777777774/GGPT7//AP8A/wD/AHE+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++qNxzz0+tOOOO9+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++qN1Hz0+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++NPP7c++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++6NPP38++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++uDvL/wDPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukz3/8Az77777777777777777777777777777777777777777777777777777777777777777777777777rO/8A/wDPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrs3/wD/AM+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++3//AP8Az77777777777777777777777777777777777777777777777777777777777777777777777776r/wD/AMPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrfrnvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv/EACoRAAEDAwMFAAIDAQEBAAAAAAECAxAAETITIDESITBBUCJgQEJRUmFw/9oACAECAQE/APncfpJcSKL/APlF5RorUfdXpjkw7jHWoe6DqhQf/wBoOpNc/oBUE80p/wD5pS1HncxyYdx3AkcUl4jmkuJV9wqCeaW9/wA0TfwMcmHcfCh1SaSsK4+y4vpFFRPPiY5MO4+NpwnsfsEXpaOk+Jjkw7j4gCo2FIR0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');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          opacity: 0.055;
          pointer-events: none;
          z-index: 0;
        }
        @page { size: A4 portrait; margin: 8mm; }
        html.force-desktop-layout .hdr-grid { grid-template-columns: 1fr auto 1fr !important; }
        html.force-desktop-layout .info-grid { grid-template-columns: 1fr 1fr !important; }
        html.force-desktop-layout .sig-grid { grid-template-columns: 1fr 1fr !important; }
        html.force-desktop-layout .pay-grid { grid-template-columns: 1fr 1fr !important; }
        @media screen and (max-width: 700px) {
          #contract-doc {
            max-width: 100% !important;
            width: 100% !important;
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
          }
          .hdr-grid {
            grid-template-columns: 1fr 1fr !important;
            padding: 10px 12px !important;
          }
          .hdr-center {
            grid-column: 1 / -1 !important;
            grid-row: 1 !important;
            text-align: center !important;
          }
          .hdr-ar {
            grid-column: 1 !important;
            grid-row: 2 !important;
            text-align: right !important;
            font-size: 9px !important;
          }
          .hdr-en {
            grid-column: 2 !important;
            grid-row: 2 !important;
            text-align: left !important;
            font-size: 9px !important;
          }
          .info-grid { grid-template-columns: 1fr !important; }
          .sig-grid { grid-template-columns: 1fr !important; }
          .pay-grid { grid-template-columns: 1fr !important; }
          .page-body { padding: 8px 4px 16px !important; }
          .section-inner { padding: 8px 12px !important; }
          .meta-bar { padding: 6px 12px !important; gap: 6px !important; flex-direction: column !important; align-items: flex-start !important; }
          .fin-row { padding: 5px 12px !important; font-size: 12px !important; }
          .fin-band { padding: 8px 12px !important; }
          .sigs-wrap { padding: 8px 12px !important; }
          .pay-grid-wrap { padding: 5px 12px !important; }
          .footer-bar { padding: 5px 12px !important; font-size: 9px !important; flex-wrap: wrap !important; gap: 4px !important; }
          .cancel-bar { padding: 6px 12px !important; font-size: 10.5px !important; flex-wrap: wrap !important; }
        }
      `}</style>

      <div className="page-body" style={S.body}>
        {/* Print controls */}
        <div className="no-print" style={S.printBar}>
          <button
            style={{ ...S.printBtn, minHeight: 44, touchAction: "manipulation" }}
            onClick={() => {
              const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
              if (isIOS) {
                setShowIosHint(true);
              } else {
                // Recalculate fresh on every click for accuracy (no user-gesture restriction on non-iOS)
                const zoom = calcPrintZoom();
                cachedZoom.current = zoom;
                document.documentElement.style.setProperty("--contract-zoom", `${zoom}%`);
                window.print();
              }
            }}
          >
            طباعة / تنزيل PDF
          </button>
          <button
            disabled={sharing}
            style={{
              background: sharing ? "#94A3B8" : "#16a34a",
              color: "white", border: "none", borderRadius: 8,
              padding: "8px 20px", fontSize: 14, fontWeight: 700,
              cursor: sharing ? "not-allowed" : "pointer",
              fontFamily: "inherit", minHeight: 44, touchAction: "manipulation",
              display: "flex", alignItems: "center", gap: 8,
              opacity: sharing ? 0.7 : 1,
            }}
            onClick={shareContractAsPDF}
          >
            {sharing ? "جارٍ التوليد..." : "📤 مشاركة PDF"}
          </button>
          {showIosHint && (
            <div className="no-print" style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "rgba(0,0,0,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, direction: "rtl",
            }}>
              <div style={{
                background: "white", borderRadius: 20, padding: "28px 24px",
                maxWidth: 360, width: "100%", textAlign: "center",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <p style={{ fontWeight: 800, fontSize: 17, marginBottom: 10, color: "#1C2D50" }}>
                  تنزيل العقد كـ PDF
                </p>
                <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.8, marginBottom: 20 }}>
                  سيفتح مربع الطباعة. بعد ظهوره:<br />
                  اضغط على <strong style={{ color: "#1C2D50" }}>PDF</strong> أو{" "}
                  <strong style={{ color: "#1C2D50" }}>حفظ كـ PDF</strong>
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowIosHint(false)}
                    style={{
                      flex: 1, background: "#F1F5F9", color: "#64748B", border: "none",
                      borderRadius: 12, padding: "13px 0", fontSize: 14,
                      fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      minHeight: 48, touchAction: "manipulation",
                    }}
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={() => {
                      // window.print() MUST be called first — any React state update
                      // before it (even setShowIosHint) causes iOS Safari to block it
                      document.documentElement.style.setProperty("--contract-zoom", `${cachedZoom.current}%`);
                      applyIosBodyFix();
                      window.print();
                      setShowIosHint(false);
                    }}
                    style={{
                      flex: 2, background: "#1C2D50", color: "white", border: "none",
                      borderRadius: 12, padding: "13px 0", fontSize: 14,
                      fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      minHeight: 48, touchAction: "manipulation",
                    }}
                  >
                    فتح نافذة التنزيل
                  </button>
                </div>
              </div>
            </div>
          )}
          <span style={{ fontSize: 12, color: "#64748B" }}>
            اتفاقية #{concert.concertNumber} — {concert.name}
          </span>
          <a
            href={`/admin/concerts/${id}`}
            style={{ fontSize: 12, color: "#1C2D50", fontWeight: 600, marginRight: "auto" }}
          >
            ← العودة للحفلة
          </a>
        </div>

        {/* Document */}
        <div id="contract-doc" className="contract-doc" style={S.doc}>

          {/* Header */}
          <div className="hdr-grid" style={S.header}>
            {/* Arabic */}
            <div className="hdr-ar" style={S.hdrAr}>
              لصاحبه / عبد العزيز عبد اللطيف الدوغان<br />
              س.ت : 2251052844<br />
              هاتف : 0135755776 — 0135755000<br />
              ص.ب : 3145 | الرمز البريدي : 31982<br />
              رقم التسجيل الضريبي : 310290987900003<br />
              الاحساء — الهفوف — المحمدية<br />
              المملكة العربية السعودية
            </div>

            {/* Center: Logo + Name */}
            <div className="hdr-center" style={S.hdrCenter}>
              <div style={S.logoCircle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="data:image/jpeg;base64,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fefefffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffefrv3L3faT73qOffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdPHzDDDDGffTDDDDP8Avb33333333333333333333333333333333333333333333333333333333333kU8wwwwwwwn2kwwwwwwxwrb333333333333333333333333333333333333333333333333333333325MMMMMMMMMNT30MMMMMMMMNNL33333333333333333333333333333333333333333333333333333333D//AP8A/wD/AP8A/wD32n//AP8A/wD/AP8A/wDv73333333333333333333333333333333333333333333333333333vz330gMMMMMMMMD2kMMMMMMMMdT3337333333333333333333333333333333333333333333333333iKTX32rLPPPPPPPT3zPPPPPPPe3330VfH33333333333333333333333333333333333333333333332gTxj332r/wD/AP8A/wD/APPbP/8A/wD/AP8A/wC99944UT29999999999999999999999999999999999999999999995E885P1999//AP8A/wD/AOPff/8A/wD/AP7Xffc3ReFN/ffffffffffffffffffffffffffffffffffffffffffffRPPOWx9dffev/8A/wD/AKPef/8A/wD/AO3ffZZ43QaXJffffffffffffffffffffffffffffffffffffffffffeT/POWx//APD333H/AP8A/wCj3n//AP8A6HffdMx34356TdvffffffffffffffffffffffffffffffffffffffffZvPOWx/8A+N9v321vPPPT3nPPPf73375fs/uN+fnP3333333333333333333333333333333333333333n/zkMf8A/jH7Pd999EBBU9tBBHe99qWXXHjfzP7jr+999999999999999999999999999999999999999o85bHn/AIx+35y1fffigQPaQRTfff8Ahtttv+tud/Mfj3333333333333333333333333333333333333313lsd/wDjH7fjbHze99KDA9pB/wDffWKa66666625/wDdz333333333333333333333333333333333333331Bsf/AP7H7fjbHhbXe99NI9pQ9950XX13n333H3XH7n0999999999999999999999999999999999999997H/AP4x+342x4Wx+UvvfTPfffea1VV333X111111x+/fffffffffffffffffffffffffffffffffffffbh5/wCMft+NseFsfkEFTX333332MEHF2muuunvvvutut/33333333333333333333333333333333333323f+9/Nuds+XsflEEEFD33331gEEEEGGmmeeWOOOuOvD333333333333333333333333333333333333200000000000013333313333333333330000000000133333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333XHnnXXnnnXXXXXX3n3HnXH3HnXHXHnb3r3j33nH33b3333333333333333333333333333333333332omiyRBBm+fNm9u/dNttdeeevtt1WeeVX3wFf30H+tZb33333333333333333333333333333333333335VBgiTVFkuVO/Mu+feeftt9cPXyNtll33wFf30H+tZb33333333333333333333333333333333333336SQRBimfds3cudtuutt/ceev333zdWX33wFf30H+tZb3333333333333333333333333333333333333pgiyTFum+Vudu+fdceeuvttcD30CmllX3wFf30H+tZb3333333333333333333333333333333333332rBBi2WdMudu/NuueNt9NeeevluddVWFX3wFf30H+tZb33333333333333333333333333333333333326CRRkuO1u/NuddttdeePvt9UWe+WGkFX3gEv30H+tZb33333333333333333333333333333333333335iiXVkX1peduuePs3ttSmeOnp0zh0EFX2zF/30H+tZb33333333333333333333333333333333333335Bim+dBb3q9dttv36fB2lt0533304EFX2yVP30H+tZb3333333333333333333333333333333333332qTVNk+fv3kuffff37sj2mWH33gz34EFX3q/f30H+tZb3333333333333333333333333333333333332pm2dds+fX1Nuut/34fT21l9X2yb34EFX3o/P30H+tZb33333333333333333333333333333333333325lum9Vvfb29dMfP2rtj22WNX0xL34EFX3gmP30H+tZb33333333333333333333333333333333333336VVsudufD3mesuv2qeD31t930Br34EFX3pvf30H+tb73333333333333333333333333333333333333o+fdG/M/b31tdeP27tz32efX0Qz34EFX3puP30H+tZX3333333333333333333333333333333333332plu/cuaZ533946336fD3lN+n31z3o89b2puf30H+tT333333333333333333333333333333333333326dNvdp33333333335sj33333333333332pNv30H+hb333333333333333333333333333333333333336+Vu/b3bfvvfrr/fSWT33fvfvfvf/AH737n7P94Psd9999999999999999999999999999999999999996bPzPe9orrbfXXnjrZc99zblZPjbn7PnbvyM99999999999999999999999999999999999999999999qRP3bW94fGgrj/cXVlw99xZlbPnbnzfnTH2999999999999999999999999999999999999999999999u3bnT29sp99wXl99pbI951bnzfnbPzbnTY9999999999999999999999999999999999999999999999+vzP3e9Ye99Hre9qVn09pnbvzbn7Ljbvnk9999999999999999999999999999999999999999999999+PzLve9orz4/XmxirbI9pnbPnbnzPnTTLt9999999999999999999999999999999999999999999999qLnTb29Qf3nnr7ZXXnk9pnTf3bP3brvvv89999999999999999999999999999999999999999999999ubvn3e9ErrbfXb9Prp899PzbnbLjnXXXXF9999999999999999999999999999999999999999999999+zbLr29UXXnjr298XVA99vjbn3XffffXX+99999999999999999999999999999999999999999999996n3bbe9Er7bfVZ98lpo99PnTbLrrrrrv199999999999999999999999999999999999999999999999qrvnj+9QXXnhpLK7ZVU99brnvvvvrvre999999999999999999999999999999999999999999999999ubbbXW9Er7bdVnnllpU9pnXXXXX19999999999999999999999999999999999999999999999999999+n3nn29UXHlhrbZZZBU9pbbfbXE99999999999999999999999999999999999999999999999999999qrrbfW9Er7ZfX3VFhBU95rrrrrX99999999999999999999999999999999999999999999999999999qXHnr+9QXFljrppZBBU99nnnX3399999999999999999999999999999999999999999999999999999urbffW9Er5bXXVVhBBU95VXTLp399999999999999999999999999999999999999999999999999999+XXnj+9cVFnvlhpBBBU9p7vtlV/99999999999999999999999999999999999999999999999999999+r7bfW9Ap7bZZdBBBBU9pXTZose99999999999999999999999999999999999999999999999999999+Xnnr+9cXHnllpBBBBU99Jpk0UW99999999999999999999999999999999999999999999999999999q77bfW9gr7Z5ZBBBBBU99UcYosd99999999999999999999999999999999999999999999999999999qXHnr+9cXXVFhBBBBBU99os00b999999999999999999999999999999999999999999999999999999qr7bX29orpp5BBBBBBU9pUQIt+999999999999999999999999999999999999999999999999999999+Xnnre98bdVBBBBBBBU9ps1bE9999999999999999999999999999999999999999999999999999999+r7bV29slhpBBBBBBBT9tXUO99999999999999999999999999999999999999999999999999999999+Xnnpe94ZdBBBBBBBF999999999999999999999999999999999999999999999999999999999999996rbZX+9slhBBBBBBd999999999999999999999999999999999999999999999999999999999999999qXllre94ZBBBBBBBd999999999999999999999999999999999999999999999999999999999999999qrZbX+9shBBBBBBF1999999999999999999999999999999999999999999999999999999999999999uVljrW94BBBBBBBE9999999999999999999999999999999999999999999999999999999999999999+pbbZ29oBBBBBBBs9999999999999999999999999999999999999999999999999999999999999999+Vnnle9oBBBBBCN99999999999999999999999999999999999999999999999999999999999999999qrbZZ299+++u99999999999999999999999999999999999999999999999999999999999999999999qXnVle99999999999999999999999999999999999999999999999999999999999999999999999999qrppZ+99999999999999999999999999999999999999999999999999999999999999999999999999uXVVh+99999999999999999999999999999999999999999999999999999999999999999999999999+lppB+999999999999999999999999999999999999999999999999999999999999999999999999996ZVBB+999999999999999999999999999999999999999999999999999999999999999999999999996lpBB+99999999999999999999999999999999999999999999999999999999999999999999999999qZBBB+99999999999999999999999999999999999999999999999999999999999999999999999999qhBBB+99999999999999999999999999999999999999999999999999999999999999999999999999+BBBOe99999999999999999999999999999999999999999999999999999999999999999999999999t99O9999999999999999999999999999999999999999999999999999/9oADAMBAAIAAwAAABD77777777777777777777777777777777777777777777P7r77777777777777777777777777777777777777777777777777777777777777777777777rHi922z7r16w/7/AO++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++4jiCCCCCQ+qCCCCCxm1+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++9ohCCCCCCCU+qCCCCCCCSU2++++++++++++++++++++++++++++++++++++++++++++++++++++++++5+NNNNNNNNNJ+6NNNNNNNNNdY+++++++++++++++++++++++++++++++++++++++++++++++++++++++vy9999999998++9999999996W++++++++++++++++++++++++++++++++++++++++++++++++++++/8++tRxxxxxxxxl+qxxxxxxxx1f++69++++++++++++++++++++++++++++++++++++++++++++++++8/R1++u/wDPPPPPPK/v/PPPPPPODfvvgAevvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuz5vut/vrSAQQQQQR/vwQQQQQQVPvvr2rlXvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuJugh0fvvqQQQQQQUfrgQQQQQUHvvt122qovfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvphumh5ebNvvqPffffbfrvffffbX/AL6l0WdcuIT77777777777777777777777777777777777777777787poeXkF3P775T333336733333376eImUXXEvPz77777777777777777777777777777777777777777bpoeXkF2Fzv775nHHGH77HHHb7773eh1Em2XFun7777777777777777777777777777777777777777r7of3kEWESBjH771X/8A9+q//wDPfvrt+dGJJVUSfSdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvu+h5eWRYRIGRQXvvvv/wCn67/s777800002iyGmVVl/wC++++++++++++++++++++++++++++++++++++++yHl5hFhEgZBFBIR++90p++/d++9pTRxVx1xAwxN5h+++++++++++++++++++++++++++++++++++++++Nl5BF5EkZBFhbF22++qj++5++7+55bdNdddtc8YZp8+++++++++++++++++++++++++++++++++++++7F5BFhFl5BBhbdlnn2++M+9e++VzrBJJrpxhxxRgQYe+++++++++++++++++++++++++++++++++++++u5ZFhFg5BBBbFlnn/J9+++++62//ALy//ddd5bbbfTfP/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuiXbXaHRRaV4ZZ9/wD/APu9++++X/8A/wD/AP7zDNNPZJZh5xv+++++++++++++++++++++++++++++++++++++u++++++++++++uOOOOO+++++OOOOOOOO++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++551xx9x99x99x5xx5811x5111x5191x++6xz+/11512++++++++++++++++++++++++++++++++++++++nOKyKa/Jhh3dRJlZwxNNxxNZxnPxxzc+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++qPKSmSnLTtTJJhFJ0kgBZ5lNamPO5z70+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++uySeayPVlRrlt1RwIJQFkZhtc++vlHzU+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++6yuK2rRLJ/1VVJ1sNRxNNRxNJ15jPP7U+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++uqK2Lz1JtRRZh1MABw1JNxxNbg+NPP3U+r/p+9rB8oU+++++++++++++++++++++++++++++++++++++6WWOTtG0KZh91MQRNJhlZZ1PbxpDnP8A1Pr+3fvawfKFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqsjk701fmedUTUMu+WUaRMZT3Pr+z3/ANT6qNX72sHyhT77777777777777777777777777777777777774pI8nWl35xk3HC36rGV/3ndh7774j/wDU+q3J+9rB8oU+++++++++++++++++++++++++++++++++++++qSnJbpxW+5tRktj+uZ2+9zn8+Pf+9/8A1PvCd/vawfKFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvt29TVeavr2tDCZ/vmYvuc9Vvr+Pvf/ANT6wmX72sHyhT7777777777777777777777777777777777777pPE8k/UVX7YwlHH6pHL7nOX76MD73/wDU+qPR+9rB8oU+++++++++++++++++++++++++++++++++++++uzPRtVRB/wDqIKaQfvsZvqcZfvqrPvf/ANT6hVP72sHyjT7777777777777777777777777777777777777qmG08mmmT71I0nX7pmL6nGHT5pL73/wDU+oRT+9rB8oe+++++++++++++++++++++++++++++++++++++uTRZtt49ce+vMc9+qxy+73XN+9j++xxV+4RH+9rB85e+++++++++++++++++++++++++++++++++++++61J1FQe+++++++++u5m++++++++++++++4Zt+9rB9+++++++++++++++++++++++++++++++++++++++qJ3RdU+9z/z/APvt+988vu9999999899998Ya/uIRnfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuteaadPrjCcZTScZTe5vuaXV06cVRYadESfLPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvri4ZVXPqxUObRWsrT88vqY1xwadVQYUFSQHvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvuhdVWfPq9Pv0zZvvD8dvrZ0RaWVUaaUBGefvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqneaZfPm2PvsTdvrj8ZvvVUSaUQYbUUSMNfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqaZWVPrzu89TWNRCcYvuRUadVQaSdCGIQPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrhVScNPkxZcYTWczTdYPqRSWRUaZUDWOea/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukScbNPkzTcVTTTaTTzPvaaVFUbBMCSSSRvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvroVbDPPlzTcZTdvuDTyPvScWQJDFdddffvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukbUEdPi7WcdT8vtw73PradCMJRRRQQQbPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrjSIJfPkzTcZz6sEEzyPqUDEOeeeefsrvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukcMTfPkzWcdz8cc876PvdSSSTTjHvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrtJIAVPnzXc5zec+836Puccdcfd/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjCcRXPq7WcxTZR09/6PuXXQQTX/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvujUcTXPuzX85STz+/8A+j7nHHEGVf77777777777777777777777777777777777777777777777777777qnnUXz7s1vE008/f/APo+tPNplPX+++++++++++++++++++++++++++++++++++++++++++++++++++++qNJhlc+3PbxpjnP/AP8A+j71Unvc9/7777777777777777777777777777777777777777777777777777641lGVz689nFNOd/8A/wD6PqTScwivvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvjccbXPtzWcc87/AP8A/wD6Pvb38qjvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvquWcRXPjzWe283/AP8A/wD6PuRlshmlPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjXYbXPtzTR39//AP8A/wD6PqRiorsXfvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvjWcTdPhzTz2/8A/wD/AP8A+j706q7uz777777777777777777777777777777777777777777777777777776o3HG3T5cFc9f/AP8A/wD/APo+tavB/wDvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqjWcT9Pg45z/wD/AP8A/wD/APp+r23O+++++++++++++++++++++++++++++++++++++++++++++++++++++++++N5xv0+Tz3f/AP8A/wD/AO3fvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvujeczfPl85//wD/AP8A/wDz77777777777777777777777777777777777777777777777777777777777777643PM3T5vP/wD/AP8A/wD/AFPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvje8TfPv9//AP8A/wD/APt3777777777777777777777777777777777777777777777777777777777777777o/OU3z7v/AP8A/wD/AP8A6vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvqj+cU9Pv/8A/wD/AP8A/s/77777777777777777777777777777777777777777777777777777777777777774/GGPT7//AP8A/wD/AHE+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++qNxzz0+tOOOO9+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++qN1Hz0+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++NPP7c++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++6NPP38++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++uDvL/wDPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvukz3/8Az77777777777777777777777777777777777777777777777777777777777777777777777777rO/8A/wDPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrs3/wD/AM+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++3//AP8Az77777777777777777777777777777777777777777777777777777777777777777777777776r/wD/AMPvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvrfrnvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv/EACoRAAEDAwMFAAIDAQEBAAAAAAECAxAAETITIDESITBBUCJgQEJRUmFw/9oACAECAQE/APncfpJcSKL/APlF5RorUfdXpjkw7jHWoe6DqhQf/wBoOpNc/oBUE80p/wD5pS1HncxyYdx3AkcUl4jmkuJV9wqCeaW9/wA0TfwMcmHcfCh1SaSsK4+y4vpFFRPPiY5MO4+NpwnsfsEXpaOk+Jjkw7j4gCo2FIR0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" alt="الفريج" style={{ width: 54, height: 54, objectFit: "contain", borderRadius: "50%" }} />
              </div>
              <div style={S.restName}>مطعم الفريج لتقديم الوجبات</div>
              <div style={S.restNameEn}>Al-Freej Restaurant For Meal</div>
              <div style={S.contractTitle}>اتفاقية الحفلات والولائم</div>
            </div>

            {/* English */}
            <div className="hdr-en" style={S.hdrEn}>
              Owner / Abdulaziz Abdul Latif Al-Dowghan<br />
              Commercial Register: 2251052844<br />
              Phone: 0135755776 — 0135755000<br />
              PO Box: 3145 | Postal Code: 31982<br />
              VAT Registration No: 310290987900003<br />
              Al-Ahsa — Al-Hofuf — Al-Muhammadiya<br />
              Kingdom of Saudi Arabia
            </div>
          </div>

          {/* Cancellation notice */}
          {isCancelled && (
            <div className="cancel-bar" style={S.cancelBar}>
              <span style={{ fontWeight: 700 }}>⚠ اتفاقية ملغاة</span>
              {formattedCancelledDate && <span>— تاريخ الإلغاء: {formattedCancelledDate}</span>}
              {concert.cancellationReason && <span>| السبب: {concert.cancellationReason}</span>}
              {concert.refundAmount && concert.refundAmount > 0 && (
                <span>
                  | المبلغ المسترد: {fmtNum(concert.refundAmount)} ريال
                  {concert.refundDate && ` بتاريخ ${concert.refundDate}`}
                </span>
              )}
            </div>
          )}

          {/* Meta bar */}
          <div className="meta-bar" style={S.meta}>
            <div style={S.metaLeft}>
              <div style={S.metaItem}>
                <span style={S.metaLbl}>تاريخ الاتفاقية:</span>
                <span style={S.metaVal}>{formattedCreatedDate}</span>
              </div>
              {formattedLastUpdate && (
                <div style={S.metaItem}>
                  <span style={S.metaLbl}>آخر تحديث:</span>
                  <span style={{ ...S.metaVal, color: "#B45309" }}>{formattedLastUpdate}</span>
                  <span style={{ ...S.updatedBadge, marginRight: 5 }}>معدّلة</span>
                </div>
              )}
            </div>
            <span style={S.statusBadge(isCancelled ? "cancelled" : isConfirmed ? "confirmed" : "unconfirmed")}>
              {isCancelled ? "ملغاة" : isConfirmed ? "مؤكدة" : "غير مؤكدة"}
            </span>
          </div>

          {/* Client + Concert */}
          <div className="section-inner" style={S.section}>
            <div style={S.secHd}>
              <span style={S.secAccent} />
              بيانات العميل وتفاصيل الحفلة
              <span style={S.secLine} />
            </div>
            <div className="info-grid" style={S.infoGrid}>
              {/* Right: client */}
              <div style={S.infoCol}>
                <div style={S.fld}>
                  <span style={S.fl}>اسم العميل</span>
                  <span style={S.fv}>{concert.clientName || "—"}</span>
                </div>
                <div style={S.fld}>
                  <span style={S.fl}>الجوال ١</span>
                  <span style={{ ...S.fv, direction: "ltr", display: "inline-block" }}>{concert.clientPhone || "—"}</span>
                </div>
                {concert.clientPhone2 && (
                  <div style={S.fld}>
                    <span style={S.fl}>الجوال ٢</span>
                    <span style={{ ...S.fv, direction: "ltr", display: "inline-block" }}>{concert.clientPhone2}</span>
                  </div>
                )}
              </div>
              {/* Left: serial, date, venue */}
              <div style={S.infoCol}>
                <div style={S.fld}>
                  <span style={S.fl}>الرقم التسلسلي</span>
                  <span style={S.fvSerial}># {String(concert.concertNumber ?? "—").padStart(4, "0")}</span>
                </div>
                <div style={S.fld}>
                  <span style={S.fl}>تاريخ الحفلة</span>
                  <span style={S.fv}>
                    {prevDateFmt && <span style={S.oldVal}>{prevDateFmt}</span>}
                    {formattedConcertDate} — {dayName}
                  </span>
                </div>
                <div style={S.fld}>
                  <span style={S.fl}>اسم المكان</span>
                  <span style={S.fv}>
                    {prevVenueName && <span style={S.oldVal}>{prevVenueName}</span>}
                    {concert.venueName || "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Food */}
          {(foodGroups.length > 0 || deletedFoods.length > 0) && (
            <div className="section-inner" style={S.section}>
              <div style={S.secHd}>
                <span style={S.secAccent} />
                الأقسام والأصناف والكميات
                <span style={S.secLine} />
              </div>
              <div style={S.tblWrap}>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: "22%" }}>القسم</th>
                      <th style={{ ...S.th, width: "56%" }}>الأصناف</th>
                      <th style={{ ...S.th, width: "22%", textAlign: "center" }}>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodGroups.map((g, i) => {
                      // Compute old total for this group to detect qty changes
                      let oldTotal = g.totalQty;
                      for (const opt of g.items) {
                        const qc = foodQtyChanges.get(`${g.categoryName}:::${opt}`);
                        if (qc) oldTotal = oldTotal - qc.newQty + qc.oldQty;
                      }
                      const totalDecreased = oldTotal > g.totalQty;
                      const totalIncreased = oldTotal < g.totalQty;
                      return (
                        <tr key={g.categoryName} style={{ background: i % 2 === 1 ? "#F8FAFC" : "white" }}>
                          <td style={S.tdCat}>{g.categoryName}</td>
                          <td style={S.tdItems}>
                            {g.items.map((opt, j) => {
                              const key = `${g.categoryName}:::${opt}`;
                              const isNew = addedFoodKeys.has(key);
                              const qc = foodQtyChanges.get(key);
                              const qtyIncreased = qc && qc.newQty > qc.oldQty;
                              const isBold = isNew || qtyIncreased;
                              return (
                                <span key={j}>
                                  {j > 0 && "، "}
                                  <span style={isBold ? { fontWeight: 800, color: "#0F172A" } : undefined}>{opt}</span>
                                </span>
                              );
                            })}
                          </td>
                          <td style={{
                            ...S.tdTotal,
                            ...(totalIncreased ? { color: "#065F46", fontWeight: 900 } : {}),
                          }}>
                            {totalDecreased && (
                              <span style={{ textDecoration: "line-through", color: "#94A3B8", fontSize: 11, marginLeft: 6 }}>{oldTotal}</span>
                            )}
                            {g.totalQty > 0 ? g.totalQty : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {deletedFoods.map((d, i) => (
                      <tr key={`del-${i}`}>
                        <td style={{ ...S.tdDel, width: "22%" }}>{d.categoryName}</td>
                        <td style={S.tdDel}>{d.option}</td>
                        <td style={{ ...S.tdDel, textAlign: "center", width: "22%" }}>{d.qty > 0 ? d.qty : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {concert.notes && (
            <div className="section-inner" style={S.section}>
              <div style={S.secHd}>
                <span style={S.secAccent} />
                ملاحظات
                <span style={S.secLine} />
              </div>
              <div style={S.notesBox}>{concert.notes}</div>
            </div>
          )}

          {/* Financials */}
          <div>
            <div className="fin-row" style={S.finRow}>
              <span style={S.finLbl}>المبلغ قبل الضريبة</span>
              <span style={S.finVal}>
                {prevPriceBeforeVat !== null && <span style={S.oldVal}>{fmtNum(prevPriceBeforeVat)}</span>}
                {fmtNum(priceBeforeVat)}<span style={S.unit}>ريال</span>
              </span>
            </div>
            <div className="fin-row" style={S.finRow}>
              <span style={S.finLbl}>ضريبة القيمة المضافة (15%)</span>
              <span style={S.finVal}>
                {prevVat !== null && <span style={S.oldVal}>{fmtNum(prevVat)}</span>}
                {fmtNum(vat)}<span style={S.unit}>ريال</span>
              </span>
            </div>
          </div>

          <div className="fin-band" style={S.finBand}>
            <span style={S.finBandLbl}>إجمالي المبلغ شامل الضريبة</span>
            <span style={S.finBandVal}>
              {prevPrice !== null && (
                <span style={{ textDecoration: "line-through", color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 8 }}>
                  {fmtNum(prevPrice)}
                </span>
              )}
              {fmtNum(price)}<span style={{ ...S.unit, color: "rgba(255,255,255,0.5)" }}>ريال</span>
            </span>
          </div>

          {payments.length > 0 && (
            <div className="pay-grid-wrap">
              <div className="pay-grid" style={S.payGrid}>
                {payments.map((p, i) => (
                  <div key={p.id} style={S.payCell}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={S.finLbl}>الدفعة {PAYMENT_ORDINALS[i] ?? i + 1}</span>
                      <span style={S.finPaidVal}>{fmtNum(p.amount)}<span style={S.unit}>ريال</span></span>
                    </div>
                    <div style={S.payMeta}>
                      <span style={S.payMethod}>{METHOD_LABELS[p.method]}</span>
                      {p.date && <span style={S.payDate}>{p.date}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {isCancelled && concert.refundAmount && concert.refundAmount > 0 && (
                <div className="fin-row" style={S.finRow}>
                  <span style={S.finLbl}>
                    استرداد للعميل
                    <div style={S.payMeta}>
                      {concert.refundMethod && <span style={S.refundMethod}>{METHOD_LABELS[concert.refundMethod]}</span>}
                      {concert.refundDate && <span style={S.payDate}>{concert.refundDate}</span>}
                    </div>
                  </span>
                  <span style={S.refundVal}>— {fmtNum(concert.refundAmount)}<span style={S.unit}>ريال</span></span>
                </div>
              )}

              <div className="fin-row" style={{ ...S.finRow, borderBottom: "none" }}>
                <span style={S.finLbl}>المبلغ المتبقي</span>
                <span style={remaining > 0 ? S.finRemainingVal : S.finPaidVal}>{fmtNum(remaining)}<span style={S.unit}>ريال</span></span>
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="sig-grid sigs-wrap" style={S.sigs}>
            <div style={S.sigBox}>
              <div style={S.sigTitle}>توقيع العميل</div>
              <div style={S.sigLine}>الاسم والتوقيع</div>
            </div>
            <div style={S.sigBox}>
              <div style={S.sigTitle}>توقيع المطعم</div>
              <div style={S.sigLine}>التوقيع</div>
            </div>
          </div>

          {/* Footer */}
          <div className="footer-bar" style={S.footer}>
            <span>مطعم الفريج — الأحساء، الهفوف</span>
            <span style={{ color: "#64748B", fontWeight: 600 }}>للاستفسار التواصل على الرقم الخاص بالحفلات: 0501764441</span>
            <span>رقم التسجيل الضريبي: 310290987900003</span>
          </div>

        </div>
      </div>
    </>
  );
}
