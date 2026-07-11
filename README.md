# Campus Exchange

Campus Exchange is a verified-student marketplace and campus events PWA. It is a TypeScript monorepo built for Cloudflare Workers, Supabase PostgreSQL/Auth/Realtime, private R2 media, and low-cost operation.

## Quick start

1. Install Node.js 20+ and pnpm 10.
2. Copy `.env.example` to `apps/web/.env.local` and provide a Supabase project URL and publishable key.
3. Run `pnpm install`, then `pnpm dev`.
4. Start local Supabase and apply `supabase/migrations` before using authenticated features.

The public landing page and product preview render without credentials. API routes return a structured `service_unconfigured` response until Supabase is configured.

See `docs/operations.md` for deployment, budgets, backup, incident, and scaling procedures.

## Production

Production is deployed to `https://campus-exchange.net` through the manual **Deploy production** GitHub Actions workflow. Configure its protected `production` environment and encrypted secrets before the first run. The workflow applies Supabase migrations, provisions private R2 media storage, deploys the web and outbox Workers, installs runtime secrets, and verifies `/api/health`.
