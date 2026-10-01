import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge from '../../components/atoms/StatusBadge'
import { BusinessRow, ColumnDef } from '../../types'
import { businessesStyles } from './Businesses.styles'

export default function Businesses() {
  const [data, setData]           = useState<BusinessRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; businesses?: BusinessRow[]; error?: string }>('admin-businesses')
      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to load businesses')
      }
      setData(data.businesses ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function toggleActive(row: BusinessRow) {
    const next = !row.is_active
    const { data, error: err } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('admin-business-action', {
      body: { id: row.id, action: next ? 'activate' : 'suspend' },
    })
    if (!err && data?.ok) {
      setData(prev => prev.map(item => item.id === row.id ? { ...item, is_active: next } : item))
      setActionMsg(`${String(row.name)} ${next ? 'activated' : 'suspended'}.`)
      setTimeout(() => setActionMsg(null), 3000)
    } else {
      setError(err?.message || data?.error || 'Failed to update business')
    }
  }

  const columns: ColumnDef<BusinessRow>[] = [
    {
      key: 'name',
      header: 'Business',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{String(r.name)}</div>
          {r.legal_name && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.legal_name}</div>
          )}
        </div>
      ),
    },
    { key: 'country',       header: 'Country',  width: '100px' },
    { key: 'currency',      header: 'Currency', width: '100px' },
    { key: 'business_type', header: 'Type',     width: '150px' },
    {
      key: 'created_at',
      header: 'Registered',
      width: '140px',
      render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '120px',
      render: (r) => (
        <StatusBadge variant={r.is_active ? 'green' : 'red'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
  ]

  const actions = (row: BusinessRow) => (
    <div style={businessesStyles.actionCell}>
      <Link to={`/businesses/${String(row.id)}`} className="btn btn-ghost btn-sm">View</Link>
      <button
        className={`btn btn-sm ${row.is_active ? 'btn-danger' : 'btn-success'}`}
        onClick={() => { void toggleActive(row) }}
      >
        {row.is_active ? 'Suspend' : 'Activate'}
      </button>
    </div>
  )

  return (
    <div className="fade-in">
      <div style={businessesStyles.headerRow}>
        <div>
          <h1 style={businessesStyles.title}>Businesses</h1>
          <p style={businessesStyles.subtitle}>Manage multi-tenant merchant organizations</p>
        </div>
        <button className="btn btn-primary" onClick={() => void load()}>
          🔄 Refresh
        </button>
      </div>

      {actionMsg && (
        <div className="alert alert-success" style={{ marginBottom: '20px' }}>
          ✓ {actionMsg}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      <DataTable
        title={`All Businesses (${data.length})`}
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Search by name, country, type…"
        rowKey={r => r.id}
        actions={actions}
      />
    </div>
  )
}
