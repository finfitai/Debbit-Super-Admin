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

  const action = body.action === 'activate' ? 'activate' : body.action === 'suspend' ? 'suspend' : null
  if (!action) return json({ ok: false, error: 'action must be "suspend", "activate", or "set_device_limit"' }, 400)

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
