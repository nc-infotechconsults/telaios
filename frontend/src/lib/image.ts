export interface ImageValidation {
  ok: boolean;
  error?: string;
}

/** Validate a base64 image data URL against a max byte budget (the encoded string length). */
export function validateImageDataUrl(dataUrl: string, maxBytes: number): ImageValidation {
  if (!/^data:image\/[a-zA-Z.+-]+;base64,/.test(dataUrl)) {
    return { ok: false, error: "File must be an image." };
  }
  if (dataUrl.length > maxBytes) {
    return { ok: false, error: `Image is too large (max ${Math.round(maxBytes / 1000)} KB).` };
  }
  return { ok: true };
}

/**
 * Read a File into a base64 data URL, downscaling raster images so the encoded
 * string fits maxBytes. SVGs are returned as-is. Browser-only (uses canvas).
 */
export async function fileToDataUrl(file: File, maxBytes: number, maxDim = 512): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Failed to read file"));
    fr.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml" || raw.length <= maxBytes) return raw;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to decode image"));
    i.src = raw;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.9;
  let out = canvas.toDataURL("image/png");
  while (out.length > maxBytes && quality > 0.3) {
    out = canvas.toDataURL("image/jpeg", quality);
    quality -= 0.15;
  }
  return out;
}
