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

  let body: { days?: number } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const days = Math.max(7, Math.min(90, Number(body.days) || 30))
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const [wsRes, auditRes] = await Promise.all([
    fetchAll((from, to) => supabase.from('workstation_devices').select('*').order('updated_at', { ascending: false }).order('id').range(from, to)),
    supabase
      .from('workstation_audit_logs')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(150),
  ])

  if (wsRes.error) return json({ ok: false, error: wsRes.error.message }, 500)
  if (auditRes.error) return json({ ok: false, error: auditRes.error.message }, 500)

  return json({
    ok: true,
    workstations: wsRes.data ?? [],
    auditLogs: auditRes.data ?? [],
  })
})
