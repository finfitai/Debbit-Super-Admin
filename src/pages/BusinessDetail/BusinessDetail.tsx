import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import StatusBadge from '../../components/atoms/StatusBadge'
import StatCard from '../../components/molecules/StatCard'
import { BusinessDetailDTO, BusinessDetailStats, WorkstationDeviceRow, SyncDeviceRow, ShiftRow } from '../../types'
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
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

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
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
            POS Terminals ({devices.length})
          </h2>
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
                  <StatusBadge variant={d.revoked_at ? 'red' : 'green'}>{d.revoked_at ? 'Revoked' : 'Active'}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>
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
