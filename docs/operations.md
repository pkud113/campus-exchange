# Campus Exchange production runbook

## Release boundary

Production is `https://campus-exchange.net`, the Supabase project is `campus-exchange`, and the Cloudflare Workers are `campus-exchange-web` and `campus-exchange-worker`. The NCES IPEDS directory makes 6,072 institutions searchable but grants no access by itself. Campus and exact-domain activation remains operator controlled: the reviewed v1 domain set activates its documented 17 colleges transactionally; every later campus/domain defaults inactive or unreviewed. Staff accounts are invitation-only and may use domains outside the student allowlist.

Pushing `main` triggers `.github/workflows/deploy-production.yml`. Keep the GitHub `production` environment protected. Discussions remain private to each verified campus and are never included in cross-campus discovery.

## One-time prerequisites

Complete these before the Phase 1 push:

1. Upgrade Cloudflare Workers to Paid. The web Worker is limited to 100 ms CPU and the scheduled worker to 30 seconds. Keep the zone, R2, and Images on usage-based/free allowances.
2. Upgrade Supabase to Pro, enable the spend cap, confirm seven-day backups, and record the latest successful backup time.
3. Create an encrypted logical backup with `pg_dump` and verify it can be read before applying the migration.
4. In GitHub, create/protect the `production` environment and configure every secret listed below.
5. In Cloudflare, confirm `campus-exchange.net` routes to `campus-exchange-web`, `www` is proxied and redirects or routes to the same Worker, and `campus-exchange-media` is private.
6. In Resend, keep the verified sending domain, DKIM, SPF, and DMARC healthy. Use `Campus Exchange <access@campus-exchange.net>` for `EMAIL_FROM`.
7. Create a managed Turnstile widget for `campus-exchange.net` and `www.campus-exchange.net`.

## GitHub production secrets

- `SUPABASE_URL`: `https://<project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the browser-safe publishable/anon key
- `SUPABASE_SECRET_KEY`: the server-only secret/service-role key
- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token used by the CLI and Auth configuration API
- `SUPABASE_DB_PASSWORD`: the production database password
- `SUPABASE_DB_URL`: direct/pooler PostgreSQL URL used only by the encrypted backup workflow
- `SUPABASE_PROJECT_REF`: the project reference only
- `BACKUP_ENCRYPTION_PASSWORD`: high-entropy backup key stored separately from the backup bucket
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`: Workers Scripts/Routes, R2, and account read permissions scoped to this account/zone
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`: `Campus Exchange <access@campus-exchange.net>`
- `DOMAIN_VERIFICATION_SECRET`: at least 32 random characters, generated independently of Supabase/Resend keys and used only for pending-domain HMACs

Never put secret/service keys in a `NEXT_PUBLIC_` value, a repository file, a screenshot, or browser storage. Rotate any credential that has been exposed.

## Deployment sequence

1. Verify the paid plans, spend caps, backups, DNS, and email-domain status.
2. Run locally: `supabase db reset`, `supabase db lint --local --schema public,private --level error --fail-on error`, `supabase test db --local supabase/tests`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm audit --prod --audit-level high`.
3. Review all unapplied migrations, `data/institutions/ipeds-hd2024.json`, its pinned source URL/hash/count, and `data/college-directory.v1.json`; confirm every enabled domain still matches its first-party source, run linked Supabase security/performance advisors, and take the fresh logical backup.
4. Push the reviewed commit to `main` and approve the protected `production` workflow.
5. The workflow validates credentials, runs verification, ensures R2 exists, deploys the forward-compatible outbox worker, applies additive migrations, configures Supabase Auth, installs the web runtime secrets (including the pending-domain HMAC secret) before the new web code can receive traffic, deploys the web Worker, and checks apex/`www` health. Do not reverse the worker/migration ordering when new outbox types are present.
6. Confirm the workflow and `/api/health` are green. Confirm public pages load, authenticated responses use `private, no-store`, and the service worker contains no authenticated routes.
7. Keep `auth_v2_enforced` disabled during the first smoke test. Existing accounts remain usable; new accounts already use the v2 setup flow.
8. Provision the first administrator and enroll MFA as described below.
9. Run the production smoke and isolation checklist.
10. Enable v2 for existing accounts with `pnpm auth:v2 -- --enable` from a trusted operator machine containing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
11. Verify an existing passwordless account is sent to `/onboarding`, completes one OTP verification at `/register`, retains its username, creates a 12+ character password, and can then sign in with email or username.
12. After at least one complete existing-user migration succeeds, remove the production-environment approval only if automatic deploys are desired.

