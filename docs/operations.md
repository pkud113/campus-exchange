# Campus Exchange operations

## Environments and release flow

- Local development uses the Supabase CLI and seed domain `students.demo.edu`.
- Pull requests run type checks, unit tests, the Next.js build, and the Worker dry-run build.
- Preview deployments use a non-production Supabase project. Production secrets must never be exposed to previews.
- Production deploys the web Worker, applies reviewed SQL migrations, runs smoke tests, then deploys the outbox Worker.
- Replace the demo campus and email domain before inviting any users.

## Required production controls

1. Enable Supabase Pro spend cap and seven-day backups.
2. Set Cloudflare Worker CPU limits and billing alerts at $50 and $75 projected monthly spend.
3. Configure Turnstile on the sign-in page and set `TURNSTILE_SECRET_KEY`.
4. Store `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, and `CRON_SECRET` only as encrypted deployment secrets.
5. Require MFA for every account assigned `moderator` or `admin`; remove assignments immediately when staff leave.
6. Configure the R2 bucket as private. Only the authenticated media route may read it.
7. Set Resend SPF, DKIM, and DMARC before using school-email OTP in production.

## Monitoring and objectives

Watch request error rate, p50/p95 latency, database CPU and connection usage, realtime peak connections, oldest pending outbox age, email delivery failures, open report count, and oldest open report age. Alerts:

- API 5xx above 2% for five minutes.
- API read p95 above 300 ms or write p95 above 500 ms for fifteen minutes.
- Oldest pending outbox event above five minutes or any dead-letter event.
- Database CPU above 70% for thirty minutes.
- Realtime connections above 400, providing headroom below the initial 500-connection plan limit.
- Open moderation report older than four hours.

## Backup and restore

- Supabase provides daily production backups with seven-day retention.
- A scheduled CI job runs an encrypted `pg_dump` weekly and uploads it to a dedicated, private R2 backup bucket. Keep eight weekly and twelve monthly backups.
- Quarterly restore drill: create an isolated project, restore the newest logical backup, run row counts and integrity checks, execute authenticated smoke tests, record actual RPO/RTO, then destroy the isolated project.
- Target RPO is 24 hours and target RTO is four hours.

## Incident response

1. Declare an incident owner and open a private timeline.
2. Contain: disable affected feature flag, revoke keys, suspend abusive accounts, or stop the outbox Worker as appropriate.
3. Preserve audit records and relevant request IDs without exporting private message bodies.
4. Recover from the last known-good version or backup and run production smoke tests.
5. Notify affected users when required, rotate exposed credentials, and publish a blameless follow-up with corrective actions.

## Scaling rules

- Scale PostgreSQL vertically after sustained CPU or latency breaches; optimize slow queries and indexes first.
- Keep PostgreSQL full-text/trigram search until measured p95 search exceeds 300 ms after query/index tuning.
- Revisit realtime architecture before 500 concurrent connections.
- Extract a domain into a service only when it needs independent scaling, reliability, or team ownership.
- Social feeds, groups, rides, ratings, native apps, and payments remain outside the MVP.
