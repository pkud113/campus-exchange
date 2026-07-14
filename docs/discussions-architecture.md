# Campus Discussions architecture

## Trust boundary

Discussions is authenticated, verified-campus-only, and force-dynamic. Every security-sensitive row stores `campus_id`; RLS compares it with the active profile's current campus. New tables grant only required `SELECT` access to `authenticated`. Direct client inserts, updates, deletes, and counter writes are revoked. Browser clients receive only the publishable Supabase key.

Mutations enter versioned Next.js endpoints, pass origin/session/feature-flag/rate-limit/Zod validation, and call locked PostgreSQL RPCs. Security-definer implementation functions live in the unexposed `private` schema with empty `search_path`, validate `auth.uid()` and campus scope internally, and are wrapped by explicitly granted public security-invoker functions.

## Ownership and moderation

Community creation atomically creates the active owner membership. Owners cannot leave or be removed. Ownership transfer locks the community and both memberships, requires an active same-community member, updates both roles and `owner_id`, writes audit/moderation rows, and emits an outbox event in one transaction.

Community moderators act only inside their community. Owners alone manage metadata, posting policy, moderators, deletion, and ownership. Campus moderators/admins operate only in their campus and require an AAL2 JWT. Staff cannot transfer or assume ownership. Every moderation mutation records actor, community, action, target, reason, request ID, timestamp, and non-sensitive metadata.

## Feeds, search, and threads

Keyset indexes support:

- New: `created_at DESC, id DESC`
- Top: `score DESC, created_at DESC, id DESC`
- Most Commented: `comment_count DESC, created_at DESC, id DESC`
- Hot: `3 × sign(E) × ln(1 + abs(E)) + created_epoch / 259200`, `E = score + 2 × comment_count`, then UUID

The Hot expression is a three-day age-decay ranking up to a row-independent constant. Pinned posts are promoted only within their community. Campus-scoped search uses PostgreSQL full-text vectors and trigram indexes. Comment depth is derived in PostgreSQL and capped at eight; the API retrieves a post's comments in one ordered query and assembles the tree without N+1 queries.

## Media, notifications, and retention

Community icons/banners and discussion images reuse the private R2/Images pipeline. A ready upload belongs to one uploader and may bind exactly once through an RPC. Signed upload URLs are short-lived; original bucket URLs stay private. Unattached ready media is removed after 24 hours.

Outbox events cover post/comment replies, moderator changes, bans/unbans, content removal, and ownership transfer. Database triggers suppress known self-notifications and the worker checks again defensively. Notification IDs derive deterministically from event and recipient IDs. Email/log text is generic and excludes content, email addresses, URLs containing signatures, and credentials. Delivery retries exponentially, caps at one hour, and dead-letters after the configured attempt threshold.

Deleted discussion content stops participation immediately. After 30 days, maintenance removes bodies, links, media references, moderation reasons, and author references where the schema permits, while retaining post/comment tombstones needed to preserve reply trees. Deleted community slugs remain reserved.

## Release safety

CI resets local Supabase from all migrations, lints application schemas at error level, runs pgTAP, typechecks, runs Vitest, builds production artifacts, and audits production dependencies. Release additionally requires linked Supabase advisors, a complete diff security review, encrypted backup verification, protected production approval, and the smoke checklist in `docs/operations.md`.

The `discussions_enabled` runtime switch defaults to true. Emergency rollback disables traffic/navigation and redeploys the prior web/worker while leaving additive database objects in place.
