import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listingFileKey,
  uploadListingFiles,
  validateListingFiles,
} from "./listing-upload-client";
import { maxImageBytes } from "./images";

function fakeFile(overrides: Partial<File> = {}) {
  return {
    name: "desk.png",
    size: 1024,
    type: "image/png",
    lastModified: 123,
    ...overrides,
  } as File;
}

afterEach(() => vi.unstubAllGlobals());

describe("listing upload client", () => {
  it("rejects unsupported and oversized files before creating a draft", () => {
    expect(validateListingFiles([fakeFile({ name: "notes.txt", type: "text/plain" })])).toMatch(
      /JPEG, PNG, WebP, HEIC, or HEIF/,
    );
    expect(validateListingFiles([fakeFile({ size: maxImageBytes + 1 })])).toMatch(/20 MB/);
  });

  it("reacquires an expired grant and completes the upload", async () => {
    const responses = [
      new Response(JSON.stringify({ data: { uploadUrl: "/upload/old" } }), { status: 201 }),
      new Response(JSON.stringify({ error: { message: "expired" } }), { status: 403 }),
      new Response(JSON.stringify({ data: { uploadUrl: "/upload/new" } }), { status: 201 }),
      new Response(JSON.stringify({ data: { status: "ready" } }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);
    const file = fakeFile();
    const uploadedKeys = new Set<string>();
    const failures = await uploadListingFiles({
      listingId: "5d0b3cf6-e3cd-42ab-b4a2-493450f4ac81",
      title: "Desk",
      files: [file],
      uploadedKeys,
      onProgress: () => undefined,
    });
    expect(failures).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(uploadedKeys.has(listingFileKey(file))).toBe(true);
  });
});
