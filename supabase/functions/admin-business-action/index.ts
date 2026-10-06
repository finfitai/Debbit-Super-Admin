import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'

// Replaces the frontend's old direct `supabase.from('businesses').update(...)`
// call, which RLS silently blocks for the portal's own Supabase Auth session
// (it has no business_members row, so auth_business_ids() returns empty —
// see supabase/migrations/002_rls_policies.sql). Mutations need the
// service-role key, same as every admin-* read.
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
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  if (body.action === 'set_device_limit') {
    // NULL = unlimited (deliberate override); any other value must be a
    // non-negative integer. Mirrors down to the desktop app via the
    // existing sync-pull cycle — see db/244_license_hardening.sql /
    // supabase/migrations/059_device_limit.sql.
    const raw = body.device_limit
    const deviceLimit = raw === null ? null : Number(raw)
    if (deviceLimit !== null && (!Number.isInteger(deviceLimit) || deviceLimit < 0)) {
      return json({ ok: false, error: 'device_limit must be a non-negative integer, or null for unlimited' }, 400)
    }
    const { data, error } = await supabase
      .from('businesses')
      .update({ device_limit: deviceLimit })
      .eq('id', id)
      .select('id, device_limit')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    if (!data) return json({ ok: false, error: 'Business not found' }, 404)
    return json({ ok: true, business: data })
  }

  if (body.action === 'extend_trial') {
    // Only a trial can be extended. A paid / past-due / cancelled subscription belongs to Stripe (its webhook rewrites
    // these columns), so overriding it here would just be undone.
    const days = Number(body.days)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return json({ ok: false, error: 'days must be a whole number between 1 and 365' }, 400)
    }
    const { data: current, error: curErr } = await supabase
      .from('businesses').select('id, subscription_status, trial_ends_at').eq('id', id).maybeSingle()
    if (curErr) return json({ ok: false, error: curErr.message }, 500)
    if (!current) return json({ ok: false, error: 'Business not found' }, 404)
    if (current.subscription_status && current.subscription_status !== 'trialing') {
      return json({ ok: false, error: `Only a trial can be extended — this business is "${current.subscription_status}"` }, 400)
    }
    // Extend from whichever is later: the current trial end, or now (a trial that already ran out restarts from today).
    const base = Math.max(Date.now(), current.trial_ends_at ? new Date(current.trial_ends_at).getTime() : 0)
    const trialEndsAt = new Date(base + days * 86400000).toISOString()
    const { data, error } = await supabase
      .from('businesses')
      .update({ subscription_status: 'trialing', trial_ends_at: trialEndsAt })
      .eq('id', id)
      .select('id, subscription_status, trial_ends_at')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, business: data })
  }

  if (body.action === 'revoke_device') {
    // Cuts one computer off at the sync layer (_shared/deviceAuth.ts rejects a revoked device on its next call).
    const deviceId = typeof body.device_id === 'string' ? body.device_id : ''
    if (!deviceId) return json({ ok: false, error: 'device_id is required' }, 400)
    const { data, error } = await supabase
      .from('sync_devices')
      .update({ revoked_at: new Date().toISOString() })
      .eq('business_id', id)
      .eq('device_id', deviceId)
      .is('revoked_at', null)
      .select('device_id, revoked_at')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    if (!data) return json({ ok: false, error: 'Device not found, or already revoked' }, 404)
    return json({ ok: true, device: data })
  }

  const action = body.action === 'activate' ? 'activate' : body.action === 'suspend' ? 'suspend' : null
  if (!action) return json({ ok: false, error: 'action must be "suspend", "activate", "set_device_limit", "extend_trial" or "revoke_device"' }, 400)

  const { data, error } = await supabase
    .from('businesses')
    .update({ is_active: action === 'activate' })
    .eq('id', id)
    .select('id, is_active')
    .maybeSingle()

  if (error) return json({ ok: false, error: error.message }, 500)
  if (!data) return json({ ok: false, error: 'Business not found' }, 404)

  return json({ ok: true, business: data })
})
