import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import StatusBadge from '../../components/atoms/StatusBadge'
import StatCard from '../../components/molecules/StatCard'
import { BusinessDetailDTO, BusinessDetailStats } from '../../types'
import { businessDetailStyles } from './BusinessDetail.styles'

export default function BusinessDetail() {
  const { id } = useParams<{ id: string }>()
  const [business, setBusiness] = useState<BusinessDetailDTO | null>(null)
  const [stats, setStats]       = useState<BusinessDetailStats | null>(null)
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
    </div>
  )
}
