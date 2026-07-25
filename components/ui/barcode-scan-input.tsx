"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Camera } from "lucide-react";
import { CameraScanModal } from "@/components/ui/camera-scan-modal";

/* ═══════════════════════════════════════════════════════════════
   حقل مسح الباركود — قارئ USB/بلوتوث يعمل كلوحة مفاتيح: يكتب رقم
   الباركود في الحقل المُركَّز عليه ثم يرسل Enter تلقائياً. هذا
   الحقل يبقى مُركَّزاً دائماً، يلتقط الرقم عند Enter، يستدعي onScan،
   ثم يُفرَّغ ويُعاد تركيزه فوراً لمسح متتالٍ سريع دون لمس الفأرة.
   ═══════════════════════════════════════════════════════════════ */

export function BarcodeScanInput({
  onScan,
  placeholder = "امسح الباركود هنا…",
  disabled = false,
}: {
  onScan: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && !showCamera) ref.current?.focus();
  }, [disabled, showCamera]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const scanned = value.trim();
    if (!scanned) return;
    onScan(scanned);
    setValue("");
  }

  const handleCameraScan = useCallback(
    (scanned: string) => {
      setShowCamera(false);
      onScan(scanned);
    },
    [onScan]
  );

  return (
    <>
      <div
        className="flex items-center gap-2.5 rounded-2xl px-4 py-3.5"
        style={{ background: "#0C1526", border: "1px solid #1C2D50" }}
      >
        <Barcode size={20} className="shrink-0" style={{ color: "#B0BDC9" }} />
        <input
          ref={ref}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-[#4A607C]"
          style={{ fontFamily: "Consolas, monospace", letterSpacing: value ? "0.5px" : 0 }}
          autoComplete="off"
        />
        <span className="text-[10.5px] whitespace-nowrap shrink-0 hidden sm:inline" style={{ color: "#6B7E99" }}>
          ⌨ يعمل تلقائياً
        </span>
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={disabled}
          title="مسح بالكاميرا"
          className="shrink-0 p-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ color: "#B0BDC9", background: "rgba(176,189,201,0.12)" }}
        >
          <Camera size={15} />
        </button>
      </div>
      <CameraScanModal open={showCamera} onClose={() => setShowCamera(false)} onScan={handleCameraScan} />
    </>
  );
}
