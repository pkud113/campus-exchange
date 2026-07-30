import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase/server",()=>({createSupabaseAdminClient:vi.fn()}));
vi.mock("./api",()=>({apiError:vi.fn(),requestId:vi.fn()}));
import {
  CloudflareWorkersAiModerationProvider,
  DeterministicModerationProvider,
  ModerationPipelineError,
  canonicalModerationText,
  evaluateSharedText,
  evaluateWithDeadline,
  localModerationCandidates,
  normalizeModerationText,
  sanitizeProviderText,
  type ContentModerationProvider,
} from "./content-moderation";

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

  it("detects explicit hate and obfuscated slurs before a guard-model allow can short-circuit", () => {
    expect(localModerationCandidates("Those Jewish students are subhuman and do not belong here.")).toContain("hate");
    expect(localModerationCandidates("n 1 g g e r")).toContain("slur");
    expect(localModerationCandidates("f.a.g.g.o.t")).toContain("slur");
  });

  it.each([
    "Academic quotation examining the slur nigger in a historical source.",
    "Counterspeech: calling gay students faggots is hateful and unacceptable.",
    "Research reporting documents the phrase that Jewish students are inferior.",
    "A reclaimed-language discussion quotes nigga while explaining community context.",
  ])("allows contextual classification instead of indiscriminately blocking: %s", async (body) => {
    await expect(evaluateSharedText("discussion_post", { body }, provider)).resolves.toMatchObject({ decision: "allow" });
  });

  it("forces contextual classification when the guard says safe but local hate evidence exists", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce("safe")
      .mockResolvedValueOnce(JSON.stringify({ decision: "block", categories: ["hate"], confidence: "high", severe: true }));
    const contextual = new CloudflareWorkersAiModerationProvider({ run });
    await expect(evaluateSharedText("social_post", { body: "Those Muslim students are vermin." }, contextual))
      .resolves.toMatchObject({ decision: "block", categories: ["hate"] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not start a duplicate provider request after a timeout", async () => {
    const evaluate = vi.fn(() => new Promise<never>(() => undefined));
    const hanging: ContentModerationProvider = { evaluate };
    await expect(evaluateWithDeadline("social_post", { body: "benign" }, hanging, 5))
      .rejects.toMatchObject({ stage: "timeout", diagnosticCode: "moderation_timeout" });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("retries only a settled explicitly retryable provider failure", async () => {
    const evaluate = vi.fn()
      .mockRejectedValueOnce(new ModerationPipelineError("provider", "provider_rate_limit", true, 429))
      .mockResolvedValueOnce({ decision: "allow", categories: [], confidence: "high", provider: "fixture", model: "fixture", severe: false });
    await expect(evaluateWithDeadline("social_post", { body: "benign" }, { evaluate }, 200))
      .resolves.toMatchObject({ decision: "allow" });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("uses stable field ordering", () => {
    expect(canonicalModerationText({ z: "last", a: ["first", "second"] })).toBe("a: first\nsecond\nz: last");
  });
});
