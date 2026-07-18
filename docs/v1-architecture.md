# Campus Exchange V1 architecture

Status: frozen for the three-step V1 completion program. Last reviewed: 2026-07-18.

This document defines the target product and technical boundaries for Campus Exchange V1. The companion [feature matrix](./v1-feature-matrix.md) is the release source of truth, and the [Step 1 plan](./v1-step-1-plan.md) records implementation order, migration risks, and verification gates.

## Product boundary

V1 is a verified, multi-campus student platform with eleven connected product areas:

1. Home: a personalized campus and network overview.
2. Marketplace: listings, favorites, seller contact, exchange methods, and lifecycle management.
3. Social: profile and organization posts, media, reactions, comments, and visibility-aware feeds.
4. Organizations: campus and approved network organizations, memberships, roles, content, events, and moderation.
5. Events: discovery, creation, editing, RSVP, organization ownership, and activity notifications.
6. Discussions: campus-private communities, ranked posts, threaded comments, membership, and scoped moderation.
7. Messages: private conversations, context-aware message requests, unread state, and blocking.
8. Notifications: in-app and outbox-backed delivery with per-category preferences.
9. Search: one visibility-aware query surface for people, listings, organizations, events, communities, and social posts.
10. Profiles: student identity, academic details, interests, activity, friends, memberships, and privacy controls.
11. Trust and safety: reports, blocks, campus moderation, platform moderation, auditability, and staff MFA.

Private email addresses, verification codes, secrets, signed media URLs, message bodies, and report evidence are never public profile or analytics data.

## Current architecture

The repository is a pnpm TypeScript modular monolith:

- `apps/web`: Next.js 15 App Router PWA and versioned `/api/v1` trusted-server endpoints.
- `apps/worker`: Cloudflare scheduled worker for idempotent outbox delivery and retention maintenance.
- `packages/contracts`: Zod request/response contracts and OpenAPI assembly.
- `packages/domain`: environment-neutral domain helpers.
- `supabase`: PostgreSQL 17 migrations, RLS policies, locked RPCs, seed data, and pgTAP suites.
- `data`: versioned institution and reviewed-domain source data.
- `.github/workflows`: reset, lint, pgTAP, TypeScript, ESLint, unit, build, Playwright, audit, backup, and deployment gates.

At the architecture freeze, complete or substantially complete verticals were authentication/onboarding, reviewed institution registration, marketplace, events, cross-campus discovery, message requests and messaging, notifications/preferences, discussions, blocking/reporting, staff moderation, private media, outbox delivery, and operational controls. Step 1 has since added the secure foundations for friends, organizations, social posts, unified search, expanded profiles, notification categories, and the mobile-ready shared package surface; the feature matrix records their verified readiness and remaining Step 2 UX work.

## Target repository architecture

```text
apps/
  web/          Next.js web and mobile-web client; trusted API boundary
  worker/       Outbox delivery and scheduled retention
  mobile/       React Native/Expo architecture and configuration only in Step 1
packages/
  contracts/    Versioned Zod API request/response schemas
  domain/       Framework-neutral business rules and state transitions
  api-client/   Typed fetch client usable by web and future mobile
  validation/   Shared form/domain validation primitives
  design-tokens/Theme-neutral token values for web and native adapters
  analytics/    Typed event names and privacy-safe payload schemas
  shared-types/ Stable identifiers, pagination, visibility, and error types
  testing/      Factories and contract-test utilities without production secrets
```

DOM-specific React components remain in `apps/web`. A future React Native application consumes contracts, domain logic, validation, analytics names, types, and tokens, but not HTML components or CSS.

## Roles and permissions

| Role | Scope | Capabilities |
| --- | --- | --- |
| Visitor | Public | Landing, safety, registration, sign-in, recovery, and public health metadata only. |
| Pending student | Own account | Complete verified onboarding; no member content access. |
| Active student | Verified campus plus allowed network content | Use all student product areas subject to visibility, privacy, blocks, membership, and ownership. |
| Organization member | One organization | Read member-visible areas and participate according to organization policy. |
| Organization officer | One organization | Manage assigned content and events; cannot grant higher roles. |
| Organization administrator | One organization | Manage members, invitations, content, settings, and officers; cannot remove the owner. |
| Organization owner | One organization | Full organization administration and ownership transfer; ownership is singular. |
| Community moderator | One discussion community | Moderate membership and content inside the community only. |
| Campus moderator | One campus, AAL2 | Review campus-scoped reports and moderate eligible campus content; no role escalation. |
| Campus administrator | One campus, AAL2 | Campus moderation plus staff role administration subject to staff safeguards. |
| Platform moderator/admin | Network-eligible content, AAL2 | Resolve routed network abuse and platform operations; cannot silently assume organization/community ownership. |
| Service worker | Server secret | Claim bounded outbox batches and perform documented retention only. |

All authorization is enforced in PostgreSQL RLS or locked trusted-server/RPC paths. UI role checks only control presentation.

## Design-system ownership

