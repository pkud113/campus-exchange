import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase/server",()=>({createSupabaseAdminClient:vi.fn()}));
vi.mock("./api",()=>({apiError:vi.fn(),requestId:vi.fn()}));
import { DeterministicModerationProvider, canonicalModerationText, evaluateSharedText, localModerationCandidates, normalizeModerationText, sanitizeProviderText } from "./content-moderation";

describe("shared text moderation policy", () => {
  const provider = new DeterministicModerationProvider();

  it("sanitizes email addresses before provider transmission", () => {
    expect(sanitizeProviderText("Contact student@example.edu now")).toBe("Contact [email removed] now");
  });

  it("normalizes obvious spacing and character substitution evasion", () => {
    expect(normalizeModerationText("f . u . c . k")).toContain("fuck");
    expect(normalizeModerationText("sh1t")).toContain("shit");
  });

  it("blocks clear profanity and threats", async () => {
    await expect(evaluateSharedText("social_post", { body: "You are an asshole" }, provider)).resolves.toMatchObject({ decision: "block", categories: ["profanity"] });
    await expect(evaluateSharedText("discussion_comment", { body: "I will kill you" }, provider)).resolves.toMatchObject({ decision: "block", severe: true });
  });

  it("allows legitimate contextual discussion and benign substrings", async () => {
    await expect(evaluateSharedText("discussion_post", { title: "Academic quotation", body: "An academic quotation may analyze profane terms such as shit." }, provider)).resolves.toMatchObject({ decision: "allow" });
    expect(localModerationCandidates("The assistant organized a class assignment.")).toEqual([]);
  });

  it("uses stable field ordering", () => {
    expect(canonicalModerationText({ z: "last", a: ["first", "second"] })).toBe("a: first\nsecond\nz: last");
  });
});
