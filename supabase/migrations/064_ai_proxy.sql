-- =============================================================================
-- debbit OS · Migration 064 · AI proxy: usage metering, budgets, kill switch
-- Run AFTER 063 (numbering continues the main repo's sequence).
--
-- The AI key lives ONLY in this project's Edge Function secrets
-- (ANTHROPIC_API_KEY). Desktops call the `ai-proxy` function with their
-- per-device HMAC; every call is metered here. Service role only (RLS on, no
-- policies) — the portal reads/writes through admin-ai-usage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_global_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_global_config (key, value) VALUES
  ('kill_switch',                 'false'::jsonb),
  ('model',                       '"claude-sonnet-5-5"'::jsonb),
  ('max_output_tokens',           '2048'::jsonb),
  ('default_monthly_token_budget','2000000'::jsonb),
  ('max_requests_per_minute',     '30'::jsonb),
  ('price_input_per_mtok',        'null'::jsonb),
  ('price_output_per_mtok',       'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_business_limits (
  business_id          UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_token_budget BIGINT,            -- NULL = use ai_global_config.default_monthly_token_budget
  note                 TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL,
  device_id             TEXT,
  request_id            TEXT,
  model                 TEXT,
  input_tokens          INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL CHECK (status IN ('OK','UPSTREAM_ERROR','BLOCKED_BUDGET','BLOCKED_DISABLED','BLOCKED_KILL_SWITCH','BLOCKED_RATE')),
  error                 TEXT,
  latency_ms            INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_biz_time ON ai_usage (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time     ON ai_usage (created_at DESC);

-- Metadata only: token counts and status. Prompts / replies are never stored.

CREATE OR REPLACE FUNCTION ai_usage_month(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (business_id UUID, requests BIGINT, input_tokens BIGINT, output_tokens BIGINT,
               cache_read_tokens BIGINT, blocked BIGINT, last_used TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT u.business_id,
         COUNT(*) FILTER (WHERE u.status = 'OK'),
         COALESCE(SUM(u.input_tokens)  FILTER (WHERE u.status = 'OK'), 0),
         COALESCE(SUM(u.output_tokens) FILTER (WHERE u.status = 'OK'), 0),
         COALESCE(SUM(u.cache_read_tokens) FILTER (WHERE u.status = 'OK'), 0),
         COUNT(*) FILTER (WHERE u.status LIKE 'BLOCKED%'),
         MAX(u.created_at)
  FROM ai_usage u
  WHERE u.created_at >= p_from AND u.created_at < p_to
  GROUP BY u.business_id
$$;

ALTER TABLE ai_global_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_business_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage           ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (Edge Functions) can read or write.
