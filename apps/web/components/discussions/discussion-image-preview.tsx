"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BitmapFactory = (image: ImageBitmapSource) => Promise<ImageBitmap>;

export async function drawDiscussionImagePreview(
  file: File,
  canvas: HTMLCanvasElement,
  createBitmap: BitmapFactory = globalThis.createImageBitmap,
  shouldRender: () => boolean = () => true,
) {
  if (typeof createBitmap !== "function") throw new Error("Image previews are not supported by this browser.");
  const bitmap = await createBitmap(file);
  try {
    if (!shouldRender()) return false;
    if (!bitmap.width || !bitmap.height) throw new Error("The selected image has invalid dimensions.");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image previews are not supported by this browser.");
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return true;
  } finally {
    bitmap.close();
  }
}

export function DiscussionImagePreview({ file, compact = false }: { file: File; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let current = true;
    const canvas = canvasRef.current;
    setPreviewError("");
    if (!canvas) return () => { current = false; };
    void drawDiscussionImagePreview(file, canvas, undefined, () => current)
      .catch(() => {
        if (current) setPreviewError("Preview unavailable. The image can still be uploaded.");
      });
    return () => { current = false; };
  }, [file]);

  return <span className={`discussion-image-preview${compact ? " discussion-image-preview-compact" : ""}`}>
    <canvas ref={canvasRef} role="img" aria-label="Selected post preview"/>
    {previewError && <small role="status">{previewError}</small>}
    <span><ImageIcon/>Preview</span>
  </span>;
}
