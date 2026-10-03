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

## AI proxy and the AI Usage page

The AI key lives only on the server. The device-facing `ai-proxy` function and
its migration (`064_ai_proxy.sql`) live in the main repo (`debbitbyasarp`,
`supabase/`), next to sync/telemetry, because they authenticate against
`sync_devices`. This repo holds the **portal side**: the `admin-ai-usage`
function and the **AI Usage** page (usage per business, budgets, on/off, kill
switch, model, prices).

## One Supabase project

Everything uses `pzhwkjrznchbjdsdofsp` (see `docs/SUPABASE.md` in the main repo).
`VITE_SUPABASE_URL` in this portal's Vercel environment must be that project's URL.
