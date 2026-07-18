# Multi-campus design and operating contract

## Verified repository facts

- Campus membership remains mandatory on profiles and cannot be changed through authenticated profile grants.
- Discussions continue to store `campus_id` and use campus-private RLS, media, reports, and Realtime topics.
- Private media remains in R2 and is delivered only through the authenticated media route after database authorization.
- Conversation and notification Realtime topics remain private and participant/profile authorized.
- Existing campus roles, AAL2 moderation checks, report snapshots, append-only audit records, rate-limit storage, runtime settings, and the outbox worker are extended rather than replaced.
- The historical production-campus migration is not edited. A later forward migration adds a separately reviewable college-directory release without changing historical data.
- The comprehensive directory is NCES IPEDS HD2024 Institutional Characteristics directory data: 6,072 active, inactive, closed, and merged institution records with stable UNITIDs, lifecycle metadata, source URL, and pinned CSV SHA-256.

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
- Registration resolves the verified email's exact normalized domain server-side. Only one reviewed, qualifying, enabled domain mapping on one enabled campus can resolve; client metadata and campus IDs are ignored.
- Institution identity and email-domain eligibility are distinct. `data/institutions/ipeds-hd2024.json` supplies searchable institution records; `data/college-directory.v1.json` supplies the separately reviewed initial domain mappings. An IPEDS row alone never grants access or creates a campus.
- Every enabled mapping retains an official-university source URL, reviewer, confidence, and review date. New operator-created mappings remain disabled and unreviewed until explicitly reviewed and enabled.
- Multiple domains may map to one campus. A domain may have multiple disabled candidate mappings when it is shared, but the database prevents more than one active exact-domain mapping. Shared/ambiguous and alumni-only domains never qualify.
- Pending-domain intake requires a selected directory institution and a short-lived ownership code sent to the submitted school address. Challenges and requests store keyed email/requester hashes plus the normalized domain—not the full address. Successful ownership proof creates one idempotent pending request; it creates neither an Auth user nor a campus and is readable only with the service role.

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
- Email-domain control verifies possession of an institution-issued address; it is not equivalent to registrar enrollment verification. Student-specific subdomains are preferred where the university documents them, and annual re-verification limits stale access.
- IPEDS represents the federal postsecondary reporting universe and is not an email-domain source. HD2024 is a dated snapshot: operators must import later releases through the pinned importer, review source/hash changes, and retain closed/merged/renamed records instead of deleting identities.
- Some legitimate institutions outside the IPEDS reporting universe may be absent. They require a reviewed future directory source or operator-added inactive record; arbitrary signup input never creates one.

## Comprehensive institution directory and reviewed domains

The searchable institution artifact is NCES IPEDS HD2024, Institutional Characteristics: Directory information (`HD2024`). The repository pins the downloaded CSV SHA-256 (`d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5`), retains all 6,072 rows, and embeds the normalized records in the forward migration so production application is transactional. `CYACTIVE=1` rows are active; other records remain searchable as inactive, closed, or merged. Registration status is separately operator controlled.

The launch set is MSU (`msu.edu`), Illinois Urbana-Champaign (`illinois.edu`), Wisconsin-Madison (`wisc.edu`), Chicago (`uchicago.edu`), Northwestern (`u.northwestern.edu`), Notre Dame (`nd.edu`), Stanford (`stanford.edu`), UC Berkeley (`berkeley.edu`), Yale (`yale.edu`), Princeton (`princeton.edu`), Duke (`duke.edu`), Vanderbilt (`vanderbilt.edu`), Rice (`rice.edu`), Georgia Tech (`gatech.edu`), UT Austin (`my.utexas.edu`), Texas A&M (`email.tamu.edu`), and Dartmouth (`dartmouth.edu`).

Each source is an official university IT, registrar, admissions, catalog, or student-policy page that explicitly documents the student address. The JSON directory is the review artifact; the forward migration contains the same production rows so deployment is transactional. `umich.edu` and `purdue.edu` are recorded as disabled ambiguous candidates because official material shows those exact domains crossing separately operated physical campuses. Northwestern and Yale alumni-only domains are recorded as non-qualifying exclusions. An operator must review source changes and use a new forward migration for future bundled directory releases.

## Execution-environment observations

These are observations from the implementation workstation, not permanent repository requirements:

- Node.js reported `v22.18.0`; local pnpm reported `11.7.0`. The repository declares pnpm `11.13.0`, and CI installs Node 22 plus pnpm 11.13.0.
- Supabase CLI `2.109.1` was verified through the package runner and is pinned in the production workflow.
- A clean local database reset applied every migration and seed successfully. The final pgTAP run passed all 212 checks across four files; the monorepo Vitest run passed all 101 tests; TypeScript checks passed in all four packages.
- The production build completed locally, including the Wrangler worker dry run and Next.js/OpenNext application build. Local Supabase security/performance advisors reported no errors; they retained three known performance warnings for separate owner/staff update policies on listings, events, and media. The production workflow runs linked advisors both before and after migration application and blocks on advisor errors.
- Production dependency audit reported no known vulnerabilities. A localhost registration smoke test confirmed reviewed MSU is labeled supported, Michigan physical campuses remain distinct domain-review choices, and the selected directory institution is explicitly non-authoritative.