Emergency cutover rollback: run `pnpm auth:v2 -- --disable`. This restores existing-account access at the RLS and application layer without reverting the schema. It does not weaken requirements for newly pending accounts or staff MFA.

## Staff invitation and MFA

Run from a trusted operator environment; never run this command in a browser or expose the secret key:

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<server-only-key>"
$env:APP_ORIGIN = "https://campus-exchange.net"
$env:RESEND_API_KEY = "<resend-key>"
$env:EMAIL_FROM = "Campus Exchange <access@campus-exchange.net>"
pnpm admin:invite -- --email admin@example.com --campus campus-slug --role admin
```

The invitation expires after 24 hours and is stored as a SHA-256 email hash. The recipient visits `/register`, requests a code, establishes an immutable username and password, then enrolls TOTP at `/settings`. Moderation pages and APIs remain unavailable until the session reaches AAL2. Moderators cannot suspend staff; an administrator is required.

## Campus and network operator controls

Run all commands from a trusted operator machine with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Mutations preview unless `--apply` is supplied; always preview, apply, and then run `list` as readback.

```powershell
pnpm campus:admin -- list
pnpm campus:admin -- institutions --query "Michigan"
pnpm campus:admin -- institution --id ipeds:171100 --action status --registration-status open --reviewer operator-id
pnpm campus:admin -- upsert --campus campus-alpha --name "Campus Alpha" --short-name Alpha --timezone America/Chicago
pnpm campus:admin -- upsert --campus campus-alpha --name "Campus Alpha" --short-name Alpha --timezone America/Chicago --apply
pnpm campus:admin -- institution --id ipeds:123456 --action link --campus campus-alpha --reviewer operator-id --apply
pnpm campus:admin -- domain --campus campus-alpha --institution ipeds:123456 --domain students.alpha.edu --action add --apply
pnpm campus:admin -- domain --campus campus-alpha --institution ipeds:123456 --domain students.alpha.edu --action review --kind student --source-url "https://alpha.edu/official-student-email-policy" --reviewer operator-id --confidence high --apply
pnpm campus:admin -- domain --campus campus-alpha --domain students.alpha.edu --action enable --apply
pnpm campus:admin -- status --campus campus-alpha --status enabled
pnpm campus:admin -- status --campus campus-alpha --status enabled --apply
pnpm campus:admin -- list
```

Campus creation never activates a campus. `domain --action add` creates an unreviewed, disabled mapping; review requires a qualifying kind and official HTTPS source, and enable remains a separate action. Enabling a campus requires at least one reviewed qualifying enabled exact domain. The database prevents two campuses from enabling the same exact domain. Disabling or removing the last enabled domain is refused unless `--confirm-last-domain` is explicitly supplied. Suspending/disabled campuses immediately fail active-member checks and disappear from network discovery; do not use that control without reviewing active-user impact.

### Institution and verified-domain review

Registration requires an IPEDS institution selection plus a school email. The selection is never authoritative. Reviewed exact-domain matches receive the normal Supabase registration OTP; every other eligible institution receives a separate ten-minute ownership code through Resend. Completion stores an HMAC of the address, the normalized domain, and institution ID. It creates no Auth user, profile, campus, or domain mapping.

Review verified demand from a trusted operator machine:

```powershell
pnpm campus:admin -- domain-requests --status pending
pnpm campus:admin -- domain-request --id <request-uuid> --action review --reviewer operator-id --confidence medium
pnpm campus:admin -- domain-request --id <request-uuid> --action review --reviewer operator-id --confidence medium --apply
```

Research the exact student address using an official institution IT, registrar, admissions, catalog, or student-policy page. IPEDS confirms institution identity, not email domains. For an institution without a linked campus, create one disabled campus and link the existing directory record; do not create a duplicate institution:

```powershell
pnpm campus:admin -- upsert --campus example-state-university --name "Example State University" --short-name "Example State" --timezone America/Chicago --city Example --region IL --apply
pnpm campus:admin -- institution --id ipeds:123456 --action link --campus example-state-university --reviewer operator-id --apply
pnpm campus:admin -- domain-request --id <request-uuid> --action approve --campus example-state-university --kind student --source-url "https://example.edu/official-student-email-policy" --reviewer operator-id --confidence high
pnpm campus:admin -- domain-request --id <request-uuid> --action approve --campus example-state-university --kind student --source-url "https://example.edu/official-student-email-policy" --reviewer operator-id --confidence high --apply
pnpm campus:admin -- domain --campus example-state-university --domain students.example.edu --action enable --apply
pnpm campus:admin -- status --campus example-state-university --status enabled --apply
pnpm campus:admin -- list
```

`--enable-domain` may be added to approval only after collision/shared-campus review; campus activation remains separate. Mark shared physical-campus domains with `domain --action review --kind shared`, alumni domains with `--kind alumni`, and rejected evidence with `--action reject`. None can be enabled. Use `domain-request --action duplicate|reject` with non-sensitive notes. Merge duplicate directory identities atomically with `institution --id ipeds:SOURCE --action duplicate --into ipeds:CANONICAL --reviewer operator-id --apply`. Suspend request/registration intake with `institution --action status --registration-status suspended`; this also prevents already approved student registration through that directory selection. All mutations audit evidence metadata but must never log full emails, codes, credentials, or private student data.

### IPEDS refresh

Download a newer official `HD<year>.zip` only from the NCES IPEDS Data Center. Do not replace the pinned artifact silently. Review dictionary/lifecycle changes, update the importer year, expected row count, and SHA-256, run it against the extracted CSV, inspect added/removed/renamed/merged records, and create a new forward migration. Preserve old UNITIDs and operator links; mark disappeared records inactive/merged rather than deleting them. Run the complete reset, pgTAP, lint, advisors, typecheck, tests, build, and dry-run deployment before approval.

Recommended runtime defaults are `network_features_enabled=true`, `message_request_daily_limit=10` per rolling 24 hours, `message_request_decline_cooldown_days=14`, and `blocked_conversation_visibility=read_only`. These are operational defaults, not permanent product constants:

```powershell
pnpm campus:admin -- setting --key network_features_enabled --value false --apply
pnpm campus:admin -- setting --key message_request_daily_limit --value 10 --apply
pnpm campus:admin -- setting --key message_request_decline_cooldown_days --value 14 --apply
pnpm campus:admin -- setting --key blocked_conversation_visibility --value read_only --apply
```

Platform moderation is separate from campus administration and still requires an AAL2 session. Grant it only after reviewing the target account and campus role: `pnpm campus:admin -- platform-role --username handle --role moderator --action grant --apply`.

## Production smoke and isolation checklist

- Registration: search active, closed, merged, Michigan, and Purdue directory entries; test MSU plus several reviewed launch domains; verify wrong-college mismatch, alumni/disabled rejection, shared-domain pending routing, ownership-code expiry/replay, no Auth user for pending requests, immutable server-derived campus assignment, and duplicate username rejection.
- Existing account: one final OTP, retained username, password setup, then username/email login.
- Recovery: identical start response for known/unknown identifiers, six-digit recovery code, new password, other sessions revoked.
- Session isolation: account A signs in, views profile/messages, logs out, account B signs in in the same browser, Back is used, and no account-A HTML/API/message data appears. Inspect Cache Storage to confirm only public shell assets exist.
- Profiles: same-campus behavior, safe global search/profile projection, excluded inactive/suspended/blocked accounts, avatar/banner authorization, and no broad cross-campus profile-table reads.
- Listings/events: campus-only default, explicit network visibility, truthful legacy exchange display, exchange validation on edit, campus filters, cross-campus RSVP rules, narrowing safeguards, immediate soft delete, and owner/cross-user denial.
- Upload abuse: spoofed MIME, invalid decoded bytes, >8 MB, seventh listing image, another user’s media, deleted media, and original R2 URL denial.
- Messaging: direct/listing/event opening request, incoming/sent states, idempotent retry, daily limit, decline cooldown, transactional accept/first-message insertion, global block cancellation, read-only blocked history, unread recovery, and duplicate rejection.
- Moderation: campus scope for creator-campus content, platform scope for eligible global abuse, denial without role/AAL2, protected report snapshot, staff safeguards, server-derived report routing, and append-only audit entries without message bodies or secrets.
- Theme/PWA: system default, persisted light/dark override without flash, Turnstile theme, installability, offline public shell, and no offline mutation/private content.
- Operations: Worker cron health, outbox retry/dead-letter behavior, R2 cleanup, pending-account purge, structured logs without email/message/OTP/signed URL values.
- Discussions: create a community with an immutable lowercase slug; verify automatic owner membership; join/leave from another verified profile; transfer ownership before the original owner leaves.
- Discussion posts: create text, HTTPS link, and private-image posts; verify Hot/New/Top/Most Commented cursors; ensure pinned posts lead only inside their own community; edit and soft-delete an owned post.
- Discussion threads: create a root comment and replies through depth eight, reject depth nine, preserve tombstones after deletion, reject new comments on locked/removed/deleted/archived targets.
- Discussion engagement: add/repeat/switch/clear post and comment votes, save/unsave repeatedly, and confirm authoritative scores/counters never drift.
- Community moderation: appoint/remove a moderator, ban/unban a member, pin/lock/remove/restore content, archive/unarchive, and verify append-only audit rows and generic notifications for each eligible action.
- Discussion reports: report a community, post, and comment; confirm protected snapshots are visible only to eligible community moderators or same-campus AAL2 staff.
- Discussion isolation: verify cross-campus reads and every mutation fail; verify suspended/banned users cannot participate; verify staff global moderation fails without AAL2 and cannot transfer or assume ownership.
- Discussion privacy: inspect browser cache/storage to confirm no discussion HTML/API/media is publicly cached; verify no service-role key or original R2 URL reaches the browser.
- Discussion operations: inspect oldest outbox age/dead letters, discussion report backlog, database load, abandoned attachment cleanup, and 30-day tombstone/media purging.

## Backups, retention, and maintenance

Supabase Pro supplies daily backups with seven-day retention. Copy an encrypted weekly `pg_dump` to a separate private R2 backup bucket; retain eight weekly and twelve monthly copies. Perform an isolated restore drill before launch and quarterly. Target RPO is 24 hours and RTO four hours.

The scheduled Worker processes outbox events and maintenance. Pending accounts older than 24 hours are deleted. Listings/events/media soft-delete immediately and are permanently purged after 30 days; R2 objects are removed before media rows. Discussion posts/comments retain structural tombstones but purge bodies, links, private attachments, moderation reasons, and permitted author references after 30 days. Deleted community slugs remain reserved. Ready discussion media that never binds to a target is removed after 24 hours.

## Monitoring and cost controls

Alert on API 5xx above 2% for five minutes, read p95 above 300 ms, write p95 above 500 ms, oldest outbox event above five minutes, any dead letter, database CPU above 70% for 30 minutes, realtime connections above 400, and reports older than four hours. Monitor slow discussion feed/search queries, vote/save counter drift, cleanup backlog, and community moderation volume. Set projected-cost alerts at $50 and $75. Logs must exclude discussion bodies, message bodies, email addresses, codes, signed URLs, and credentials.

## Discussions kill switch and rollback

`public.runtime_settings.discussions_enabled` defaults to `true`. In an incident, set it to `false` from a trusted operator session to hide discussion navigation on the next application release and make discussion APIs/RLS return no usable data. Do not remove additive discussion tables during emergency rollback.

Rollback order: disable Discussions, redeploy the prior known-good web and scheduled worker artifacts, verify marketplace/events/messaging/authentication, then investigate. The timestamped migration is forward-compatible and remains applied. Re-enable only after database/RLS checks, outbox health, media access, cross-campus isolation, and the full discussion smoke checklist pass.

## Network feature disable and rollback

Disable new cross-campus discovery and global requests with `pnpm campus:admin -- setting --key network_features_enabled --value false --apply`. This does not delete data, change campus membership, make Discussions global, or remove accepted conversation history. Existing accepted cross-campus conversations remain readable and messageable unless blocked; campus-only discovery continues.

The migration is additive and backfills existing listings/events to campus-only. Legacy listings keep a truthful unspecified-exchange state until edited. Before deploying a prior web artifact, disable `network_features_enabled` so its campus-only loaders cannot render network rows. Leave the migration applied; added columns have compatible defaults. Legacy no-opening contact RPC signatures remain present but fail closed. A rolled-back client can create a draft with truthful unspecified exchange data, but publishing/materially editing that draft remains disabled until the current exchange-method form is restored. Do not down-migrate or fabricate exchange methods. In a severe messaging incident, retain the forward-compatible worker and investigate outbox/Realtime/RLS state before reopening.

Scale PostgreSQL vertically only after sustained CPU/latency pressure. Keep PostgreSQL search until indexed search misses its target and revisit realtime before 500 concurrent connections.

## Incident response

Assign an incident owner, preserve a private timeline and audit records, disable the affected feature or auth-v2 switch, revoke exposed keys, contain abusive accounts, and recover from the last known-good version/backup. Run smoke tests before reopening. Rotate credentials and notify affected users when required.
