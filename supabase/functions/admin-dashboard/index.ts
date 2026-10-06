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

  let body: { days?: number; counts_only?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  // The sidebar only needs the two headline counts — skip the sales work for it.
  if (body.counts_only) {
    const [bizRes, memberRes, staffRes] = await Promise.all([
      supabase.from('businesses').select('id', { count: 'exact', head: true }),
      supabase.from('business_members').select('id', { count: 'exact', head: true }),
      supabase.from('staff_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])
    if (bizRes.error) return json({ ok: false, error: bizRes.error.message }, 500)
    return json({
      ok: true,
      counts: { businesses: bizRes.count ?? 0, members: memberRes.count ?? 0, staffLogins: staffRes.count ?? 0 },
    })
  }

  const days = Math.max(1, Math.min(14, Number(body.days) || 7))
  const dayLabels: string[] = []
  const start = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(start.getDate() - i)
    dayLabels.push(d.toISOString().slice(0, 10))
  }
  const today = dayLabels[dayLabels.length - 1]

  const [bizRes, wsRes, salesRes, ticketRes] = await Promise.all([
    supabase.from('businesses').select('id', { count: 'exact', head: true }),
    supabase.from('workstation_devices').select('id', { count: 'exact', head: true }).eq('is_active', true),
    // Summed per day and per currency in the database (migration 086). A plain select stops at PostgREST's
    // 1,000-row cap, and adding MYR to SAR is meaningless.
    supabase.rpc('admin_sales_by_day', { p_from: dayLabels[0], p_to: today }),
    // The desktop's tickets use OPEN / IN_PROGRESS / WAITING / RESOLVED / CLOSED (migration 081 dropped the old lower-case
    // CHECK), so "open" means "not resolved or closed", in either case.
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).not('status', 'ilike', 'resolved').not('status', 'ilike', 'closed'),
  ])

  if (bizRes.error) return json({ ok: false, error: bizRes.error.message }, 500)
  if (wsRes.error) return json({ ok: false, error: wsRes.error.message }, 500)
  if (salesRes.error) return json({ ok: false, error: salesRes.error.message }, 500)
  if (ticketRes.error) return json({ ok: false, error: ticketRes.error.message }, 500)

  type SalesRow = { sale_date: string; currency: string; total: number | string; sale_count: number | string }
  const rows = (salesRes.data ?? []) as SalesRow[]

  // Per-currency totals, never one mixed number.
  const byCurrency: Record<string, { today: number; period: number }> = {}
  const perDay: Record<string, Record<string, number>> = Object.fromEntries(dayLabels.map((d) => [d, {}]))
  for (const r of rows) {
    const amount = Number(r.total) || 0
    const c = (byCurrency[r.currency] ??= { today: 0, period: 0 })
    c.period += amount
    if (r.sale_date === today) c.today += amount
    if (r.sale_date in perDay) perDay[r.sale_date][r.currency] = (perDay[r.sale_date][r.currency] || 0) + amount
  }

  // The chart plots the currency with the most revenue over the period; the others are listed beside it.
  const primary = Object.entries(byCurrency).sort((a, b) => b[1].period - a[1].period)[0]?.[0] ?? null
  const chart = dayLabels.map((day) => ({ sale_date: day, total: primary ? perDay[day][primary] || 0 : 0 }))

  return json({
    ok: true,
    summary: {
      totalBusinesses: bizRes.count ?? 0,
      activeWorkstations: wsRes.count ?? 0,
      recentSales: primary ? byCurrency[primary].period : 0,
      openTickets: ticketRes.count ?? 0,
    },
    chart,
    todayRevenue: primary ? byCurrency[primary].today : 0,
    primaryCurrency: primary,
    byCurrency,
  })
})
