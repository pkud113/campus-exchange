# Campus Exchange production runbook

## Release boundary

Production is `https://campus-exchange.net`, the Supabase project is `campus-exchange`, and the Cloudflare Workers are `campus-exchange-web` and `campus-exchange-worker`. The MSU campus accepts only the explicit `msu.edu` domain. Staff accounts are invitation-only and may use other domains.

Pushing `main` triggers `.github/workflows/deploy-production.yml`. Keep the GitHub `production` environment protected and require manual approval while Phase 1 is rolling out.

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

Never put secret/service keys in a `NEXT_PUBLIC_` value, a repository file, a screenshot, or browser storage. Rotate any credential that has been exposed.

## Deployment sequence

1. Verify the paid plans, spend caps, backups, DNS, and email-domain status.
2. Run locally: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. Review the migration `supabase/migrations/202607130001_phase1_foundation.sql` and take the fresh logical backup.
4. Push the reviewed commit to `main` and approve the protected `production` workflow.
5. The workflow validates credentials, runs verification, applies migrations, configures Supabase SMTP/code templates, ensures R2 exists, deploys both Workers, installs runtime secrets, and checks apex/`www` health.
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
pnpm admin:invite -- --email admin@example.com --campus msu --role admin
```

The invitation expires after 24 hours and is stored as a SHA-256 email hash. The recipient visits `/register`, requests a code, establishes an immutable username and password, then enrolls TOTP at `/settings`. Moderation pages and APIs remain unavailable until the session reaches AAL2. Moderators cannot suspend staff; an administrator is required.

## Production smoke and isolation checklist

- Registration: MSU email, six-digit code, immutable username, 12-character password, duplicate username rejection.
- Existing account: one final OTP, retained username, password setup, then username/email login.
- Recovery: identical start response for known/unknown identifiers, six-digit recovery code, new password, other sessions revoked.
- Session isolation: account A signs in, views profile/messages, logs out, account B signs in in the same browser, Back is used, and no account-A HTML/API/message data appears. Inspect Cache Storage to confirm only public shell assets exist.
- Profiles: same-campus member search, avatar/banner upload, ownership rejection, and cross-campus denial.
- Listings/events: create, upload without `Content-Length`, edit, state transition/RSVP, immediate soft delete, and owner/cross-user denial.
- Upload abuse: spoofed MIME, invalid decoded bytes, >8 MB, seventh listing image, another user’s media, deleted media, and original R2 URL denial.
- Messaging: direct request pending/accept/decline/cancel, listing conversation immediate open, block denial, unread increment/read reset, reconnect recovery, duplicate request/message rejection.
- Moderation: direct page/API denial without role; denial without MFA; report snapshot only; edit/hide/delete content; suspend/restore member; append-only audit entry for every action.
- Theme/PWA: system default, persisted light/dark override without flash, Turnstile theme, installability, offline public shell, and no offline mutation/private content.
- Operations: Worker cron health, outbox retry/dead-letter behavior, R2 cleanup, pending-account purge, structured logs without email/message/OTP/signed URL values.

## Backups, retention, and maintenance

Supabase Pro supplies daily backups with seven-day retention. Copy an encrypted weekly `pg_dump` to a separate private R2 backup bucket; retain eight weekly and twelve monthly copies. Perform an isolated restore drill before launch and quarterly. Target RPO is 24 hours and RTO four hours.

The scheduled Worker processes outbox events and maintenance. Pending accounts older than 24 hours are deleted. Listings/events/media soft-delete immediately and are permanently purged after 30 days; R2 objects are removed before media rows.

## Monitoring and cost controls

Alert on API 5xx above 2% for five minutes, read p95 above 300 ms, write p95 above 500 ms, oldest outbox event above five minutes, any dead letter, database CPU above 70% for 30 minutes, realtime connections above 400, and reports older than four hours. Set projected-cost alerts at $50 and $75. Logs must exclude message bodies, email addresses, codes, signed URLs, and credentials.

Scale PostgreSQL vertically only after sustained CPU/latency pressure. Keep PostgreSQL search until indexed search misses its target and revisit realtime before 500 concurrent connections.

## Incident response

Assign an incident owner, preserve a private timeline and audit records, disable the affected feature or auth-v2 switch, revoke exposed keys, contain abusive accounts, and recover from the last known-good version/backup. Run smoke tests before reopening. Rotate credentials and notify affected users when required.
