import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'
import { fetchAll } from '../_shared/paginate.ts'

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

  const { data, error } = await fetchAll((from, to) => supabase
    .from('businesses')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to))

  if (error) return json({ ok: false, error: error.message }, 500)

  return json({ ok: true, businesses: data ?? [] })
})