- `packages/design-tokens/src/tokens.css` is the web semantic-token adapter; native clients consume the platform-neutral TypeScript values from the same package.
- `apps/web/app/redesign.css` owns the final V1 shell and component layer. Proven route-specific selectors that are not yet primitives are isolated behind `apps/web/app/legacy-compat.css`; new work must not extend that boundary or `globals.css`.
- Accessible server-renderable primitives live in `apps/web/components/ui.tsx`. Stateful DOM primitives live in `ui-interactive.tsx`, keeping server routes free from unnecessary client JavaScript.
- DOM-specific React components remain in `apps/web`; future React Native components share contracts, validation, analytics names, and tokens without importing DOM code.

## Visibility and network context

Every discoverable content row declares a visibility value and an authoritative owning campus.

| Visibility | Audience | Rules |
| --- | --- | --- |
| `campus` | Active members of the owning campus | Default for student-created content and always used by Discussions. |
| `network` | Active members of enabled campuses | Explicit opt-in; runtime network switch, blocks, suspension, and content status still apply. |
| `friends` | Accepted friends of the author plus the author | Profile/social content only; blocked relationships always override. |
| `members` | Active members of the owning organization/community | Organization resources only; Discussions continue to use their existing campus-private model. |
| `private` | Owner or explicit participants | Drafts, requests, conversations, moderation evidence, and private settings. |

No client-supplied campus assignment is trusted. Campus derives from the active server-side profile and a reviewed exact email-domain mapping. Content can never become broader through an edit unless the actor has the relevant permission and all cross-campus safety checks pass.

## Primary user journeys

### Join and verify

Search the institution directory, submit a school email, resolve its exact reviewed domain server-side, verify OTP, choose an immutable username, complete profile basics, establish a password, and enter the campus home. Unsupported or ambiguous domains create only a privacy-preserving review request.

### Discover and connect

Use global search or contextual discovery, inspect a safe student projection, send a friend request or a contextual message request, and receive an idempotent notification. Acceptance is transactional. Blocking cancels pending interactions and prevents new contact.

### Marketplace exchange

Search/filter listings, inspect visibility and exchange methods, favorite or request contact, agree in private messages, and let the owner reserve/sell/withdraw. Campus-only is the default; network scope is explicit.

### Social and organizations

Create a profile post or post as an authorized organization role, choose allowed visibility, attach private media, and receive reactions/comments. Join or request membership in an organization, accept invitations, RSVP to organization events, and participate without gaining administrative privileges.

### Discussions

Join a campus-private community, create a text/link/image post, vote, save, comment to depth eight, report abuse, and observe tombstones after deletion. Community and campus moderation stay separate.

### Safety and moderation

Report a supported target, capture a protected evidence snapshot, route it by owning campus or network scope, require AAL2 and an eligible staff role, record an append-only action/audit entry, notify affected users generically, and retain/purge according to policy.

## Information architecture

Desktop uses a persistent, collapsible sidebar. Mobile web uses a compact header, five-item bottom navigation, and an accessible drawer for the complete hierarchy.

Primary navigation order:

- Home
- Marketplace
- Social
- Organizations
- Events
- Discussions
- Messages

Global utilities:

- Search
- Notifications
- Create menu
- Campus/network context
- Account menu with Profile, Settings, Safety, Theme, and Sign out

Management areas:

- My listings, events, posts, organizations, saved items, friend requests, and message requests
- Campus Moderation for campus staff
- Platform Moderation for platform staff

Every primary page uses a shared page header containing title, concise context, campus/network scope when relevant, and one canonical creation action. Tabs are used only for peer views within a product area. Empty states explain why the state is empty and offer only actions that work.

## Data ownership and invariants

- Profiles are owned by their auth user; campus, account status, staff status, and verification fields are server-managed.
- Friend relationships are a single canonical unordered pair. A pair has at most one current state and cannot coexist with a block.
- Organizations have one immutable campus owner context, one owner, explicit member roles, and transactional ownership transfer.
- Social posts are owned by a profile or organization, never both. Organization authorship requires an eligible active role.
- Listings and events retain their creator campus even when network-visible.
- Conversations have explicit participants and preserve their original campus/context metadata.
- Notifications belong to one recipient and use deterministic `(event, recipient, category)` identity.
- Reports preserve protected snapshots; ordinary readers never receive snapshot data.
- Soft-deleted content becomes immediately non-participatory and is purged or tombstoned according to the documented retention class.
- Blocks are global and override discovery, friends, invitations, requests, feeds, comments, reactions, and messaging.

## Moderation boundaries

Campus staff can act only on content owned by their campus unless a separately assigned platform role authorizes network moderation. Organization administrators moderate their organization but cannot suspend accounts. Community moderators moderate only their community. Staff cannot transfer or assume organization/community ownership. Ordinary organization/community roles cannot grant a role equal to or higher than their own. Every privileged mutation requires a non-sensitive request ID and creates an append-only audit record.

## API conventions

