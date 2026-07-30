import { describe, expect, it, vi } from "vitest";
import {
  ImageValidationError,
  persistPreparedImage,
  prepareImageForStorage,
  transformImageForDelivery,
  type CloudflareImagesBinding,
} from "./image-processing";

const png = (width = 10, height = 10) =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 73, 72, 68, 82,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
  ]).buffer;

const heic = () => new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
  0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
]).buffer;

function imagesBinding(response: () => Response): CloudflareImagesBinding {
  return {
    info: async () => ({ width: 10, height: 10 }),
    input: () => ({
      transform: () => ({ output: async () => ({ response }) }),
    }),
  };
}

describe("prepareImageForStorage", () => {
  it("stores a successful Cloudflare conversion as WebP", async () => {
    const result = await prepareImageForStorage({
      bytes: png(),
      declaredType: "image/png",
      images: imagesBinding(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    });
    expect(result.optimized).toBe(true);
    expect(result.contentType).toBe("image/webp");
    expect([...new Uint8Array(result.bytes)]).toEqual([1, 2, 3]);
  });

  it("falls back to the validated original when optimization fails", async () => {
    const original = png();
    const result = await prepareImageForStorage({
      bytes: original,
      declaredType: "image/png",
      images: imagesBinding(() => new Response(null, { status: 503 })),
    });
    expect(result.optimized).toBe(false);
    expect(result.contentType).toBe("image/png");
    expect([...new Uint8Array(result.bytes)]).toEqual([...new Uint8Array(original)]);
  });

  it("rejects spoofed and oversized images before storage", async () => {
    await expect(
      prepareImageForStorage({
        bytes: png(),
        declaredType: "image/jpeg",
        images: imagesBinding(() => new Response()),
      }),
    ).rejects.toBeInstanceOf(ImageValidationError);
    await expect(
      prepareImageForStorage({
        bytes: png(16_000, 16_000),
        declaredType: "image/png",
        images: imagesBinding(() => new Response()),
      }),
    ).rejects.toBeInstanceOf(ImageValidationError);
  });

  it.each(["image/heic", "image/heif"] as const)("never stores unverified %s fallback bytes", async (declaredType) => {
    const bytes = declaredType === "image/heic"
      ? heic()
      : new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70,0x6d,0x69,0x66,0x31,0,0,0,0,0x6d,0x69,0x66,0x31,0,0,0,0]).buffer;
    const metadataFailure: CloudflareImagesBinding = {
      info: async () => { throw new Error("metadata unavailable"); },
      input: () => ({ transform: () => ({ output: async () => ({ response: () => new Response(null, { status: 503 }) }) }) }),
    };
    await expect(prepareImageForStorage({ bytes, declaredType, images: metadataFailure })).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("rejects HEIC when transformation fails even after dimensions are verified", async () => {
    await expect(prepareImageForStorage({
      bytes: heic(),
      declaredType: "image/heic",
      images: imagesBinding(() => new Response(null, { status: 503 })),
    })).rejects.toBeInstanceOf(ImageValidationError);
  });
});

describe("transformImageForDelivery", () => {
  it("returns the original when delivery optimization is unavailable", async () => {
    const original = png();
    const result = await transformImageForDelivery({
      bytes: original,
      width: 720,
      images: imagesBinding(() => new Response(null, { status: 500 })),
    });
    expect(result.optimized).toBe(false);
    expect([...new Uint8Array(result.bytes)]).toEqual([...new Uint8Array(original)]);
  });
});

describe("persistPreparedImage", () => {
  it("never marks a database record ready when R2 storage fails", async () => {
    const markReady = vi.fn(async () => undefined);
    await expect(
      persistPreparedImage({ put: async () => null, markReady }),
    ).rejects.toThrow(/R2/);
    expect(markReady).not.toHaveBeenCalled();
  });

  it("marks the record ready only after R2 succeeds", async () => {
    const calls: string[] = [];
    await persistPreparedImage({
      put: async () => {
        calls.push("r2");
        return {};
      },
      markReady: async () => {
        calls.push("database");
      },
    });
    expect(calls).toEqual(["r2", "database"]);
  });
});
