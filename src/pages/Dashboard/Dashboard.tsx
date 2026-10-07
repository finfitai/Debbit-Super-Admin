import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import StatCard from '../../components/molecules/StatCard'
import { dashboardStyles } from './Dashboard.styles'

interface SalesRow {
  sale_date: string
  total: number
}

interface SyncSummary {
  totalBusinesses: number
  activeWorkstations: number
  recentSales: number
  openTickets: number
}

interface DashboardPayload {
  ok?: boolean
  error?: string
  summary?: SyncSummary
  chart?: SalesRow[]
  todayRevenue?: number
  primaryCurrency?: string | null
  byCurrency?: Record<string, { today: number; period: number }>
}

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Dashboard() {
  const [period, setPeriod]             = useState<7 | 14 | 30>(7)   // days shown in the chart and the revenue totals
  const [salesChart, setSalesChart]     = useState<SalesRow[]>([])
  const [summary, setSummary]           = useState<SyncSummary | null>(null)
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [currency, setCurrency]         = useState<string | null>(null)
  const [byCurrency, setByCurrency]     = useState<Record<string, { today: number; period: number }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Everything comes from the admin-dashboard Edge Function (service role, super-admin checked). There is deliberately no
      // direct-table fallback: with only the anon key, row-level security hides every tenant's rows and the numbers would be
      // zeros that look real.
      const { data, error } = await supabase.functions.invoke<DashboardPayload>('admin-dashboard', {
        body: { days: period },
      })
      if (error || !data?.ok) {
        setLoadError(error?.message || data?.error || 'Failed to load the dashboard')
        return
      }
      setSalesChart((data.chart ?? []) as SalesRow[])
      setTodayRevenue(typeof data.todayRevenue === 'number' ? data.todayRevenue : 0)
      setCurrency(data.primaryCurrency ?? null)
      setByCurrency(data.byCurrency ?? {})
      setSummary(
        data.summary
          ? {
              totalBusinesses: data.summary.totalBusinesses ?? 0,
              activeWorkstations: data.summary.activeWorkstations ?? 0,
              recentSales: data.summary.recentSales ?? 0,
              openTickets: data.summary.openTickets ?? 0,
            }
          : null
      )
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load the dashboard')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { void load() }, [load])

  const otherCurrencies = Object.entries(byCurrency).filter(([c]) => c !== currency)

  // SVG sparkline
  const maxSale = Math.max(...salesChart.map(r => r.total), 1)
  const W = 450, H = 120
  const pts = salesChart.map((r, i) => {
    const x = (i / (salesChart.length - 1)) * W
    const y = H - (r.total / maxSale) * (H - 20)
    return `${x},${y}`
  }).join(' ')
  const areaPath = salesChart.length > 1
    ? `M ${salesChart.map((r, i) => {
        const x = (i / (salesChart.length - 1)) * W
        const y = H - (r.total / maxSale) * (H - 20)
        return `${x} ${y}`
      }).join(' L ')} L ${W} ${H} L 0 ${H} Z`
    : ''
  const linePath = salesChart.length > 1
    ? `M ${pts.split(' ').map((p, i) => (i === 0 ? p : p)).join(' L ')}`
    : ''

  return (
    <div className="fade-in">
      {/* Greeting Header */}
      <div style={dashboardStyles.headerRow}>
        <div>
          <h1 style={dashboardStyles.title}>
            {loading ? 'Loading…' : `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, Admin`}
          </h1>
          <p style={dashboardStyles.subtitle}>
            {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · here&apos;s what matters right now.
          </p>
        </div>

        {/* Period: how many days the chart and the revenue totals cover */}
        <div style={dashboardStyles.filterGroup}>
          {([[7, 'Week'], [14, 'Fortnight'], [30, 'Month']] as const).map(([d, label]) => (
            <button
              key={d}
              className="btn btn-sm"
              style={{
                borderRadius: '99px',
                background: period === d ? 'var(--purple-main)' : 'transparent',
                color: period === d ? '#fff' : 'var(--text-secondary)',
                padding: '4px 14px',
              }}
              onClick={() => setPeriod(d)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>⚠️ {loadError}</div>}

      {/* Today's Sales Card */}
      <div className="card" style={{ marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={dashboardStyles.salesHeader}>
          <div>
            <div style={dashboardStyles.salesLabel}>TODAY&apos;S SALES</div>
            <div style={dashboardStyles.salesValue}>
              {todayRevenue !== null ? `${currency ?? ''} ${fmt(todayRevenue)}`.trim() : 'Loading…'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              {loading ? '…' : `Last ${period} days total: ${currency ?? ''} ${fmt(summary?.recentSales ?? 0)}`.replace('  ', ' ')}
              {otherCurrencies.length > 0 && <div style={{ marginTop: '4px' }}>Also: {otherCurrencies.map(([c, v]) => `${c} ${fmt(v.period)}`).join(' · ')}</div>}
            </div>
          </div>

          {/* SVG Sparkline */}
          <div style={{ width: '450px', height: '140px' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--purple-main)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--purple-main)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {areaPath && <path d={areaPath} fill="url(#salesGrad)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--purple-main)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {salesChart.length > 0 && (
                <circle
                  cx={(salesChart.length - 1) / (salesChart.length - 1) * W}
                  cy={H - (salesChart[salesChart.length - 1].total / maxSale) * (H - 20)}
                  r="5"
                  fill="var(--purple-main)"
                />
              )}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>{period} days ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Metric KPI Grid */}
      <div style={dashboardStyles.kpiGrid}>
        <StatCard
          title="REGISTERED BUSINESSES"
          value={loading ? '…' : String(summary?.totalBusinesses ?? 0)}
          subtext="across all tenants"
          accentColor="violet"
        />
        <StatCard
          title="ACTIVE WORKSTATIONS"
          value={loading ? '…' : String(summary?.activeWorkstations ?? 0)}
          subtext="POS terminals online"
          accentColor="green"
        />
        <StatCard
          title={`${period}-DAY REVENUE`}
          value={loading ? '…' : `${currency ?? ''} ${fmt(summary?.recentSales ?? 0)}`.trim()}
          subtext={otherCurrencies.length > 0 ? `${currency} only — plus ${otherCurrencies.map(([c]) => c).join(', ')}` : 'across all businesses'}
          accentColor="blue"
        />
        <StatCard
          title="OPEN SUPPORT TICKETS"
          value={loading ? '…' : String(summary?.openTickets ?? 0)}
          subtext="pending resolution"
          accentColor={summary?.openTickets ? 'red' : 'green'}
        />
      </div>

      {/* Platform Status Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px', color: 'var(--amber)' }}>✨</span>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            debbit says <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— platform health overview</span>
          </h2>
        </div>

        <div style={dashboardStyles.insightsGrid}>
          <div className="card" style={{ borderLeft: '4px solid var(--purple-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary?.totalBusinesses ?? '—'} businesses registered
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Total merchant organizations onboarded across all regions.
            </p>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>🖥️</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary?.activeWorkstations ?? '—'} active POS terminals
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Workstation devices currently registered and active.
            </p>
          </div>

          <div className="card" style={{ borderLeft: (summary?.openTickets ?? 0) > 0 ? '4px solid var(--amber)' : '4px solid var(--cyan)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>{(summary?.openTickets ?? 0) > 0 ? '🎫' : '✅'}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary?.openTickets ?? '—'} open support tickets
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {(summary?.openTickets ?? 0) > 0
                ? 'Some tickets need attention. Review in support tab.'
                : 'All support tickets resolved — platform is healthy.'}
            </p>
          </div>
        </div>
      </div>

      {/* Floating Ask AI Button */}
      <button className="floating-ai-btn" onClick={() => void load()}>
        <span>🔄</span> Refresh data
      </button>
    </div>
  )
}
