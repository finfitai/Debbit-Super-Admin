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

  const { data, error } = await supabase
    .from('business_members')
    .select('business_id, user_id, role, is_active, joined_at, users(full_name,email), businesses(name)')
    .order('joined_at', { ascending: false })

  if (error) return json({ ok: false, error: error.message }, 500)

  return json({ ok: true, members: data ?? [] })
})
