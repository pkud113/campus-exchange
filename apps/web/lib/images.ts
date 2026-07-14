export const listingImageTypes = [
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
] as const;

export type ListingImageType = (typeof listingImageTypes)[number];

export const maxImageBytes = 20 * 1024 * 1024;
export const maxImageDimension = 16_384;
export const maxImagePixels = 50_000_000;

const imageTypeSet = new Set<string>(listingImageTypes);
const heicBrands = new Set(["heic", "heix", "hevc", "hevx"]);
const heifBrands = new Set(["mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function normalizedImageType(
  contentType: string | null | undefined,
  filename = "",
): ListingImageType | null {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && imageTypeSet.has(normalized)) {
    return normalized as ListingImageType;
  }
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return null;
}

export function detectedImageType(bytes: ArrayBuffer): ListingImageType | null {
  const value = new Uint8Array(bytes);
  if (
    value.length >= 3 &&
    value[0] === 0xff &&
    value[1] === 0xd8 &&
    value[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    value.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => value[index] === byte,
    )
  ) {
    return "image/png";
  }
  if (
    value.length >= 12 &&
    ascii(value, 0, 4) === "RIFF" &&
    ascii(value, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  if (value.length >= 16 && ascii(value, 4, 4) === "ftyp") {
    const brands: string[] = [];
    for (let offset = 8; offset + 4 <= Math.min(value.length, 40); offset += 4) {
      brands.push(ascii(value, offset, 4));
    }
    if (brands.some((brand) => heicBrands.has(brand))) return "image/heic";
    if (brands.some((brand) => heifBrands.has(brand))) return "image/heif";
  }
  return null;
}

export function imageTypesMatch(
  declared: ListingImageType,
  detected: ListingImageType,
) {
  const declaredHeif = declared === "image/heic" || declared === "image/heif";
  const detectedHeif = detected === "image/heic" || detected === "image/heif";
  return declared === detected || (declaredHeif && detectedHeif);
}

export type ImageDimensions = { width: number; height: number };

function pngDimensions(value: Uint8Array): ImageDimensions | null {
  if (value.length < 24 || ascii(value, 12, 4) !== "IHDR") return null;
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(value: Uint8Array): ImageDimensions | null {
  let offset = 2;
  const at = (index: number) => value[index] ?? 0;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 8 < value.length) {
    if (at(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    while (at(offset) === 0xff) offset += 1;
    const marker = at(offset);
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= value.length) return null;
    const length = (at(offset) << 8) | at(offset + 1);
    if (length < 2 || offset + length > value.length) return null;
    if (sofMarkers.has(marker) && length >= 7) {
      return {
        height: (at(offset + 3) << 8) | at(offset + 4),
        width: (at(offset + 5) << 8) | at(offset + 6),
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(value: Uint8Array): ImageDimensions | null {
  if (value.length < 30) return null;
  const at = (index: number) => value[index] ?? 0;
  const chunk = ascii(value, 12, 4);
  if (chunk === "VP8X") {
    const width = 1 + at(24) + (at(25) << 8) + (at(26) << 16);
    const height = 1 + at(27) + (at(28) << 8) + (at(29) << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && value.length >= 30) {
    return {
      width: ((at(27) << 8) | at(26)) & 0x3fff,
      height: ((at(29) << 8) | at(28)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && value.length >= 25 && at(20) === 0x2f) {
    return {
      width: 1 + at(21) + ((at(22) & 0x3f) << 8),
      height:
        1 +
        (at(22) >> 6) +
        (at(23) << 2) +
        ((at(24) & 0x0f) << 10),
    };
  }
  return null;
}

export function imageDimensions(
  bytes: ArrayBuffer,
  type: ListingImageType,
): ImageDimensions | null {
  const value = new Uint8Array(bytes);
  if (type === "image/png") return pngDimensions(value);
  if (type === "image/jpeg") return jpegDimensions(value);
  if (type === "image/webp") return webpDimensions(value);
  return null;
}

export function dimensionsAreAllowed(dimensions: ImageDimensions) {
  return (
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width <= maxImageDimension &&
    dimensions.height <= maxImageDimension &&
    dimensions.width * dimensions.height <= maxImagePixels
  );
}
