import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { createSupabaseAdminClient } from "./supabase/server";
import { apiError, requestId } from "./api";

export const CONTENT_MODERATION_POLICY_VERSION = "ce-shared-text-2026-07-v1";
export type ModerationDecision = "allow" | "block" | "review" | "unavailable";
export type ModerationCategory = "hate" | "targeted_abuse" | "threat" | "slur" | "profanity";
export type ModerationFields = Record<string, string | string[] | null | undefined>;

export type ProviderModerationResult = {
  decision: Exclude<ModerationDecision, "unavailable">;
  categories: ModerationCategory[];
  confidence: "low" | "medium" | "high";
  provider: string;
  model: string;
  severe: boolean;
};

export interface ContentModerationProvider {
  evaluate(input: { surface: string; text: string; normalizedText: string; localCandidates: ModerationCategory[] }): Promise<ProviderModerationResult>;
}

const contextualResultSchema = z.object({
  decision: z.enum(["allow", "block", "review"]),
  categories: z.array(z.enum(["hate", "targeted_abuse", "threat", "slur", "profanity"])).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  severe: z.boolean(),
});

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const zeroWidthAndBidi = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const substitutions: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
const profanity = /\b(?:f+u+c+k+|s+h+i+t+|b+i+t+c+h+|a+s+s+h+o+l+e+|c+u+n+t+)\b/i;
const threat = /\b(?:kill|murder|shoot|stab|bomb|hurt)\b.{0,40}\b(?:you|them|him|her|people|students)\b/i;
const targetedAbuse = /\b(?:you|they|he|she|those people)\b.{0,36}\b(?:disgusting|subhuman|worthless|vermin|should die)\b/i;

export function sanitizeProviderText(value: string): string {
  return value.replace(emailPattern, "[email removed]").replace(zeroWidthAndBidi, "");
}

export function normalizeModerationText(value: string): string {
  const sanitized = sanitizeProviderText(value).normalize("NFKC").toLowerCase();
  const substituted = Array.from(sanitized, (character) => substitutions[character] ?? character).join("");
  return substituted
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/(?<=\b[a-z])[\s._*\-]+(?=[a-z]\b)/g, "")
    .replace(/[^a-z0-9\s'\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localModerationCandidates(value: string): ModerationCategory[] {
  const normalized = normalizeModerationText(value);
  const categories = new Set<ModerationCategory>();
  if (profanity.test(normalized)) categories.add("profanity");
  if (threat.test(normalized)) categories.add("threat");
  if (targetedAbuse.test(normalized)) categories.add("targeted_abuse");
  return [...categories];
}

export function canonicalModerationText(fields: ModerationFields): string {
  return Object.entries(fields)
    .filter((entry): entry is [string, string | string[]] => typeof entry[1] === "string" || Array.isArray(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join("\n") : value}`)
    .join("\n")
    .trim();
}

export async function moderationContentHash(surface: string, operation: string, fields: ModerationFields): Promise<string> {
  const bytes = new TextEncoder().encode(`${CONTENT_MODERATION_POLICY_VERSION}\n${surface}\n${operation}\n${canonicalModerationText(fields)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

function extractText(response: unknown): string {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const candidate = response as { response?: unknown; result?: unknown };
    if (typeof candidate.response === "string") return candidate.response;
    if (typeof candidate.result === "string") return candidate.result;
  }
  throw new Error("moderation_provider_invalid_response");
}

export class CloudflareWorkersAiModerationProvider implements ContentModerationProvider {
  constructor(private readonly ai: WorkersAi) {}

  async evaluate(input: { surface: string; text: string; normalizedText: string; localCandidates: ModerationCategory[] }): Promise<ProviderModerationResult> {
    const guardResponse = extractText(await this.ai.run("@cf/meta/llama-guard-3-8b", {
      messages: [{ role: "user", content: input.text }],
      max_tokens: 80,
    }));
    const guardUnsafe = /^unsafe/i.test(guardResponse.trim());
    if (!guardUnsafe && input.localCandidates.length === 0) {
      return { decision: "allow", categories: [], confidence: "high", provider: "cloudflare-workers-ai", model: "llama-guard-3-8b", severe: false };
    }

    const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        { role: "system", content: "Classify shared campus content. Block targeted hate, abuse, threats, abusive slurs, and vulgar profanity. Allow clearly academic quotations, counterspeech, legitimate reporting, and non-abusive reclaimed-language discussion. Use review when context is ambiguous. Never reproduce offensive text in the response." },
        { role: "user", content: JSON.stringify({ surface: input.surface, text: input.text, normalized: input.normalizedText, candidates: input.localCandidates }) },
      ],
      max_tokens: 180,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "campus_exchange_moderation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decision: { type: "string", enum: ["allow", "block", "review"] },
              categories: { type: "array", items: { type: "string", enum: ["hate", "targeted_abuse", "threat", "slur", "profanity"] } },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              severe: { type: "boolean" },
            },
            required: ["decision", "categories", "confidence", "severe"],
          },
        },
      },
    });
    const parsed = contextualResultSchema.parse(JSON.parse(extractText(response)));
    if (guardUnsafe && parsed.decision === "allow" && parsed.confidence !== "high") parsed.decision = "review";
    return { ...parsed, provider: "cloudflare-workers-ai", model: "llama-guard-3-8b+llama-3.1-8b-instruct-fast" };
  }
}

