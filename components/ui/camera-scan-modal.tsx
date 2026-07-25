"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Modal } from "@/components/ui/modal";
import { Camera, AlertTriangle } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   مسح الباركود عبر كاميرا الجوال — بديل عن قارئ USB/بلوتوث الفيزيائي
   عندما لا يكون متوفراً بالقرب من المستخدم. يفتح الكاميرا الخلفية،
   يقرأ الإطارات حتى يجد باركوداً، ثم يستدعي onScan ويُغلق تلقائياً.
   ═══════════════════════════════════════════════════════════════ */

export function CameraScanModal({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              controlsRef.current?.stop();
              onScan(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch {
        if (!cancelled) setError("تعذّر فتح الكاميرا — تأكد من السماح بالوصول إليها من إعدادات المتصفح");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onScan]);

  return (
    <Modal open={open} onClose={onClose} title="مسح الباركود بالكاميرا" size="sm">
      <div className="flex flex-col items-center gap-3">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle size={28} className="text-amber-500" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : (
          <>
            <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-6 border-2 border-white/70 rounded-xl pointer-events-none" />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Camera size={13} /> وجّه الكاميرا نحو الباركود
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
