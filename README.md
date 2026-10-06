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

## Pages

| Page | What it is |
|---|---|
| Today | Revenue (per currency — never mixed), businesses, POS terminals, open support tickets |
| Businesses / detail | Every tenant. Suspend or reactivate, set the device cap, extend a trial, revoke a sync device, see desktop logins and recent shifts |
| Users | **Desktop logins** (`staff_accounts` — what the desktop app signs in with) and **web members** (`business_members`) |
| Telemetry, Sync Health | Crash/error logs and workstation activity from the desktop app |
| Billing | Subscription status, trial and period end, Stripe ids |
| Admins | Who can sign in to this portal (`super_admins`). Add, deactivate, reactivate |

## How it stays in step with the desktop app

The portal never talks to a customer's computer. It changes the cloud `businesses` / `staff_accounts` / `sync_devices` rows, and the
desktop app (`finfitai/debbitbyasarp`) picks the change up through its normal sync:

| You do this here | Cloud effect | What the desktop does |
|---|---|---|
| Suspend a business | `businesses.is_active = false` | The next sync-pull delivers it; the app locks with "This business has been suspended". The cloud also refuses that business's uploads (`sync-ingest` → 403 `business_suspended`) while still letting it pull, so the computer learns it is suspended |
| Set the device cap | `businesses.device_limit` | Enforced when a computer signs in |
| Extend a trial | `trial_ends_at` pushed out | The access lock lifts at the next sync |
| Disable a desktop login | `staff_accounts.is_active = false` | Refused on that person's next sync request (checked on every call) |
| Revoke a sync device | `sync_devices.revoked_at` set | That computer's next request gets "Device revoked" |

A computer can never undo these: `sync-ingest` strips `is_active`, `device_limit`, `subscription_status`, `trial_ends_at`,
`current_period_end` and the Stripe ids from anything a computer uploads for its own `businesses` row.

## Notes for working on this

- Money columns are in the business's own currency (the desktop stores `sales.total` in main units, shifts in `*_sen`).
- PostgREST returns at most 1,000 rows per request. Anything that must see every row goes through `_shared/paginate.ts`
  (`fetchAll`) or is summed in SQL (`086_admin_portal_aggregates.sql`).
- `staff_accounts` and `shift_reconciliations.cashier_id` have no foreign keys, so those joins are done in the function, not with a
  PostgREST embed.
- `npm run test:edge` runs every Edge Function against a real Postgres + PostgREST built from the debbit migrations
  (see `scripts/edge-test/README.md`).

