// Cloudinary unsigned upload — no API secret needed on the client.
// The preset restricts uploads to the freej-materials folder.
const CLOUD_NAME = "qrylysla";
const UPLOAD_PRESET = "warehouse_upload";

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "فشل رفع الصورة");
  }

  const data = await res.json();
  return data.secure_url as string;
}

// Insert a Cloudinary transformation so lists load small optimized thumbnails
// instead of the full-size original.
export function thumbUrl(url: string, size = 300): string {
  return url.replace("/upload/", `/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}
