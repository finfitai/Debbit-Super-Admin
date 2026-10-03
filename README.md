# debbit OS — Super Admin Portal

Platform-level dashboard for debbit's owners: registered businesses, usage,
and who's paying vs. on trial. Separate from the main debbit app — its own
login (Supabase Auth, gated by the `super_admins` allowlist table), its own
deployment.

## Stack

- React + Vite + React Router, deployed to Vercel
- Supabase (Auth for login, Postgres for data, Edge Functions for every
  cross-tenant query — the browser only ever holds the anon key, never the
  service-role key)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Database & Edge Functions

`supabase/migrations/` and `supabase/functions/` are kept in sync with the
`debbit-os` Supabase project via its GitHub integration (Project Settings →
Integrations → GitHub) — every push to `main` applies new migrations and
redeploys changed functions automatically.

Every `admin-*` Edge Function starts by calling `requireSuperAdmin()`,
which verifies the caller's Supabase session belongs to an active row in
`super_admins` before touching any cross-business data with the
service-role key.

## AI proxy (`ai-proxy`) and the AI Usage page

Customers never hold an AI key. Desktops call the `ai-proxy` Edge Function,
signed with their per-device HMAC (same scheme as sync/telemetry). The proxy
enforces the kill switch, a per-business on/off flag, a per-minute rate limit
and a monthly token budget, forces the model and output cap configured in
`ai_global_config`, calls Anthropic with the server-side secret and records
token counts (never prompts or replies) in `ai_usage`.

- Secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
- Migration: `064_ai_proxy.sql`. Deploy: `supabase functions deploy ai-proxy admin-ai-usage`
- Portal: **AI Usage** page (usage per business, budgets, on/off, kill switch, model, prices)
- Offline test of the proxy logic: `npm run test:ai-proxy`
