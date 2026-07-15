import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discussionFileKey,
  uploadDiscussionImage,
  validateDiscussionImage,
} from "./discussion-upload-client";
import { maxImageBytes } from "./images";

function fakeFile(overrides: Partial<File> = {}) {
  return {
    name: "campus.png",
    size: 1024,
    type: "image/png",
    lastModified: 123,
    ...overrides,
  } as File;
}

afterEach(() => vi.unstubAllGlobals());

describe("discussion image upload client", () => {
  it("validates supported image files before requesting a grant", () => {
    expect(validateDiscussionImage(fakeFile())).toBeNull();
    expect(validateDiscussionImage(fakeFile({ name: "notes.txt", type: "text/plain" }))).toMatch(/JPEG/);
    expect(validateDiscussionImage(fakeFile({ size: maxImageBytes + 1 }))).toMatch(/20 MB/);
  });

  it("retries a transient R2 failure without creating another grant", async () => {
    const responses = [
      new Response(JSON.stringify({ data: { uploadUrl: "/upload/one" } }), { status: 201 }),
      new Response(JSON.stringify({ error: { message: "temporary" } }), { status: 503 }),
      new Response(JSON.stringify({ data: { id: "11111111-1111-4111-8111-111111111111" } }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadDiscussionImage({ file: fakeFile(), altText: "Campus", onProgress: () => undefined })).resolves.toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reacquires an expired grant and preserves a stable selected-file key", async () => {
    const responses = [
      new Response(JSON.stringify({ data: { uploadUrl: "/upload/expired" } }), { status: 201 }),
      new Response(JSON.stringify({ error: { message: "expired" } }), { status: 403 }),
      new Response(JSON.stringify({ data: { uploadUrl: "/upload/fresh" } }), { status: 201 }),
      new Response(JSON.stringify({ data: { id: "22222222-2222-4222-8222-222222222222" } }), { status: 200 }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    const file = fakeFile();

    await expect(uploadDiscussionImage({ file, altText: "Campus", onProgress: () => undefined })).resolves.toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
    });
    expect(discussionFileKey(file)).toBe("campus.png:1024:123");
  });
});