- All product endpoints live under `/api/v1` and are `force-dynamic` where authenticated data is involved.
- Mutations accept JSON, validate same-origin requests, authenticate with `getUser`, enforce active verification and feature settings, consume a named rate limit, and validate a Zod contract.
- IDs use UUIDs and opaque cursor strings. Timestamps are ISO 8601 UTC. Enums use `snake_case` values.
- Collection reads use bounded keyset pagination; offset pagination is limited to small operator directories.
- Responses use `{ data, meta? }` for success and the shared error envelope for failure.
- Idempotent mutations accept `Idempotency-Key` or a contract `requestId`; the database owns conflict prevention.
- Clients never send authoritative campus, role, owner, counter, report-route, or notification-recipient fields.
- Database functions default to invoker. Necessary definer implementations live outside exposed schemas, use an empty search path, fully qualify objects, validate `auth.uid()`/scope internally, revoke `PUBLIC`, and expose only narrow wrappers.
- New exposed tables explicitly grant only required operations to `authenticated` and enable RLS before use.

## Error-handling conventions

The stable error envelope is:

```json
{
  "error": {
    "code": "friend_request_conflict",
    "message": "This friend request can no longer be changed.",
    "requestId": "uuid",
    "fieldErrors": { "username": ["Username is unavailable."] }
  }
}
```

Expected mappings are: validation `400`, authentication `401`, authorization/origin `403`, absent or intentionally hidden resource `404`, conflict/idempotency `409`, rate limit `429`, and unexpected failure `500`. Public error text contains no secret, email, private body, SQL message, signed URL, or existence oracle. UI errors remain visible until dismissed or the input changes, focus the first invalid field where appropriate, and include a retry only when retrying is safe.

## Analytics conventions

Event names use `area.object.action` in past tense for completed actions and `area.view.opened` for views, for example `marketplace.listing.created`, `friends.request.accepted`, and `search.results.opened`.

Every event has `eventVersion`, anonymous `sessionId`, authenticated `actorId` only in trusted sinks, `campusId` where permitted, `surface` (`web_desktop`, `web_mobile`, `ios`, `android`), and a privacy-reviewed properties object. Never capture email, message/post/comment bodies, free-form report text, search queries that may contain personal data, media URLs, tokens, or full user-agent/IP values. Analytics failure never blocks a product mutation.

## Notification categories

- `friend_request`, `friend_accepted`
- `message`, `message_request`
- `social_reaction`, `social_comment`, `social_reply`
- `organization_invitation`, `organization_membership`
- `event_activity`
- `discussion_activity`
- `moderation_activity`
- `security_activity`

In-app notification rows are authoritative. Email/push are optional outbox channels controlled by category preferences except mandatory security notices. Workers derive deterministic notification/delivery IDs, suppress self-notifications, use generic copy, retry with capped backoff, and dead-letter visibly.

## Accessibility requirements

V1 targets WCAG 2.2 AA. All functions must be keyboard operable with a visible `:focus-visible` treatment; focus order follows reading order; dialogs/drawers trap focus, close on Escape, restore focus, and expose an accessible name; menus, tabs, comboboxes, alerts, and validation use correct semantics; touch targets are at least 44 by 44 CSS pixels; color is never the only signal; light/dark contrast meets AA; reduced-motion preferences disable nonessential animation; images have meaningful alt text or are decorative; loading and async results announce status without stealing focus. Desktop and mobile Playwright suites run serious/critical axe checks and overflow checks.

## Performance expectations

- Public/app route LCP: p75 under 2.5 seconds on a representative mid-tier mobile profile.
- INP: p75 under 200 ms; CLS under 0.1.
- Cached shell/static responses: p95 under 300 ms; authenticated read APIs under 500 ms; mutations under 700 ms excluding media transfer.
- Initial route JavaScript is budgeted and inspected; heavy editors/galleries load on demand.
- Feeds and search use indexed keyset pagination with page sizes at or below 50 and no N+1 loaders.
- Images use explicit dimensions, responsive sizing, modern formats, bounded decoding, and authenticated derivatives.
- RLS columns and feed/search sort keys are indexed; high-contention transitions lock rows in deterministic order.
- Outbox oldest pending age alerts at five minutes; dead letters alert immediately.

## Security guarantees preserved across Steps 1-3

1. Server-derived campus assignment from reviewed, current, exact-domain evidence.
2. Fail-closed auth, active-profile, verification, runtime-setting, and institution-status checks.
3. RLS on every exposed table with campus isolation and narrow network projections.
4. Explicit content visibility plus global block precedence.
5. AAL2 for campus/platform staff mutations and staff safeguards against privilege abuse.
6. Same-origin JSON mutations, typed validation, request IDs, and rate limiting.
7. Private media access through authorization checks; no original bucket URLs in clients.
8. Security-definer code isolated in unexposed schemas with empty search paths and explicit grants.
9. Append-only moderation/audit data and idempotent outbox delivery.
10. Reset, lint, pgTAP/RLS, type, lint, unit, build, Playwright, and dependency-audit release gates.
