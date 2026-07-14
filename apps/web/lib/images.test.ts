import { describe, expect, it } from "vitest";
import {
  detectedImageType,
  dimensionsAreAllowed,
  imageDimensions,
  imageTypesMatch,
  normalizedImageType,
} from "./images";

const buffer = (values: number[]) => new Uint8Array(values).buffer;
const ascii = (value: string) => [...value].map((character) => character.charCodeAt(0));

describe("image type validation", () => {
  it("recognizes JPEG, PNG, and WebP signatures", () => {
    expect(detectedImageType(buffer([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      detectedImageType(buffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(
      detectedImageType(buffer([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")])),
    ).toBe("image/webp");
  });

  it("recognizes HEIC and HEIF brands", () => {
    expect(
      detectedImageType(buffer([0, 0, 0, 24, ...ascii("ftyp"), ...ascii("heic"), 0, 0, 0, 0])),
    ).toBe("image/heic");
    expect(
      detectedImageType(buffer([0, 0, 0, 24, ...ascii("ftyp"), ...ascii("mif1"), 0, 0, 0, 0])),
    ).toBe("image/heif");
  });

  it("normalizes missing mobile MIME values from file extensions", () => {
    expect(normalizedImageType("", "camera.HEIC")).toBe("image/heic");
    expect(normalizedImageType(undefined, "photo.jpeg")).toBe("image/jpeg");
    expect(normalizedImageType("application/octet-stream", "photo.heif")).toBe("image/heif");
    expect(normalizedImageType("text/plain", "photo.txt")).toBeNull();
  });

  it("allows equivalent HEIC and HEIF declarations but rejects spoofed types", () => {
    expect(imageTypesMatch("image/heif", "image/heic")).toBe(true);
    expect(imageTypesMatch("image/png", "image/jpeg")).toBe(false);
    expect(detectedImageType(buffer([0, 1, 2, 3, 4, 5, 6, 7]))).toBeNull();
  });
});

describe("image dimensions", () => {
  it("reads PNG dimensions", () => {
    const png = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, ...ascii("IHDR"), 0, 0, 7, 128, 0, 0, 4, 56,
    ];
    expect(imageDimensions(buffer(png), "image/png")).toEqual({ width: 1920, height: 1080 });
  });

  it("reads JPEG dimensions", () => {
    const jpeg = [
      0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 4, 56, 7, 128, 3, 1, 0x11, 0, 2, 0x11, 0,
      3, 0x11, 0,
    ];
    expect(imageDimensions(buffer(jpeg), "image/jpeg")).toEqual({ width: 1920, height: 1080 });
  });

  it("enforces pixel and dimension limits", () => {
    expect(dimensionsAreAllowed({ width: 8064, height: 6048 })).toBe(true);
    expect(dimensionsAreAllowed({ width: 20_000, height: 10 })).toBe(false);
    expect(dimensionsAreAllowed({ width: 10_000, height: 10_000 })).toBe(false);
  });
});
