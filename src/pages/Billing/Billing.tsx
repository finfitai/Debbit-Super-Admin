import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge, { BadgeVariant } from '../../components/atoms/StatusBadge'
import StatCard from '../../components/molecules/StatCard'
import { BillingBusinessRow, SubscriptionStatus, ColumnDef } from '../../types'
import { billingStyles } from './Billing.styles'

// Read-only: subscription_status is set on signup and kept current by
// Stripe webhooks (see supabase/migrations/045_billing_subscription.sql).
// Editing it here would just get silently overwritten on the next webhook
// delivery and risks the portal disagreeing with what Stripe actually
// billed — so this page surfaces who's paying vs. on trial, it doesn't
// let you hand-edit billing state.
export default function Billing() {
  const [data, setData]       = useState<BillingBusinessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<{ ok?: boolean; businesses?: BillingBusinessRow[]; error?: string }>('admin-billing')
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to load billing data')
        setData([])
      } else {
        setData((resp.businesses ?? []) as BillingBusinessRow[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const statusBadgeVariants: Record<SubscriptionStatus, BadgeVariant> = {
    active:    'green',
    trialing:  'cyan',
    past_due:  'amber',
    canceled:  'muted',
    unpaid:    'red',
  }

  function trialDaysLeft(row: BillingBusinessRow): number | null {
    if (row.subscription_status !== 'trialing' || !row.trial_ends_at) return null
    const ms = new Date(row.trial_ends_at).getTime() - Date.now()
    return Math.ceil(ms / 86400000)
  }

  const columns: ColumnDef<BillingBusinessRow>[] = [
    { key: 'name', header: 'Business', width: '220px' },
    { key: 'country', header: 'Country', width: '90px' },
    {
      key: 'subscription_status',
      header: 'Status',
      width: '130px',
      render: (r) => (
        <StatusBadge variant={statusBadgeVariants[r.subscription_status] || 'purple'}>
          {r.subscription_status}
        </StatusBadge>
      ),
    },
    {
      key: 'trial_ends_at',
      header: 'Trial',
      width: '180px',
      render: (r) => {
        const days = trialDaysLeft(r)
        if (days === null) return '—'
        if (days < 0) return <span style={{ color: 'var(--red)' }}>Expired {Math.abs(days)}d ago</span>
        return `${days} day${days === 1 ? '' : 's'} left`
      },
    },
    {
      key: 'current_period_end',
      header: 'Current Period End',
      width: '160px',
      render: (r) => r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : '—',
    },
    {
      key: 'stripe_customer_id',
      header: 'Stripe',
      width: '110px',
      render: (r) => (
        <StatusBadge variant={r.stripe_customer_id ? 'green' : 'muted'}>
          {r.stripe_customer_id ? 'Linked' : 'None'}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      header: 'Signed Up',
      width: '130px',
      render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
    },
  ]

  const payingCount = data.filter(r => r.subscription_status === 'active').length
  const trialingCount = data.filter(r => r.subscription_status === 'trialing').length
  const atRiskCount = data.filter(r => r.subscription_status === 'past_due' || r.subscription_status === 'unpaid').length

  return (
    <div className="fade-in">
      <div style={billingStyles.headerRow}>
        <div>
          <h1 style={billingStyles.title}>Billing &amp; Subscriptions</h1>
          <p style={billingStyles.subtitle}>Who&apos;s paying, who&apos;s on trial, and who needs follow-up</p>
        </div>
        <button className="btn btn-primary" onClick={() => void load()}>
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={billingStyles.kpiGrid}>
        <StatCard title="PAYING" value={loading ? '…' : String(payingCount)} subtext="active subscriptions" accentColor="green" />
        <StatCard title="ON TRIAL" value={loading ? '…' : String(trialingCount)} subtext="demo / free trial" accentColor="blue" />
        <StatCard
          title="NEEDS ATTENTION"
          value={loading ? '…' : String(atRiskCount)}
          subtext="past due or unpaid"
          accentColor={atRiskCount > 0 ? 'red' : 'green'}
        />
      </div>

      <DataTable
        title={`All Businesses (${data.length})`}
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Search business, country, status…"
        rowKey={r => r.id}
      />
    </div>
  )
}
