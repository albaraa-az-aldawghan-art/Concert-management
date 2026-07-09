"use client";

import { useEffect, useState } from "react";
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

// Uses a CSS custom property so the zoom value is available inside @media print
// regardless of JS timing. CSS defaults to 88% when the property is not yet set.
function applyPrintZoom() {
  const doc = document.getElementById("contract-doc");
  if (!doc) return;

  // Reset to 100% so scrollHeight measures the unscaled height
  document.documentElement.style.setProperty("--contract-zoom", "100%");

  // Temporarily disable mobile CSS so measurement reflects the print (desktop) layout
  document.documentElement.classList.add("force-desktop-layout");

  // Force layout to print width (text reflows as in print mode)
  const savedMW = doc.style.maxWidth;
  const savedW = doc.style.width;
  doc.style.maxWidth = PRINT_W + "px";
  doc.style.width = PRINT_W + "px";
  void doc.offsetHeight;

  const h = doc.scrollHeight;

  doc.style.maxWidth = savedMW;
  doc.style.width = savedW;
  document.documentElement.classList.remove("force-desktop-layout");
  void doc.offsetHeight;

  const zoom = h > PRINT_H ? Math.floor((PRINT_H / h) * 100) : 100;
  document.documentElement.style.setProperty("--contract-zoom", `${zoom}%`);
}

function resetPrintZoom() {
  document.documentElement.style.removeProperty("--contract-zoom");
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

  useEffect(() => {
    // beforeprint covers Ctrl+P / browser-menu print
    window.addEventListener("beforeprint", applyPrintZoom);
    window.addEventListener("afterprint", resetPrintZoom);
    return () => {
      window.removeEventListener("beforeprint", applyPrintZoom);
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
          html, body { background: white !important; padding: 0 !important; margin: 0 !important; height: auto !important; }
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
        }
        #contract-doc::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 340px;
          height: 340px;
          background-image: url('/watermark-logo.jpeg');
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
            style={S.printBtn}
            onClick={() => {
              // Apply zoom BEFORE the dialog opens so the preview is correct
              applyPrintZoom();
              // Two animation frames ensure the DOM reflects the new zoom
              requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
            }}
          >
            طباعة / تنزيل PDF
          </button>
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
                <img src="/logo.jpg" alt="الفريج" style={{ width: 54, height: 54, objectFit: "contain", borderRadius: "50%" }} />
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
