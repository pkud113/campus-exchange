# Multi-campus design and operating contract

## Verified repository facts

- Campus membership remains mandatory on profiles and cannot be changed through authenticated profile grants.
- Discussions continue to store `campus_id` and use campus-private RLS, media, reports, and Realtime topics.
- Private media remains in R2 and is delivered only through the authenticated media route after database authorization.
- Conversation and notification Realtime topics remain private and participant/profile authorized.
- Existing campus roles, AAL2 moderation checks, report snapshots, append-only audit records, rate-limit storage, runtime settings, and the outbox worker are extended rather than replaced.
- The historical production-campus migration is not edited. No additional real university is seeded or activated by the multi-campus migration.

## Implementation decisions

- Existing campuses/domains are backfilled enabled to preserve their effective behavior. New campuses/domains default inactive and activation is an explicit preview/apply operator command.
- Existing listings/events are campus-only. Existing listings retain a non-selectable `legacy_exchange_unspecified` state rendered as “Exchange details not specified”; the application never invents campus pickup.
- New or materially edited listings require at least one unique supported exchange method. Network listings always require one.
- Cross-campus identity is served by narrow safe projections. The profile table itself remains same-campus/self/moderator scoped.
- Direct, listing, and event contact use one request workflow with opening text and an idempotency key. Database locks, unique indexes, and transactional checks are authoritative.
- Acceptance creates/recovers a context-specific conversation, stores both participants’ actual campuses, inserts the opening once as the first normal message, and emits retry-safe outbox events.
- Blocks are global. They cancel pending requests, prevent contact and message insertion, and preserve evidence/history according to the configured presentation mode.
- Campus moderators retain creator-campus scope. Separate platform roles, AAL2, protected report routing, staff safeguards, and audit metadata cover eligible global abuse.
- The background worker is deployed before the migration begins emitting new outbox types.

## Recommended configurable defaults

- `network_features_enabled = true`
- `message_request_daily_limit = 10` per rolling 24 hours
- `message_request_decline_cooldown_days = 14`
- `blocked_conversation_visibility = read_only` (`hidden` is also supported)
- Opening-message validation is 10–500 trimmed characters in the current migration and contract. Changing that bound requires a forward migration plus contract/UI update so every enforcement layer stays consistent.

The numeric values and blocked-history mode are defaults, not permanent product decisions. Self-contact, blank openings, block bypass, duplicate pending requests, client-supplied campus/ownership, and unauthorized context access remain non-configurable security invariants.

## Assumptions and current limitations

- An enabled campus is assumed to represent operator approval for network discovery; changing lifecycle state can immediately affect active access and must use the documented preview/readback workflow.
- Accepted conversations survive later content narrowing. Unavailable listing/event context is omitted while message history remains.
- Network disable stops cross-campus discovery and new global requests. It deliberately does not delete accepted conversations or make Discussions global.
- The application does not implement public-internet profiles/content, campus switching, unrestricted DMs, custom audiences, shipping labels, GPS, social follows, or global Discussions.

## Execution-environment observations

These are observations from the implementation workstation, not permanent repository requirements:

- Node.js reported `v22.18.0`; local pnpm reported `11.7.0`. The repository declares pnpm `11.13.0`, and CI installs Node 22 plus pnpm 11.13.0.
- Supabase CLI `2.109.1` was verified through the package runner and is pinned in the production workflow.
- Baseline and post-change TypeScript/Vitest validation ran locally. Docker Desktop was started for final database verification: a clean reset applied every migration and the synthetic seed, SQL lint returned no errors, and both pgTAP files passed (82 assertions total).
- The production build completed locally, including the Wrangler worker dry run and Next.js/OpenNext application build. Local Supabase security/performance advisors reported no errors; they retained three known performance warnings for separate owner/staff update policies on listings, events, and media. The production workflow runs linked advisors both before and after migration application and blocks on advisor errors.
