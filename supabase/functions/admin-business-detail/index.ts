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

  const [memberRes, wsRes, salesRes, devicesRes, syncDevicesRes, shiftsRes, staffRes] = await Promise.all([
    supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_active', true),
    supabase.from('workstation_devices').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_active', true),
    // Summed in the database (migration 086): a plain select stops at PostgREST's 1,000-row cap and under-reports.
    supabase.rpc('admin_business_sales', { p_business_id: id }),
    supabase.from('workstation_devices').select('id, code, name, branch_name, is_active, created_at, updated_at').eq('business_id', id).order('updated_at', { ascending: false }),
    // sync_devices_public omits device_secret — never touch sync_devices directly here.
    supabase.from('sync_devices_public').select('id, device_id, label, created_at, last_seen_at, revoked_at').eq('business_id', id).order('last_seen_at', { ascending: false, nullsFirst: false }),
    // "staff sessions" for this business — real column set per 044_cash_office.sql
    // (006's opened_by/closed_by/opening_cash/etc were never actually written to;
    // the desktop sync trigger pushes cashier_id/shift_start/shift_end/... instead).
    // shift_reconciliations has no foreign key on cashier_id, so a PostgREST embed
    // of employees fails; the cashier names are looked up below instead.
    supabase
      .from('shift_reconciliations')
      .select('id, cashier_id, shift_start, shift_end, declared_amount_sen, expected_amount_sen, variance_sen, flagged, created_at')
      .eq('business_id', id)
      .order('shift_start', { ascending: false })
      .limit(50),
    // The logins the desktop app signs in with (see admin-users).
    supabase
      .from('staff_accounts')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('business_id', id)
      .order('created_at', { ascending: false }),
  ])

  const sales = (salesRes.data ?? [])[0] as { total: number | string; sale_count: number | string } | undefined

  const shiftRows = (shiftsRes.data ?? []) as Array<{ cashier_id: string | null }>
  const cashierIds = [...new Set(shiftRows.map(s => s.cashier_id).filter((v): v is string => !!v))]
  const cashierNames = new Map<string, string>()
  if (cashierIds.length > 0) {
    const { data: emps } = await supabase.from('employees').select('id, full_name, name').in('id', cashierIds)
    for (const e of (emps ?? []) as Array<{ id: string; full_name: string | null; name: string | null }>) {
      cashierNames.set(e.id, e.full_name || e.name || '')
    }
  }
  const shifts = shiftRows.map(s => ({ ...s, cashier: s.cashier_id && cashierNames.get(s.cashier_id) ? { full_name: cashierNames.get(s.cashier_id) } : null }))

  return json({
    ok: true,
    business,
    stats: {
      activeMembers: memberRes.count ?? 0,
      activeWorkstations: wsRes.count ?? 0,
      totalRevenue: Number(sales?.total) || 0,
      saleCount: Number(sales?.sale_count) || 0,
      activeStaffLogins: ((staffRes.data ?? []) as Array<{ is_active: boolean }>).filter(r => r.is_active).length,
    },
    devices: devicesRes.data ?? [],
    syncDevices: syncDevicesRes.data ?? [],
    shifts,
    staff: staffRes.data ?? [],
  })
})
