/**
 * تنزيل ملف مولّد داخل المتصفح بطريقة تعمل على سطح المكتب والجوال.
 * إبقاء الرابط لحظات قبل تحريره مهم خصوصاً في Safari؛ تحريره مباشرة بعد click
 * قد يلغي القراءة قبل أن يبدأ مدير التنزيل على الجهاز.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

