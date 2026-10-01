import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'

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
  const op = body.op === 'toggle' ? 'toggle' : 'list'

  if (op === 'toggle') {
    const memberId = typeof body.id === 'string' ? body.id : ''
    if (!memberId) return json({ ok: false, error: 'id is required' }, 400)

    const { data: current, error: currentErr } = await supabase
      .from('business_members').select('is_active').eq('id', memberId).maybeSingle()
    if (currentErr) return json({ ok: false, error: currentErr.message }, 500)
    if (!current) return json({ ok: false, error: 'Member not found' }, 404)

    const { data, error } = await supabase
      .from('business_members')
      .update({ is_active: !current.is_active })
      .eq('id', memberId)
      .select('id, is_active')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, member: data })
  }

  const { data, error } = await supabase
    .from('business_members')
    .select('id, business_id, user_id, role, is_active, joined_at, users(full_name,email), businesses(name)')
    .order('joined_at', { ascending: false })

  if (error) return json({ ok: false, error: error.message }, 500)

  return json({ ok: true, members: data ?? [] })
})
