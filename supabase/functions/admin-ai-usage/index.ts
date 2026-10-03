import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'

// Super-admin view + controls for the AI proxy (ai-proxy function).
//   { action: 'overview', month?: 'YYYY-MM' } -> per-business usage + limits + global config
//   { action: 'set_business', business_id, enabled?, monthly_token_budget? (null = default), note? }
//   { action: 'set_config', key, value }   (allowlisted keys only)
const CONFIG_KEYS: Record<string, (v: unknown) => boolean> = {
  kill_switch: (v) => typeof v === 'boolean',
  model: (v) => typeof v === 'string' && /^[a-z0-9.\-]{3,64}$/i.test(v),
  max_output_tokens: (v) => Number.isInteger(v) && (v as number) >= 256 && (v as number) <= 8192,
  default_monthly_token_budget: (v) => v === null || (Number.isInteger(v) && (v as number) >= 0),
  max_requests_per_minute: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 600,
  price_input_per_mtok: (v) => v === null || (typeof v === 'number' && v >= 0),
  price_output_per_mtok: (v) => v === null || (typeof v === 'number' && v >= 0),
}

function monthRange(month?: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '')
  const now = new Date()
  const y = m ? Number(m[1]) : now.getUTCFullYear()
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth()
  return { from: new Date(Date.UTC(y, mo, 1)).toISOString(), to: new Date(Date.UTC(y, mo + 1, 1)).toISOString(), label: `${y}-${String(mo + 1).padStart(2, '0')}` }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  let supabase
  try {
    ;({ supabase } = await requireSuperAdmin(req))
  } catch (e) {
    const err = e as AuthzError
    return json({ ok: false, error: err.message }, err.status ?? 500)
  }

  const body = await req.json().catch(() => ({}))

  if (body.action === 'set_config') {
    const check = CONFIG_KEYS[String(body.key)]
    if (!check) return json({ ok: false, error: 'Unknown config key' }, 400)
    if (!check(body.value)) return json({ ok: false, error: `Invalid value for ${body.key}` }, 400)
    const { error } = await supabase.from('ai_global_config').upsert({ key: body.key, value: body.value, updated_at: new Date().toISOString() })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  if (body.action === 'set_business') {
    const id = typeof body.business_id === 'string' ? body.business_id : ''
    if (!id) return json({ ok: false, error: 'business_id is required' }, 400)
    const row: Record<string, unknown> = { business_id: id, updated_at: new Date().toISOString() }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') return json({ ok: false, error: 'enabled must be boolean' }, 400)
      row.enabled = body.enabled
    }
    if (body.monthly_token_budget !== undefined) {
      const b = body.monthly_token_budget
      if (b !== null && (!Number.isInteger(b) || b < 0)) return json({ ok: false, error: 'monthly_token_budget must be a non-negative integer or null' }, 400)
      row.monthly_token_budget = b
    }
    if (body.note !== undefined) row.note = String(body.note).slice(0, 300)
    const { error } = await supabase.from('ai_business_limits').upsert(row, { onConflict: 'business_id' })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // default: overview
  const { from, to, label } = monthRange(body.month)
  const [usage, limits, cfg, biz] = await Promise.all([
    supabase.rpc('ai_usage_month', { p_from: from, p_to: to }),
    supabase.from('ai_business_limits').select('business_id, enabled, monthly_token_budget, note'),
    supabase.from('ai_global_config').select('key, value'),
    supabase.from('businesses').select('id, name, country').limit(2000),
  ])
  if (usage.error) return json({ ok: false, error: usage.error.message }, 500)
  const limitBy = new Map((limits.data ?? []).map((l: { business_id: string }) => [l.business_id, l]))
  const usageBy = new Map((usage.data ?? []).map((u: { business_id: string }) => [u.business_id, u]))
  const config: Record<string, unknown> = {}
  for (const r of cfg.data ?? []) config[r.key] = r.value
  const rows = (biz.data ?? []).map((b: { id: string; name: string; country: string }) => {
    const u = (usageBy.get(b.id) ?? {}) as Record<string, unknown>
    const l = (limitBy.get(b.id) ?? {}) as Record<string, unknown>
    return {
      business_id: b.id, name: b.name, country: b.country,
      requests: Number(u.requests ?? 0), input_tokens: Number(u.input_tokens ?? 0), output_tokens: Number(u.output_tokens ?? 0),
      cache_read_tokens: Number(u.cache_read_tokens ?? 0), blocked: Number(u.blocked ?? 0), last_used: u.last_used ?? null,
      enabled: l.enabled !== false, monthly_token_budget: (l.monthly_token_budget as number | null | undefined) ?? null, note: (l.note as string | undefined) ?? '',
    }
  }).filter((r: { requests: number; blocked: number; enabled: boolean; monthly_token_budget: number | null }) => r.requests > 0 || r.blocked > 0 || !r.enabled || r.monthly_token_budget !== null)
  return json({ ok: true, month: label, config, rows })
})
