import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'

// =============================================================================
// Lets an existing super admin manage OTHER super admins from the portal's
// own UI instead of the Supabase dashboard: list, create (a real Supabase
// Auth user + a super_admins row, in one step), deactivate, reactivate. Self-service
// account creation for THIS allowlist only — never touches customer
// businesses/users, and "create" always inherits the caller's own
// super-admin-gated access (requireSuperAdmin runs first).
// =============================================================================
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  let supabase, callerEmail
  try {
    ;({ supabase, email: callerEmail } = await requireSuperAdmin(req))
  } catch (e) {
    const err = e as AuthzError
    return json({ ok: false, error: err.message }, err.status ?? 500)
  }

  const body = await req.json().catch(() => ({}))
  const op = body.op === 'create' ? 'create' : body.op === 'deactivate' ? 'deactivate' : body.op === 'activate' ? 'activate' : 'list'

  if (op === 'list') {
    const { data, error } = await supabase
      .from('super_admins')
      .select('id, email, full_name, is_active, created_at')
      .order('created_at', { ascending: false })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, admins: data ?? [] })
  }

  if (op === 'create') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : null
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !email.includes('@')) return json({ ok: false, error: 'A valid email is required' }, 400)
    if (password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400)

    const { error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    // "User already registered" is fine — they may already have a Supabase
    // Auth account (e.g. a former admin being re-granted access). Any other
    // auth error is fatal; super_admins is keyed by email, not auth user id,
    // so we don't need the created user's id to proceed either way.
    if (authErr && !/already.*registered/i.test(authErr.message)) {
      return json({ ok: false, error: authErr.message }, 400)
    }

    const { data, error } = await supabase
      .from('super_admins')
      .upsert({ email, full_name: fullName, is_active: true }, { onConflict: 'email' })
      .select('id, email, full_name, is_active, created_at')
      .maybeSingle()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, admin: data })
  }

  // op === 'deactivate' | 'activate'
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const { data: target, error: targetErr } = await supabase
    .from('super_admins').select('email').eq('id', id).maybeSingle()
  if (targetErr) return json({ ok: false, error: targetErr.message }, 500)
  if (!target) return json({ ok: false, error: 'Admin not found' }, 404)
  if (op === 'deactivate' && target.email === callerEmail) return json({ ok: false, error: "You can't deactivate your own account" }, 400)

  const { data, error } = await supabase
    .from('super_admins')
    .update({ is_active: op === 'activate' })
    .eq('id', id)
    .select('id, email, full_name, is_active, created_at')
    .maybeSingle()
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true, admin: data })
})
