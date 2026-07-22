# Campus Exchange V1 Step 2A implementation record

Step 2A makes the profile the canonical personal-post ownership surface and keeps Social as a visibility-aware discovery feed. It is intentionally separate from Step 2B automated content moderation.

## Delivered behavior

- `/u/[username]` is the shared owner/visitor profile with URL-addressable Posts, Listings, Events, Organizations, and About tabs. `/profile` resolves to the signed-in profile; profile editing remains in Settings.
- Personal text/image posts are created and managed only from the owner profile. Social and Home are discovery/read surfaces and do not duplicate the composer.
- Social supports For You, Campus, Friends, and feature-gated Network filters before keyset pagination. Existing `/social?post=` links resolve to the connected post thread.
- Posts render existing private media, safe profile/organization attribution, reactions, comments, one-level replies, owner editing/soft deletion, and manual reporting through protected moderation snapshots.
- Profile tabs stay in one desktop row and become a single-line horizontal scroller on narrower viewports with roving keyboard focus.
- Home, Profile, Social, and navigation use the existing semantic design tokens with raised, subtle, accent, media, and borderless surface treatments.

## Data and authorization impact

Migration `20260722051631_v1_step_2a_social_profile.sql` adds functions only. It creates no tables, columns, enums, policies, or storage paths.

- `social_feed_filtered` applies audience/author filters before the existing RLS-protected cursor limit.
- Private-schema owner mutation functions update or soft-delete existing posts/comments and are exposed only through authenticated public invoker wrappers.
- Existing `private.can_read_social_post`, friendship/block rules, network feature switch, organization roles, media binding rules, report snapshots, moderation actions, and 30-day purge fields remain authoritative.

Rollback redeploys the prior web artifact and revokes/drops the new wrapper/private functions in a new forward migration. Existing rows need no transformation and remain readable by the prior application.

## Verification and release state

The local seed contains two synthetic Campus Alpha Playwright members (separate desktop/mobile identities) and one campus post; it is never applied by the production deployment workflow as production data. CI exports local Supabase credentials after reset so authenticated desktop/mobile Playwright projects can exercise Profile, Social, and Home without sharing mutable sessions.

Release remains approval-gated. Step 2A must pass database reset/lint/pgTAP, typecheck, ESLint, unit/contract tests, production build, authenticated desktop/mobile Playwright with Axe/overflow checks, and dependency audit before the branch is eligible to merge. Production merge and deployment are separate explicit approvals.

## Deferred work

- Automated content classification, policy scoring, automatic hiding, and automated enforcement are Step 2B.
- Organization-authored post creation remains on its existing foundation until the organization management UX is completed; existing organization posts render in discovery.
- Native mobile clients remain partial as recorded in the V1 feature matrix.
