-- =============================================================================
-- debbit OS · Migration 051 · Super Admin Portal
-- Run AFTER 050_extend_trial_to_one_month.sql
-- (Scaffolded in the debbit-super-admin repo as 029/030; renumbered here to
-- the real next-free slot in this repo's canonical migration sequence,
-- since 029/030 were already taken by 029_field_orders_geo.sql /
-- 030_field_attendance.sql.)
--
-- Creates a super_admins allowlist table.
-- Only rows in this table can access the Super Admin Portal.
-- RLS: no policies → only service role can write; authenticated users can
--       read their own row (used by the portal's AuthContext to gate access).
-- =============================================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE super_admins IS
  'Allowlist for the debbit OS Super Admin Portal. '
  'Insert a row here to grant platform-level access to a Supabase Auth user.';

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────
CREATE TRIGGER trg_super_admins_updated_at
  BEFORE UPDATE ON super_admins
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own row (used by the portal to verify access)
CREATE POLICY "super_admin_self_read"
  ON super_admins
  FOR SELECT
  TO authenticated
  USING (email = auth.email());

-- Service role (used by Supabase Studio / direct SQL) can do everything —
-- this is the default when RLS is enabled with no other policies for the role.

-- ── Seed template (uncomment and replace with your email) ────────────────────
-- INSERT INTO super_admins (email, full_name)
-- VALUES ('your-admin@email.com', 'Your Name')
-- ON CONFLICT (email) DO NOTHING;
