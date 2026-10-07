// Run against a local Postgres + PostgREST that has the repo's supabase migrations applied — see README.md in this folder.
import { call, authState } from './harness.mjs'
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const B1 = 'aaaaaaaa-0000-0000-0000-000000000001', B2 = 'aaaaaaaa-0000-0000-0000-000000000002'

// ── authz
ok((await call('admin-users', {}, 'BAD')).status === 401, 'bad token → 401')
authState.email = 'notadmin@x.com'; ok((await call('admin-users', {})).status === 403, 'non-admin → 403'); authState.email = 'admin@x.com'

// ── dashboard
let r = await call('admin-dashboard', { days: 7 })
ok(r.status === 200 && r.body.ok, 'dashboard ok ' + (r.body.error ?? ''))
ok(r.body.primaryCurrency === 'MYR', 'primary currency MYR (1500 sales not capped at 1000): ' + r.body.primaryCurrency)
ok(r.body.byCurrency?.MYR?.period === 1500, 'MYR period total = 1500 (got ' + r.body.byCurrency?.MYR?.period + ')')
ok(r.body.byCurrency?.SAR?.period === 50, 'SAR kept separate, void excluded (got ' + r.body.byCurrency?.SAR?.period + ')')
ok(r.body.summary.openTickets === 4, 'open tickets = everything not resolved/closed, any case (OPEN, IN_PROGRESS, WAITING, open); got ' + r.body.summary.openTickets)
ok(r.body.summary.totalBusinesses === 2, 'two businesses')
r = await call('admin-dashboard', { days: 30 })
ok(r.body.chart?.length === 30 && r.body.byCurrency?.MYR?.period === 1500, 'dashboard period pills: a 30-day window returns 30 days of chart (got ' + r.body.chart?.length + ')')
r = await call('admin-dashboard', { days: 99 })
ok(r.body.chart?.length === 31, 'dashboard window is capped at 31 days')
r = await call('admin-dashboard', { counts_only: true })
ok(r.body.counts?.businesses === 2 && r.body.counts?.staffLogins === 1, 'counts_only ' + JSON.stringify(r.body))

// ── business detail
r = await call('admin-business-detail', { id: B1 })
ok(r.status === 200 && r.body.ok, 'detail ok ' + (r.body.error ?? ''))
ok(r.body.stats.totalRevenue === 1500 && r.body.stats.saleCount === 1500, 'detail revenue not capped: ' + JSON.stringify(r.body.stats))
ok(r.body.shifts.length === 1 && r.body.shifts[0].cashier?.full_name === 'Cass Hier', 'shift shows cashier name: ' + JSON.stringify(r.body.shifts[0]))
ok(r.body.staff.length === 1 && r.body.staff[0].email === 'cashier@x.com', 'staff logins listed')
ok(r.body.syncDevices.length === 2 && !('device_secret' in r.body.syncDevices[0]), 'sync devices, no secret')
ok(r.body.business.owner?.email === 'o@x.com', 'owner embed')

// ── users
r = await call('admin-users', { op: 'list' })
ok(r.body.ok && r.body.staff.length === 1 && r.body.staff[0].business_name === 'Biz MY', 'users: staff w/ business name')
ok(r.body.members.length >= 1 && r.body.members[0].users?.email && r.body.members[0].businesses?.name, 'users: member embeds')
const staffId = r.body.staff[0].id
r = await call('admin-users', { op: 'toggle', kind: 'staff', id: staffId })
ok(r.body.ok && r.body.member.is_active === false, 'toggle staff off')
r = await call('admin-users', { op: 'toggle', kind: 'staff', id: staffId })
ok(r.body.ok && r.body.member.is_active === true, 'toggle staff back on')
r = await call('admin-users', { op: 'toggle', kind: 'staff', id: '99999999-9999-9999-9999-999999999999' })
ok(r.status === 404, 'toggle unknown → 404')

