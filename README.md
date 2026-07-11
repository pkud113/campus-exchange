# Campus Exchange

Campus Exchange is a verified-student marketplace and campus events PWA. It is a TypeScript monorepo built for Cloudflare Workers, Supabase PostgreSQL/Auth/Realtime, private R2 media, and low-cost operation.

## Quick start

1. Install Node.js 20+ and pnpm 10.
2. Copy `.env.example` to `apps/web/.env.local` and provide a Supabase project URL and publishable key.
3. Run `pnpm install`, then `pnpm dev`.
4. Start local Supabase and apply `supabase/migrations` before using authenticated features.

The public landing page and product preview render without credentials. API routes return a structured `service_unconfigured` response until Supabase is configured.

See `docs/operations.md` for deployment, budgets, backup, incident, and scaling procedures.