export class DeterministicModerationProvider implements ContentModerationProvider {
  async evaluate(input: { text: string; normalizedText: string; localCandidates: ModerationCategory[] }): Promise<ProviderModerationResult> {
    if (input.normalizedText.includes("ce test unavailable")) throw new Error("deterministic_unavailable");
    const legitimateContext = /\b(?:academic|quotation|quoted|counterspeech|research)\b/i.test(input.text);
    if (legitimateContext) return { decision: "allow", categories: input.localCandidates, confidence: "high", provider: "deterministic", model: "policy-fixture-v1", severe: false };
    if (input.localCandidates.includes("threat")) return { decision: "block", categories: input.localCandidates, confidence: "high", provider: "deterministic", model: "policy-fixture-v1", severe: true };
    if (input.localCandidates.length) return { decision: "block", categories: input.localCandidates, confidence: "high", provider: "deterministic", model: "policy-fixture-v1", severe: false };
    if (input.normalizedText.includes("ce test review")) return { decision: "review", categories: ["targeted_abuse"], confidence: "low", provider: "deterministic", model: "policy-fixture-v1", severe: false };
    return { decision: "allow", categories: [], confidence: "high", provider: "deterministic", model: "policy-fixture-v1", severe: false };
  }
}

export function contentModerationProvider(): ContentModerationProvider {
  if (process.env.CONTENT_MODERATION_PROVIDER === "deterministic" || process.env.NODE_ENV === "test") return new DeterministicModerationProvider();
  const { env } = getCloudflareContext() as unknown as { env: { AI?: WorkersAi } };
  if (!env.AI) throw new Error("moderation_provider_unconfigured");
  return new CloudflareWorkersAiModerationProvider(env.AI);
}

export async function evaluateSharedText(surface: string, fields: ModerationFields, provider = contentModerationProvider()): Promise<ProviderModerationResult> {
  const text = sanitizeProviderText(canonicalModerationText(fields));
  const normalizedText = normalizeModerationText(text);
  const localCandidates = localModerationCandidates(text);
  return provider.evaluate({ surface, text, normalizedText, localCandidates });
}

async function evaluateWithDeadline(surface:string,fields:ModerationFields):Promise<ProviderModerationResult>{
  let lastError:unknown;
  for(let attempt=0;attempt<2;attempt+=1){
    try{return await Promise.race([evaluateSharedText(surface,fields),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("moderation_timeout")),4_000))]);}
    catch(error){lastError=error;if(attempt===0)await new Promise((resolve)=>setTimeout(resolve,75));}
  }
  throw lastError;
}