// ── business actions
r = await call('admin-business-action', { id: B1, action: 'suspend' }); ok(r.body.ok && r.body.business.is_active === false, 'suspend')
r = await call('admin-business-action', { id: B1, action: 'activate' }); ok(r.body.ok && r.body.business.is_active === true, 'activate')
r = await call('admin-business-action', { id: B1, action: 'set_device_limit', device_limit: 3 }); ok(r.body.ok && r.body.business.device_limit === 3, 'device limit')
r = await call('admin-business-action', { id: B1, action: 'extend_trial', days: 0 }); ok(r.status === 400, 'extend_trial days 0 → 400')
r = await call('admin-business-action', { id: B1, action: 'extend_trial', days: 10 })
ok(r.body.ok && r.body.business.subscription_status === 'trialing' && new Date(r.body.business.trial_ends_at) > new Date(Date.now() + 9 * 86400000), 'extend_trial from now (null trial_ends_at): ' + JSON.stringify(r.body))
const first = r.body.business.trial_ends_at
r = await call('admin-business-action', { id: B1, action: 'extend_trial', days: 5 })
ok(Math.abs(new Date(r.body.business.trial_ends_at) - new Date(first) - 5 * 86400000) < 1000, 'extend_trial stacks on the existing end date')
await fetch('http://localhost:3555/businesses?id=eq.' + B2, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.SERVICE_ROLE_KEY, apikey: process.env.SERVICE_ROLE_KEY }, body: JSON.stringify({ subscription_status: 'active' }) })
r = await call('admin-business-action', { id: B2, action: 'extend_trial', days: 5 }); ok(r.status === 400 && /active/.test(r.body.error), 'extend_trial refuses a paying business')
r = await call('admin-business-action', { id: B1, action: 'revoke_device', device_id: 'dev-1' }); ok(r.body.ok && r.body.device.revoked_at, 'revoke device')
r = await call('admin-business-action', { id: B1, action: 'revoke_device', device_id: 'dev-1' }); ok(r.status === 404, 'revoke again → 404')
r = await call('admin-business-action', { id: B2, action: 'revoke_device', device_id: 'dev-2' }); ok(r.status === 404, "can't revoke another business's device")

// ── create business
r = await call('admin-business-create', { name: 'X' }); ok(r.status === 400, 'create needs an owner')
r = await call('admin-business-create', { name: 'X', owner_email: 'nobody@x.com' }); ok(r.status === 404, 'create unknown owner → 404')
r = await call('admin-business-create', { name: 'New Co', owner_email: 'O@X.com' })
ok(r.body.ok && r.body.business.owner_id === '11111111-1111-1111-1111-111111111111' && r.body.business.trial_ends_at, 'create business for named owner w/ trial: ' + JSON.stringify(r.body).slice(0, 150))
const newId = r.body.business?.id
r = await call('admin-users', { op: 'list' })
ok(r.body.members.some(m => m.business_id === newId && m.role === 'OWNER'), 'owner membership row created')

// ── admins
r = await call('admin-admins', { op: 'list' }); ok(r.body.ok && r.body.admins.length >= 1, 'admins list')
r = await call('admin-admins', { op: 'create', email: 'New@X.com', full_name: 'New Admin', password: 'password123' }); ok(r.body.ok && r.body.admin.email === 'new@x.com', 'admin create')
const newAdmin = r.body.admin.id
r = await call('admin-admins', { op: 'create', email: 'existing@x.com', password: 'password123' }); ok(r.body.ok, 'admin create for already-registered auth user still grants access')
r = await call('admin-admins', { op: 'create', email: 'bad', password: 'password123' }); ok(r.status === 400, 'admin create bad email')
r = await call('admin-admins', { op: 'deactivate', id: newAdmin }); ok(r.body.ok && r.body.admin.is_active === false, 'admin deactivate')
r = await call('admin-admins', { op: 'activate', id: newAdmin }); ok(r.body.ok && r.body.admin.is_active === true, 'admin reactivate')
const me = (await call('admin-admins', { op: 'list' })).body.admins.find(a => a.email === 'admin@x.com')
r = await call('admin-admins', { op: 'deactivate', id: me.id }); ok(r.status === 400, "can't deactivate self")

// ── lists
r = await call('admin-billing', {}); ok(r.body.ok && r.body.businesses.length === 3, 'billing list')
r = await call('admin-sync-health', {}); ok(r.body.ok && r.body.workstations.length === 1, 'sync health')
r = await call('admin-telemetry', {}); ok(r.body.ok && r.body.data.length === 1, 'telemetry')
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
