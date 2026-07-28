"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { generateElementPDF, downloadPdf } from "@/lib/pdf";
import { Download } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   ملصق باركود قابل للطباعة — لأصناف التكاليف بلا باركود من المصنّع
   (اللحوم ونحوها). يُطبع الملصق وُيلصق فعلياً على المنتج ليُقرأ لاحقاً
   بنفس قارئ الباركود. التنزيل مباشر (PDF) على كل الأجهزة، بلا مشاركة.
   ═══════════════════════════════════════════════════════════════ */

export function BarcodeLabelModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: { id: string; name: string } | null;
}) {
  // SVG وليس canvas: تنزيل الملصق يستنسخ عقدة DOM (cloneNode) قبل الالتقاط،
  // واستنساخ <canvas> ينتج لوحة فارغة (الرسم لا يُنسخ)، بينما محتوى <svg> عقد
  // DOM حقيقية تُستنسخ بشكل صحيح — فيظهر الباركود في الـPDF المُنزَّل.
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    (async () => {
      const { default: JsBarcode } = await import("jsbarcode");
      if (cancelled || !svgRef.current) return;
      JsBarcode(svgRef.current, item.id, {
        format: "CODE128",
        width: 2,
        height: 55,
        fontSize: 14,
        margin: 6,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item]);

  async function handleDownload() {
    if (!labelRef.current || !item) return;
    setDownloading(true);
    try {
      const blob = await generateElementPDF(labelRef.current);
      downloadPdf(blob, `باركود-${item.name}.pdf`);
    } catch (err) {
      alert("خطأ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloading(false);
    }
  }

  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title="ملصق الباركود" size="sm">
      <div className="flex flex-col items-center gap-4">
        <div
          ref={labelRef}
          style={{ width: 300 }}
          className="bg-white border-2 border-slate-200 rounded-xl px-4 py-4 flex flex-col items-center text-center"
        >
          <p className="text-[11px] font-bold text-[#1C2D50] mb-1">الفريج — إدارة الفعاليات</p>
          <p className="font-bold text-slate-800 text-sm mb-2 leading-tight">{item.name}</p>
          <svg ref={svgRef} />
        </div>
        <Button onClick={handleDownload} loading={downloading} className="w-full justify-center">
          <Download size={15} />
          تنزيل الملصق (PDF)
        </Button>
      </div>
    </Modal>
  );
}
