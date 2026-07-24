# Campus Exchange V1 Step 2C implementation record

Step 2C removes reviewed exact-domain mappings as the normal registration bottleneck while preserving them as operational evidence and a rollback-compatible legacy path. It also completes the web product surfaces for directory-backed discovery, friends, message requests, organization workspaces, granular notifications, and AAL2-protected administration.

## Enrollment and provisioning

- Registration starts one Supabase email OTP after Turnstile, lifecycle, and consumer/disposable-domain validation.
- The trusted registration service stores the normalized email hash, selected institution, requester hash, assignment basis, and expiry in a one-time opaque enrollment grant. Only the grant ID is attached to Auth metadata.
- OTP completion re-reads the Auth email and atomically consumes the matching grant. Editable user metadata is never an authorization source.
- A campus is created only after verification. Provisioning uses directory name/alias/location, a collision-safe internal slug, and a predominant regional IANA timezone marked `region_default`.
- Existing institution-linked campuses are reused. Disabled campuses are enabled when registration remains active/open; suspended campuses fail closed.
- `umich.edu` uses explicit directory selection across Ann Arbor (`ipeds:170976`), Dearborn (`ipeds:171137`), and Flint (`ipeds:171146`) and records `shared_selected` with the exact institution ID.
- Membership verification history is protected, immutable evidence for onboarding and annual reverification. Completed campus membership cannot be switched through self service.
- `universal_onboarding_enabled` defaults to `false` for forward-compatible rollout. Expired grants and unconfirmed orphan Auth users have a bounded service-only cleanup path.

## Product completion

- Institution discovery is one accessible asynchronous combobox with debounce, cancellation, keyboard navigation, active-descendant semantics, and explicit loading/error/empty states.
- People, Marketplace, Events, Search, and Organizations use stable directory institution IDs in URLs. Server routes resolve them to campus IDs and apply filters before limits.
- Friends expose paged All, Incoming, and Sent boxes with server counts and privacy-aware mutual previews.
- Message requests have a dedicated incoming/sent management route with status history, context, paging, and complete request actions.
- Organization role administration uses forms, grouped permissions, authority previews, assignments, dependency-aware deletion, explicit channel override inheritance, and non-escalation enforcement.
- Channel reactions use atomic toggle semantics, aggregate viewer-aware counts, RLS, Realtime refresh, and the notification outbox.
- Normalized notification-category preferences coexist with migrated legacy settings. The worker evaluates category, organization, mute, and quiet-hour decisions; security and moderation remain mandatory in-app.

## Administrative control plane

Every privileged list, detail, and mutation API requires AAL2 and a centralized database capability/scope decision. Platform administrators receive full control; platform moderators receive platform safety/content/appeal access; campus administrators receive own-campus user/content/case and campus-moderator management; campus moderators receive own-campus case, appeal, and content actions only.

The console is sectioned across institutions, users, staff, cases/appeals, content domains, audit history, saved views, and allowlisted typed settings. Direct operational mutations require a reason and idempotency key, preserve protected before-state, use soft restriction/removal, and support restoration where the entity remains recoverable.

## Additive migrations

1. `20260724203845_v1_step_2c_universal_enrollment.sql`
2. `20260724203856_v1_step_2c_social_organizations_notifications.sql`
3. `20260724203907_v1_step_2c_administration_control_plane.sql`

The migrations are forward-only. Rollback disables universal onboarding or network discovery and deploys compatible worker/web artifacts; it does not remove additive schema, verification history, or moderation/audit evidence.

## Release order

1. Run reset, database lint, pgTAP, advisors, typecheck, lint, unit/contract/worker tests, build, authenticated desktop/mobile Playwright, Axe/overflow checks, and production dependency audit.
2. Deploy the forward-compatible worker.
3. Apply migrations with universal onboarding still disabled.
4. Deploy web and run enrollment/moderation health probes.
5. Enable universal onboarding through the allowlisted operational setting.
6. Run shared-domain, existing-campus, lazy-provisioning, cross-campus, staff-scope, appeal, restoration, and notification smoke tests.

The feature matrix is updated to complete only after these authorized end-to-end paths pass.

## Local release evidence

The release candidate passed a fresh local database reset, database lint with zero error-level results, 476 pgTAP assertions, all 157 unit/contract/worker tests, all 11-workspace typecheck and lint tasks, the worker dry-run and 63-route production web build, and 40 authenticated/public desktop/mobile Playwright scenarios. The browser matrix includes Axe and overflow checks, all organization/staff personas, and explicit `umich.edu` selection for Ann Arbor, Dearborn, and Flint. The production dependency audit reports no known vulnerabilities with Next.js 15.5.21, PostCSS 8.5.18, and Sharp 0.35.0.