export type ModerationAuthorization = { checkId: string; contentHash: string };

export async function authorizeSharedTextMutation(
  request: Request,
  context: { userId: string; campusId: string },
  input: { surface: string; operation: "create" | "edit"; fields: ModerationFields; targetId?: string | null; idempotencyKey?: string | null },
): Promise<ModerationAuthorization | Response> {
  const text = canonicalModerationText(input.fields);
  if (!text) return { checkId: "00000000-0000-0000-0000-000000000000", contentHash: await moderationContentHash(input.surface, input.operation, input.fields) };
  const started = performance.now();
  const contentHash = await moderationContentHash(input.surface, input.operation, input.fields);
  const admin = createSupabaseAdminClient();
  const cached=await admin.from("content_moderation_checks").select("id,outcome,categories").eq("actor_id",context.userId).eq("surface",input.surface).eq("operation",input.operation).eq("content_hash",contentHash).eq("policy_version",CONTENT_MODERATION_POLICY_VERSION).is("consumed_at",null).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(cached.data){
    if(cached.data.outcome==="allow")return{checkId:cached.data.id,contentHash};
    const code=cached.data.outcome==="review"?"content_review_required":"content_blocked";
    const message=cached.data.outcome==="review"?"This text needs a safety review before it can be shared. Revise it or request staff review.":"This text cannot be shared because it appears to contain abusive, threatening, hateful, or profane language. Please revise it.";
    return apiError(request,422,code,message,{checkId:cached.data.id,categories:cached.data.categories,fields:Object.keys(input.fields),reviewEligible:true});
  }
  let result: ProviderModerationResult;
  try {
    result = await evaluateWithDeadline(input.surface, input.fields);
  } catch {
    console.error(JSON.stringify({ level: "error", event: "content_moderation_unavailable", requestId: requestId(request), surface: input.surface }));
    const response = apiError(request, 503, "moderation_unavailable", "Content safety checks are temporarily unavailable. Your draft was not published; please retry shortly.", { retryable: true });
    response.headers.set("Retry-After", "10");
    return response;
  }

  const { data, error } = await admin.rpc("record_content_moderation_check", {
    target_actor: context.userId,
    target_campus: context.campusId,
    target_surface: input.surface,
    target_operation: input.operation,
    target_hash: contentHash,
    target_outcome: result.decision,
    target_categories: result.categories,
    target_provider: result.provider,
    target_model: result.model,
    target_policy: CONTENT_MODERATION_POLICY_VERSION,
    target_fields: input.fields,
    target_entity: input.targetId ?? null,
    target_key: input.idempotencyKey ?? null,
    target_severe: result.severe,
  });
  if (error || !data) {
    console.error(JSON.stringify({ level: "error", event: "content_moderation_record_failed", requestId: requestId(request), surface: input.surface }));
    const response = apiError(request, 503, "moderation_unavailable", "Content safety checks are temporarily unavailable. Your draft was not published; please retry shortly.", { retryable: true });
    response.headers.set("Retry-After", "10");
    return response;
  }
  console.info(JSON.stringify({ level: "info", event: "content_moderation_decision", requestId: requestId(request), checkId: data, surface: input.surface, decision: result.decision, categories: result.categories, provider: result.provider, model: result.model, latencyMs: Math.round(performance.now() - started) }));
  if (result.decision !== "allow") {
    const code = result.decision === "review" ? "content_review_required" : "content_blocked";
    const message = result.decision === "review"
      ? "This text needs a safety review before it can be shared. Revise it or request staff review."
      : "This text cannot be shared because it appears to contain abusive, threatening, hateful, or profane language. Please revise it.";
    return apiError(request, 422, code, message, { checkId: data, categories: result.categories, fields: Object.keys(input.fields), reviewEligible: true });
  }
  return { checkId: data as string, contentHash };
}
