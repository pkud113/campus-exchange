import { describe, expect, it, vi } from "vitest";
import { drawDiscussionImagePreview } from "./discussion-image-preview";

function previewHarness() {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  const bitmap = { width: 3200, height: 1600, close: vi.fn() } as unknown as ImageBitmap;
  const createBitmap = vi.fn(async () => bitmap);
  return { bitmap, canvas, context, createBitmap };
}

describe("Discussion image preview", () => {
  it("decodes selected files into bounded canvas pixels without a DOM URL", async () => {
    const { bitmap, canvas, context, createBitmap } = previewHarness();
    const file = new File(["image"], "campus.png", { type: "image/png" });

    await expect(drawDiscussionImagePreview(file, canvas, createBitmap)).resolves.toBe(true);

    expect(createBitmap).toHaveBeenCalledWith(file);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("does not draw a stale preview after the selected file changes", async () => {
    const { bitmap, canvas, context, createBitmap } = previewHarness();
    const file = new File(["image"], "campus.png", { type: "image/png" });

    await expect(drawDiscussionImagePreview(file, canvas, createBitmap, () => false)).resolves.toBe(false);

    expect(context.drawImage).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
