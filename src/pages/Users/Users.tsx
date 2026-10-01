import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge from '../../components/atoms/StatusBadge'
import { ColumnDef } from '../../types'
import { usersStyles } from './Users.styles'

// Matches the `business_members` table with joined `businesses` data
interface BusinessMemberRow {
  business_id: string
  user_id: string
  role: string
  is_active: boolean
  joined_at: string
  users: { full_name?: string; email?: string } | null
  businesses: { name?: string } | null
}

export default function Users() {
  const [data, setData]       = useState<BusinessMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<{ ok?: boolean; members?: BusinessMemberRow[]; error?: string }>('admin-users')
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to load users')
        setData([])
      } else {
        setData((resp.members ?? []) as BusinessMemberRow[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const columns: ColumnDef<BusinessMemberRow>[] = [
    {
      key: 'users',
      header: 'User',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {r.users?.full_name ?? r.user_id.slice(0, 8) + '…'}
          </div>
          {r.users?.email && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.users.email}</div>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '140px',
      render: (r) => (
        <StatusBadge variant={r.role === 'OWNER' ? 'purple' : r.role === 'ADMIN' ? 'purple' : 'muted'}>
          {r.role}
        </StatusBadge>
      ),
    },
    {
      key: 'businesses',
      header: 'Business',
      width: '200px',
      render: (r) => r.businesses?.name ?? r.business_id.slice(0, 8) + '…',
    },
    {
      key: 'joined_at',
      header: 'Joined',
      width: '150px',
      render: (r) => r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '—',
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '110px',
      render: (r) => (
        <StatusBadge variant={r.is_active ? 'green' : 'muted'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
  ]

  return (
    <div className="fade-in">
      <div style={usersStyles.headerRow}>
        <div>
          <h1 style={usersStyles.title}>Platform Users</h1>
          <p style={usersStyles.subtitle}>Registered merchant staff and their roles across all businesses</p>
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

      <DataTable
        title={`All Members (${data.length})`}
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Search by user name, email, role, business…"
        rowKey={(r) => `${r.business_id}_${r.user_id}`}
      />
    </div>
  )
}
