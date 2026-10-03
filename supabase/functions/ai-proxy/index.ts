// =============================================================================
// debbit OS · ai-proxy — the ONLY place the AI key lives.
//
// Desktops send an Anthropic Messages-shaped request, signed with their
// per-device HMAC (same scheme as sync/telemetry, _shared/deviceAuth). The
// business comes FROM the device, never from the body. We:
//   1. refuse the legacy shared-secret mode (no tenant -> no metering)
//   2. enforce kill switch, per-business enable flag, rate limit, monthly budget
//   3. whitelist the request fields, force OUR model, cap max_tokens
//   4. call Anthropic with ANTHROPIC_API_KEY, record token usage (never content)
// The desktop still runs the tool-calling loop locally; this only forwards.
// Deploy: supabase functions deploy ai-proxy   (secret: ANTHROPIC_API_KEY)
// =============================================================================
import { authenticateSyncRequest, json, CORS_HEADERS } from '../_shared/deviceAuth.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_BODY_BYTES = 6 * 1024 * 1024 // PDF OCR sends a base64 document
const UPSTREAM_TIMEOUT_MS = 110_000

// deno-lint-ignore no-explicit-any
type Sb = any

async function loadConfig(supabase: Sb) {
  const { data } = await supabase.from('ai_global_config').select('key, value')
  const c: Record<string, unknown> = {}
  for (const r of data ?? []) c[r.key] = r.value
  return {
    killSwitch: c.kill_switch === true,
    model: typeof c.model === 'string' ? c.model : 'claude-sonnet-5-5',
    maxOutput: Number(c.max_output_tokens) || 2048,
    defaultBudget: c.default_monthly_token_budget === null ? null : Number(c.default_monthly_token_budget) || 2_000_000,
    rpm: Number(c.max_requests_per_minute) || 30,
  }
}

function monthStartUtc(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

async function record(supabase: Sb, row: Record<string, unknown>) {
  const { error } = await supabase.from('ai_usage').insert(row)
  if (error) console.error('ai_usage insert failed', error.message)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const cl = Number(req.headers.get('content-length') ?? 0)
  if (cl > MAX_BODY_BYTES) return json({ ok: false, code: 'TOO_LARGE', error: 'Request too large' }, 413)

  const auth = await authenticateSyncRequest(req)
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status ?? 401)
  if (auth.mode !== 'device' || !auth.businessId) {
    return json({ ok: false, code: 'DEVICE_REQUIRED', error: 'A registered device is required for AI' }, 403)
  }
  const { businessId, deviceId, supabase } = auth
  const requestId = crypto.randomUUID()
  const base = { business_id: businessId, device_id: deviceId, request_id: requestId }

  let body: Record<string, unknown>
  try { body = JSON.parse(auth.rawBody!) } catch { return json({ ok: false, error: 'Invalid JSON' }, 400) }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ ok: false, error: 'messages required' }, 400)

  const cfg = await loadConfig(supabase)
  if (cfg.killSwitch) {
    await record(supabase, { ...base, status: 'BLOCKED_KILL_SWITCH' })
    return json({ ok: false, code: 'AI_UNAVAILABLE', error: 'AI is temporarily unavailable' }, 503)
  }

  const { data: limits } = await supabase.from('ai_business_limits').select('enabled, monthly_token_budget').eq('business_id', businessId).maybeSingle()
  if (limits && limits.enabled === false) {
    await record(supabase, { ...base, status: 'BLOCKED_DISABLED' })
    return json({ ok: false, code: 'AI_DISABLED', error: 'AI is not enabled for this business' }, 403)
  }

  // Rate limit: requests in the last minute (cheap indexed count).
  const { count: recent } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).gte('created_at', new Date(Date.now() - 60_000).toISOString())
  if ((recent ?? 0) >= cfg.rpm) {
    await record(supabase, { ...base, status: 'BLOCKED_RATE' })
    return json({ ok: false, code: 'AI_RATE_LIMIT', error: 'Too many AI requests, try again shortly' }, 429)
  }

  // Monthly token budget (null budget = unlimited).
  const budget = limits?.monthly_token_budget ?? cfg.defaultBudget
  if (budget !== null && budget !== undefined) {
    const { data: tot } = await supabase.rpc('ai_usage_month', { p_from: monthStartUtc(), p_to: new Date(Date.now() + 86_400_000).toISOString() })
    const mine = (tot ?? []).find((r: { business_id: string }) => r.business_id === businessId)
    const used = Number(mine?.input_tokens ?? 0) + Number(mine?.output_tokens ?? 0)
    if (used >= Number(budget)) {
      await record(supabase, { ...base, status: 'BLOCKED_BUDGET' })
      return json({ ok: false, code: 'AI_BUDGET_EXCEEDED', error: 'Monthly AI allowance used up' }, 429)
    }
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ ok: false, code: 'AI_UNAVAILABLE', error: 'AI is not configured' }, 503)

  // Whitelist what we forward; the model and the output cap are ours.
  const upstream: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1024, 1), cfg.maxOutput),
    messages: body.messages,
  }
  for (const k of ['system', 'tools', 'tool_choice', 'temperature', 'stop_sequences']) if (body[k] !== undefined) upstream[k] = body[k]

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(upstream),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (e) {
    await record(supabase, { ...base, model: cfg.model, status: 'UPSTREAM_ERROR', error: String((e as Error).message).slice(0, 200), latency_ms: Date.now() - started })
    return json({ ok: false, code: 'AI_UPSTREAM', error: 'AI provider unreachable' }, 502)
  }

  const text = await res.text()
  let parsed: Record<string, any> | null = null
  try { parsed = JSON.parse(text) } catch { /* keep null */ }
  const latency = Date.now() - started

  if (!res.ok || !parsed) {
    await record(supabase, { ...base, model: cfg.model, status: 'UPSTREAM_ERROR', error: String(parsed?.error?.message ?? `HTTP ${res.status}`).slice(0, 200), latency_ms: latency })
    return json({ ok: false, code: 'AI_UPSTREAM', error: 'AI provider error' }, 502)
  }

  const u = parsed.usage ?? {}
  await record(supabase, {
    ...base, model: cfg.model, status: 'OK', latency_ms: latency,
    input_tokens: Number(u.input_tokens) || 0, output_tokens: Number(u.output_tokens) || 0,
    cache_read_tokens: Number(u.cache_read_input_tokens) || 0, cache_creation_tokens: Number(u.cache_creation_input_tokens) || 0,
  })
  // Anthropic-shaped body, unchanged, so the desktop reuses its existing parser.
  return new Response(text, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})
