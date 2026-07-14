import {
  detectedImageType,
  dimensionsAreAllowed,
  imageDimensions,
  imageTypesMatch,
  type ImageDimensions,
  type ListingImageType,
} from "./images";

export type CloudflareImagesBinding = {
  info?: (stream: ReadableStream<Uint8Array>) => Promise<{
    width?: number;
    height?: number;
  }>;
  input: (stream: ReadableStream<Uint8Array>) => {
    transform: (options: unknown) => {
      output: (options: unknown) => Promise<{ response: () => Response }>;
    };
  };
};

export type PreparedImage = {
  bytes: ArrayBuffer;
  contentType: ListingImageType;
  optimized: boolean;
  dimensions: ImageDimensions | null;
  optimizationError?: string;
};

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

function streamFor(bytes: ArrayBuffer) {
  return new Response(bytes.slice(0)).body!;
}

export async function prepareImageForStorage({
  bytes,
  declaredType,
  images,
}: {
  bytes: ArrayBuffer;
  declaredType: ListingImageType;
  images: CloudflareImagesBinding;
}): Promise<PreparedImage> {
  const detectedType = detectedImageType(bytes);
  if (!detectedType || !imageTypesMatch(declaredType, detectedType)) {
    throw new ImageValidationError(
      "The image contents do not match the selected file type.",
    );
  }

  let dimensions = imageDimensions(bytes, detectedType);
  const needsLocalDimensions =
    detectedType === "image/jpeg" ||
    detectedType === "image/png" ||
    detectedType === "image/webp";
  if (needsLocalDimensions && !dimensions) {
    throw new ImageValidationError("The image structure is malformed.");
  }
  if (dimensions && !dimensionsAreAllowed(dimensions)) {
    throw new ImageValidationError(
      "The image dimensions are too large. Use an image under 50 megapixels and 16,384 pixels per side.",
    );
  }

  if (images.info) {
    try {
      const info = await images.info(streamFor(bytes));
      if (typeof info.width === "number" && typeof info.height === "number") {
        dimensions = { width: info.width, height: info.height };
        if (!dimensionsAreAllowed(dimensions)) {
          throw new ImageValidationError(
            "The image dimensions are too large. Use an image under 50 megapixels and 16,384 pixels per side.",
          );
        }
      }
    } catch (error) {
      if (error instanceof ImageValidationError) throw error;
      // Local structure and signature validation still protect the private fallback path.
    }
  }

  try {
    const transformed = await images
      .input(streamFor(bytes))
      .transform({ width: 1600, height: 1600, fit: "scale-down" })
      .output({ format: "image/webp", quality: 82, anim: false });
    const response = transformed.response();
    if (!response.ok || !response.body) {
      throw new Error(`Cloudflare Images returned ${response.status}`);
    }
    return {
      bytes: await response.arrayBuffer(),
      contentType: "image/webp",
      optimized: true,
      dimensions,
    };
  } catch (error) {
    return {
      bytes,
      contentType: detectedType,
      optimized: false,
      dimensions,
      optimizationError: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function transformImageForDelivery({
  bytes,
  width,
  images,
}: {
  bytes: ArrayBuffer;
  width: number;
  images: CloudflareImagesBinding;
}): Promise<{ bytes: ArrayBuffer; optimized: boolean; error?: string }> {
  try {
    const output = await images
      .input(streamFor(bytes))
      .transform({ width, height: width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 82, anim: false });
    const response = output.response();
    if (!response.ok || !response.body) {
      throw new Error(`Cloudflare Images returned ${response.status}`);
    }
    return { bytes: await response.arrayBuffer(), optimized: true };
  } catch (error) {
    return {
      bytes,
      optimized: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function persistPreparedImage({
  put,
  markReady,
}: {
  put: () => Promise<unknown | null>;
  markReady: () => Promise<void>;
}) {
  const stored = await put();
  if (stored === null) throw new Error("R2 did not store the image");
  await markReady();
}
