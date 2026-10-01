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
  const action = body.action === 'activate' ? 'activate' : body.action === 'suspend' ? 'suspend' : null
  if (!id || !action) return json({ ok: false, error: 'id and action ("suspend" | "activate") are required' }, 400)

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
