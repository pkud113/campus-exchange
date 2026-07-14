# Campus Exchange

Campus Exchange is an MSU-only marketplace and events PWA. It is a TypeScript modular monolith built with Next.js, Cloudflare Workers/R2/Images, Supabase PostgreSQL/Auth/Realtime, and a scheduled outbox worker.

Phase 1 includes password-based authentication with one-time-code registration and recovery, immutable usernames, private campus profiles and media, owned listings/events, direct conversation requests, persisted messaging/unread counts, moderation with MFA, soft deletion, themes, and an authenticated-data-safe PWA shell.

## Local development

1. Install Node.js 22, pnpm 10.12.1, Docker Desktop, and the Supabase CLI.
2. Copy `.env.example` to `apps/web/.env.local` and fill the local Supabase and Turnstile values. Turnstile may be omitted locally.
3. Run `pnpm install`.
4. Run `supabase start`, then `supabase db reset`.
5. Run `pnpm dev` and open `http://localhost:3000`.

The landing page works without credentials. Authenticated features require all migrations in `supabase/migrations`.

## Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. The worker build is a Wrangler dry run and the web build is the production Next.js/OpenNext build.

## Production

Production targets `https://campus-exchange.net`. Do not push the Phase 1 release to `main` until Cloudflare Workers Paid and Supabase Pro are active: `main` currently triggers the protected production deployment workflow.

Follow [the production runbook](docs/operations.md) in order. It includes the backup, secret inventory, staff invitation, MFA, auth-v2 cutover, smoke tests, rollback, and user actions that cannot be automated from the repository.
