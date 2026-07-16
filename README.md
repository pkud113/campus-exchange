# Campus Exchange

Campus Exchange is a verified multi-campus marketplace, events, messaging, and campus-discussions PWA. It is a TypeScript modular monolith built with Next.js, Cloudflare Workers/R2/Images, Supabase PostgreSQL/Auth/Realtime, and a scheduled outbox worker.

Campuses and exact email domains are operator managed. Existing campuses retain their pre-migration behavior, while every newly created campus and domain starts inactive; no real university is activated by a seed migration. Listings and events default to campus-only and may be explicitly shared to the network. Discussions remain strictly campus-private.

Cross-campus identity uses narrow database projections rather than global profile-table access. Direct, listing, and event contact begins with an idempotent 10–500 character request. Acceptance transactionally creates or recovers the conversation and stores the opening as its first normal message. Blocks are global, prevent contact and new messages, and preserve conversation history as read-only by default.

The Discussions release adds campus-private Reddit-style communities, role-based ownership/moderation, text/link/private-image posts, eight-level threaded comments, transactional votes and saves, PostgreSQL search/ranking, report snapshots, generic outbox notifications, and 30-day structural tombstones. It remains isolated by the existing verified campus identity and staff AAL2 controls.

## Local development

1. Install Node.js 22, pnpm 11.13.0, Docker Desktop, and the Supabase CLI.
2. Copy `.env.example` to `apps/web/.env.local` and fill the local Supabase and Turnstile values. Turnstile may be omitted locally.
3. Run `pnpm install`.
4. Run `supabase start`, then `supabase db reset`.
5. Run `pnpm dev` and open `http://localhost:3000`.

The landing page works without credentials. Authenticated features require all migrations in `supabase/migrations`.

## Verification

Run `supabase db reset`, `supabase db lint --local --level error --fail-on error`, `supabase test db --local supabase/tests`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. The worker build is a Wrangler dry run and the web build is the production Next.js/OpenNext build.

Database tests use synthetic Campus Alpha, Campus Beta, and an inactive campus. They do not activate additional production universities.

## Campus operations

`pnpm campus:admin -- list` reads the safe operational state. Mutating commands preview by default and require `--apply`; supported operations create/update inactive campuses, manage exact domains, explicitly change campus lifecycle state, change approved network safety settings, and grant/revoke platform moderation roles. See [the production runbook](docs/operations.md) for examples, activation readback, feature disable, and rollback.

The [multi-campus design contract](docs/multi-campus.md) explicitly separates verified repository facts, implementation decisions, recommended defaults, assumptions, and local execution-environment observations.

## Discussions architecture

Every security-sensitive discussion row stores `campus_id`. Authenticated reads are RLS-scoped to the active profile's current campus; client mutations are revoked and flow through locked, idempotent RPCs. Community slugs are immutable and reserved after deletion. Owners cannot leave until transferring ownership to an active member, and staff moderation requires same-campus role membership plus AAL2.

Feeds use indexed keyset cursors. New sorts by creation time, Top by score, Most Commented by comment count, and Hot stores `3 × sign(E) × ln(1 + abs(E)) + created_epoch / 259200`, where `E = score + 2 × comment_count`. Pinned posts lead only inside their own community.

Discussion media stays private and uses the existing upload transformation pipeline. Ready `community_icon`, `community_banner`, and `discussion_post` uploads bind exactly once; abandoned unattached media is removed by scheduled maintenance. Deleted posts/comments retain their tree shape and purge bodies, links, media, and permitted author references after 30 days.

## Production

Production targets `https://campus-exchange.net`. Do not push the Phase 1 release to `main` until Cloudflare Workers Paid and Supabase Pro are active: `main` currently triggers the protected production deployment workflow.

Follow [the production runbook](docs/operations.md) in order. It includes the backup, secret inventory, staff invitation, MFA, auth-v2 cutover, smoke tests, rollback, and user actions that cannot be automated from the repository.
