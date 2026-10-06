import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'
import { fetchAll } from '../_shared/paginate.ts'

// =============================================================================
// Who can sign in to a business — the two kinds of login debbit has:
//
//   staff_accounts    the logins the DESKTOP APP uses. The sync functions look the
//                     person up here on EVERY call (_shared/deviceAuth.ts), so
//                     switching one off here cuts that person's computers off at
//                     once. This is the list that matters operationally.
//   business_members  the web dashboard's membership rows (owner + invited staff).
//
// op 'list'   → { staff, members }
// op 'toggle' → body { kind: 'staff' | 'member', id } flips is_active on that row.
//               ('member' is the default so older callers keep working.)
// =============================================================================
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
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return json({ ok: false, error: 'id is required' }, 400)
    const table = body.kind === 'staff' ? 'staff_accounts' : 'business_members'

    const { data: current, error: currentErr } = await supabase
      .from(table).select('is_active').eq('id', id).maybeSingle()
    if (currentErr) return json({ ok: false, error: currentErr.message }, 500)
    if (!current) return json({ ok: false, error: table === 'staff_accounts' ? 'Staff login not found' : 'Member not found' }, 404)

    const patch: Record<string, unknown> = { is_active: !current.is_active }
    if (table === 'staff_accounts') patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase
      .from(table)
      .update(patch)
      .eq('id', id)
      .select('id, is_active')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, kind: body.kind === 'staff' ? 'staff' : 'member', member: data })
  }

  const [staffRes, memberRes, bizRes] = await Promise.all([
    fetchAll((from, to) => supabase
      .from('staff_accounts')
      .select('id, business_id, auth_user_id, employee_id, email, full_name, role, is_active, created_at')
      .order('created_at', { ascending: false })
      .range(from, to)),
    fetchAll((from, to) => supabase
      .from('business_members')
      .select('id, business_id, user_id, role, is_active, joined_at, users(full_name,email), businesses(name)')
      .order('joined_at', { ascending: false })
      .range(from, to)),
    fetchAll((from, to) => supabase.from('businesses').select('id, name').order('id').range(from, to)),
  ])
  if (staffRes.error) return json({ ok: false, error: staffRes.error.message }, 500)
  if (memberRes.error) return json({ ok: false, error: memberRes.error.message }, 500)
  if (bizRes.error) return json({ ok: false, error: bizRes.error.message }, 500)

  // staff_accounts has no foreign key to businesses (a login can exist before its business has synced up), so the
  // business name is joined here instead of with a PostgREST embed.
  const names = new Map((bizRes.data as Array<{ id: string; name: string }>).map(b => [b.id, b.name]))
  const staff = (staffRes.data as Array<{ business_id: string }>).map(s => ({ ...s, business_name: names.get(s.business_id) ?? null }))

  return json({ ok: true, staff, members: memberRes.data })
})
