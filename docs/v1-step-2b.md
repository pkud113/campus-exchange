# Campus Exchange V1 Step 2B implementation record

Step 2B adds fail-closed automated moderation for user-authored text that is published to, or shared with, other Campus Exchange members. It extends the Step 2A profile/social experience and the existing reporting and moderation system; it does not replace authorization, RLS, campus isolation, manual reporting, appeals, audit, outbox, or retention behavior.

## Covered surfaces

- Onboarding username and publicly displayed profile name, biography, academic field, and interests.
- Social personal/organization posts, comments, replies, and edits.
- Discussion community names/descriptions/rules/slugs, posts, comments, replies, and edits.
- Organization names/descriptions/slugs, categories, channels, custom roles, shared channel messages, replies, and edits.
- Listing title/description and event title/description/location, including organization events.
- User-authored alt text for existing shared/public media purposes. Image pixels are not evaluated and the product must not claim image moderation.

Private direct-message bodies and conversation-request opening messages are intentionally excluded. Their routes do not import the moderation engine and their tables have no moderation trigger. Search queries, URLs, passwords, report details, appeal statements, staff notes, and system-generated labels are also outside the publication boundary.

## Runtime and outcomes

The web application uses a provider-neutral `ContentModerationProvider`. Production binds Cloudflare Workers AI as `AI`, runs Llama Guard plus contextual structured classification when needed, and validates every response. Tests use a deterministic provider selected by `CONTENT_MODERATION_PROVIDER=deterministic`.

The versioned policy normalizes Unicode, zero-width/bidirectional controls, spacing, punctuation, repetition, and common character substitutions. Email-like strings are removed before provider transmission. Provider inputs contain only opaque surface labels and the submitted fields—never campus identity, account IDs, or separate profile data.

`allow` creates a short-lived clearance. `block` and `review` return understandable revision guidance and may be submitted to staff review. Provider errors, malformed responses, or timeouts return a retryable 503 and never authorize publication. High-confidence threats or severe hateful abuse create a high/critical case automatically.

## Database and staff controls

Column-aware triggers require a matching actor, campus, surface, operation, content hash, target, policy version, and unexpired allow decision or exact-text override. Checks are consumed atomically. This neutralizes direct Data API or RPC bypasses while preserving the existing ownership and organization/community permission functions.

Rejected text is stored only in protected evidence when reviewable. Reports use the `automated_moderation` target and enter the existing campus-scoped, AAL2-protected case queue. Staff can approve the exact text for one resubmission within seven days or uphold the block. Appeals remain in the same case timeline; approval creates an override and does not publish a stale draft. Actions, reversals, notifications, and audit events use the existing infrastructure.

## Operations, privacy, and limitations

The worker redacts resolved evidence and purges expired checks in bounded batches. Structured logs contain request/check IDs, surface, decision category, provider/model, and latency only—never submitted text, email, campus identity, credentials, or private messages. Production deployment calls a protected benign readiness probe after deploying the web Worker.

Step 2B moderates English-oriented text and obvious evasion. Contextual classification reduces false positives for academic quotation, counterspeech, reporting, and reclaimed-language discussion, but staff review remains the remedy for ambiguous decisions. It does not scan images, audio, linked pages, private messages, or mobile-only flows. A provider outage blocks covered writes while reads and private messaging continue.

Rollback is forward/fail-closed: keep the additive schema applied, restore provider health or deploy a compatible fix, and verify the readiness probe plus authenticated shared-text smoke tests. Never restore unchecked publication as an emergency toggle.
