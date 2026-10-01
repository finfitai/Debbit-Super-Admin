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
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('*, owner:users!owner_id(email, full_name)')
    .eq('id', id)
    .maybeSingle()

  if (bizErr) return json({ ok: false, error: bizErr.message }, 500)
  if (!business) return json({ ok: false, error: 'Business not found' }, 404)

  const [memberRes, wsRes, salesRes] = await Promise.all([
    supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_active', true),
    supabase.from('workstation_devices').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_active', true),
    supabase.from('sales').select('total').eq('business_id', id).eq('is_void', false),
  ])

  const totalRevenue = (salesRes.data ?? []).reduce((sum: number, row: { total: number }) => sum + (Number(row.total) || 0), 0)

  return json({
    ok: true,
    business,
    stats: {
      activeMembers: memberRes.count ?? 0,
      activeWorkstations: wsRes.count ?? 0,
      totalRevenue,
      saleCount: (salesRes.data ?? []).length,
    },
  })
})
