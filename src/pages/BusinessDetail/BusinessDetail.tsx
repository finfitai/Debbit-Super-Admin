import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import StatusBadge from '../../components/atoms/StatusBadge'
import StatCard from '../../components/molecules/StatCard'
import { BusinessDetailDTO, BusinessDetailStats, BusinessStaffRow, WorkstationDeviceRow, SyncDeviceRow, ShiftRow } from '../../types'
import { businessDetailStyles } from './BusinessDetail.styles'

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : '—'
}

export default function BusinessDetail() {
  const { id } = useParams<{ id: string }>()
  const [business, setBusiness] = useState<BusinessDetailDTO | null>(null)
  const [stats, setStats]       = useState<BusinessDetailStats | null>(null)
  const [devices, setDevices]   = useState<WorkstationDeviceRow[]>([])
  const [syncDevices, setSyncDevices] = useState<SyncDeviceRow[]>([])
  const [shifts, setShifts]     = useState<ShiftRow[]>([])
  const [staff, setStaff]       = useState<BusinessStaffRow[]>([])
  const [trialDays, setTrialDays]   = useState('14')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionMsg, setActionMsg]   = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [limitBusy, setLimitBusy]   = useState(false)
  const [limitMsg, setLimitMsg]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase.functions.invoke<{
          ok?: boolean
          business?: BusinessDetailDTO
          stats?: BusinessDetailStats
          devices?: WorkstationDeviceRow[]
          syncDevices?: SyncDeviceRow[]
          shifts?: ShiftRow[]
          staff?: BusinessStaffRow[]
          error?: string
        }>('admin-business-detail', { body: { id } })

        if (err || !data?.ok) {
          setError(err?.message || data?.error || 'Failed to load business')
          setBusiness(null)
          setStats(null)
          return
        }
        setBusiness(data.business ?? null)
        setStats(data.stats ?? null)
        setDevices(data.devices ?? [])
        setSyncDevices(data.syncDevices ?? [])
        setShifts(data.shifts ?? [])
        setStaff(data.staff ?? [])
        const dl = data.business?.device_limit
        setLimitInput(dl == null ? '' : String(dl))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setBusiness(null)
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    if (id) void load()
  }, [id])

  async function saveDeviceLimit() {
    if (!business) return
    const trimmed = limitInput.trim()
    const deviceLimit = trimmed === '' ? null : Number(trimmed)
    if (deviceLimit !== null && (!Number.isInteger(deviceLimit) || deviceLimit < 0)) {
      setLimitMsg('Enter a whole number 0 or greater, or leave blank for unlimited.')
      return
    }
    setLimitBusy(true)
    setLimitMsg(null)
    try {
      const { data, error: err } = await supabase.functions.invoke<{ ok?: boolean; business?: { device_limit: number | null }; error?: string }>('admin-business-action', {
        body: { id: business.id, action: 'set_device_limit', device_limit: deviceLimit },
      })
      if (err || !data?.ok) {
        setLimitMsg(err?.message || data?.error || 'Failed to update device limit')
        return
      }
      setBusiness(prev => prev ? { ...prev, device_limit: data.business?.device_limit ?? deviceLimit } : prev)
      setLimitMsg('Saved.')
      setTimeout(() => setLimitMsg(null), 3000)
    } finally {
      setLimitBusy(false)
    }
  }

  // One place for the small portal actions on this business, so the message / busy handling is the same for each.
  async function runAction(key: string, body: Record<string, unknown>, apply: (resp: Record<string, unknown>) => void, okMsg: string) {
    if (!business) return
    setActionBusy(key)
    setActionMsg(null)
    try {
      const { data, error: err } = await supabase.functions.invoke<Record<string, unknown> & { ok?: boolean; error?: string }>('admin-business-action', {
        body: { id: business.id, ...body },
      })
      if (err || !data?.ok) {
        setActionMsg(`⚠️ ${err?.message || data?.error || 'Action failed'}`)
        return
      }
      apply(data)
      setActionMsg(`✓ ${okMsg}`)
    } finally {
      setActionBusy(null)
    }
  }

  async function extendTrial() {
    const days = Number(trialDays)
    await runAction('trial', { action: 'extend_trial', days }, (resp) => {
      const b = resp.business as { subscription_status: string; trial_ends_at: string } | undefined
      if (b) setBusiness(prev => prev ? { ...prev, subscription_status: b.subscription_status, trial_ends_at: b.trial_ends_at } : prev)
    }, `Trial extended by ${days} day${days === 1 ? '' : 's'}. The desktop picks it up at its next sync.`)
  }

  async function revokeDevice(d: SyncDeviceRow) {
    if (!window.confirm(`Revoke "${d.label || d.device_id}"? That computer will be refused at its next sync.`)) return
    await runAction(`rev:${d.device_id}`, { action: 'revoke_device', device_id: d.device_id }, (resp) => {
      const dev = resp.device as { revoked_at: string } | undefined
      setSyncDevices(prev => prev.map(x => x.device_id === d.device_id ? { ...x, revoked_at: dev?.revoked_at ?? new Date().toISOString() } : x))
    }, 'Device revoked.')
  }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading business details…</p>
      </div>
    )
  }

  if (error || !business) {
    return (
      <div>
        <Link to="/businesses" className="btn btn-ghost">← Back to Businesses</Link>
        <div className="empty-state" style={{ marginTop: '40px' }}>
          <p>{error || 'Business not found.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '16px' }}>
        <Link to="/businesses" className="btn btn-ghost btn-sm">← Back to Businesses</Link>
      </div>

      <div style={businessDetailStyles.headerRow}>
        <div>
          <h1 style={businessDetailStyles.title}>{business.name}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            ID: {business.id} · {business.legal_name || 'N/A'}
          </p>
        </div>
        <StatusBadge variant={business.is_active ? 'green' : 'red'}>
          {business.is_active ? 'Active Tenant' : 'Suspended'}
        </StatusBadge>
      </div>

      {actionMsg && (
        <div className={`alert ${actionMsg.startsWith('✓') ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '20px' }}>{actionMsg}</div>
      )}

      {/* Overview Cards */}
      <div style={businessDetailStyles.kpiGrid}>
        <StatCard title="TOTAL REVENUE" value={`${business.currency} ${(stats?.totalRevenue ?? 0).toLocaleString()}`} accentColor="violet" />
        <StatCard title="ACTIVE WORKSTATIONS" value={stats?.activeWorkstations ?? 0} accentColor="green" />
        <StatCard title="ACTIVE MEMBERS" value={stats?.activeMembers ?? 0} accentColor="blue" />
      </div>

      {/* Details Box */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
          Organization Metadata
        </h2>
        <div style={businessDetailStyles.metaGrid}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>OWNER</div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
              {business.owner?.full_name || '—'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{business.owner?.email || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>PHONE / EMAIL</div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>{business.phone || '—'}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{business.email || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>COUNTRY / CURRENCY</div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>{business.country} / {business.currency}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>SUBSCRIPTION</div>
            <div style={{ marginTop: '2px' }}>
              <StatusBadge variant={
                business.subscription_status === 'active' ? 'green'
                : business.subscription_status === 'trialing' ? 'cyan'
                : business.subscription_status === 'past_due' ? 'amber'
                : 'red'
              }>
                {business.subscription_status || 'unknown'}
              </StatusBadge>
            </div>
            {business.subscription_status === 'trialing' && business.trial_ends_at && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Trial ends {new Date(business.trial_ends_at).toLocaleDateString()}
              </div>
            )}
            {(!business.subscription_status || business.subscription_status === 'trialing') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Extend by</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={trialDays}
                  onChange={e => setTrialDays(e.target.value)}
                  style={{ width: '48px', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>days</span>
                <button className="btn btn-sm" disabled={actionBusy === 'trial'} onClick={() => void extendTrial()}>
                  {actionBusy === 'trial' ? '…' : 'Extend trial'}
                </button>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>REGISTERED</div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
              {business.created_at ? new Date(business.created_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>ADDRESS</div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
              {[business.address_line1, business.city].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Devices & Sync Sessions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '24px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              POS Terminals ({devices.length})
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Device cap</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="∞"
                value={limitInput}
                onChange={e => setLimitInput(e.target.value)}
                style={{ width: '56px', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              />
              <button className="btn btn-sm" disabled={limitBusy} onClick={() => void saveDeviceLimit()}>
                {limitBusy ? '…' : 'Save'}
              </button>
            </div>
          </div>
          {limitMsg && <div style={{ fontSize: '11px', color: limitMsg === 'Saved.' ? 'var(--green)' : 'var(--red)', marginBottom: '10px' }}>{limitMsg}</div>}
          {devices.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No workstations registered.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {devices.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{d.code} · {d.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {d.branch_name || 'No branch'} · last updated {fmtDate(d.updated_at)}
                    </div>
                  </div>
                  <StatusBadge variant={d.is_active ? 'green' : 'muted'}>{d.is_active ? 'Active' : 'Inactive'}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
            Cloud Sync Devices ({syncDevices.length})
          </h2>
          {syncDevices.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No devices have synced to the cloud yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {syncDevices.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{d.label || d.device_id.slice(0, 12) + '…'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>last synced {fmtDate(d.last_seen_at)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusBadge variant={d.revoked_at ? 'red' : 'green'}>{d.revoked_at ? 'Revoked' : 'Active'}</StatusBadge>
                    {!d.revoked_at && (
                      <button className="btn btn-sm btn-danger" disabled={actionBusy === `rev:${d.device_id}`} onClick={() => void revokeDevice(d)}>
                        {actionBusy === `rev:${d.device_id}` ? '…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop logins */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
          Desktop Logins ({staff.length})
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          The email + password logins this business's staff use to sign in to the desktop app. Enable or disable them from the Users page.
        </p>
        {staff.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No desktop logins yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {staff.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{m.full_name || m.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.email} · {m.role}</div>
                </div>
                <StatusBadge variant={m.is_active ? 'green' : 'muted'}>{m.is_active ? 'Active' : 'Disabled'}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Staff Shift Sessions */}
      <div className="card">
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
          Recent Staff Shifts ({shifts.length})
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Cash-drawer clock-in/clock-out sessions — the closest thing to a "staff login" this app tracks.
        </p>
        {shifts.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No shift sessions recorded yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Cashier', 'Start', 'End', 'Variance', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id}>
                  <td style={{ padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>{s.cashier?.full_name || '—'}</td>
                  <td style={{ padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>{fmtDate(s.shift_start)}</td>
                  <td style={{ padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>{s.shift_end ? fmtDate(s.shift_end) : <StatusBadge variant="cyan">Open</StatusBadge>}</td>
                  <td style={{ padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                    {s.variance_sen != null ? `${business.currency} ${(s.variance_sen / 100).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                    {s.flagged && <StatusBadge variant="amber">Flagged</StatusBadge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
