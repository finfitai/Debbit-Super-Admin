import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge from '../../components/atoms/StatusBadge'
import { BusinessMemberRow, ColumnDef, StaffLoginRow } from '../../types'
import { usersStyles } from './Users.styles'

type Kind = 'staff' | 'member'

interface ListResponse {
  ok?: boolean
  staff?: StaffLoginRow[]
  members?: BusinessMemberRow[]
  error?: string
}

// Two different things get called "users". The desktop app signs in with a STAFF LOGIN (staff_accounts) — switching one off
// here cuts that person's computers off at their next sync. A web MEMBER (business_members) is the web dashboard's access row.
export default function Users() {
  const [kind, setKind]       = useState<Kind>('staff')
  const [staff, setStaff]     = useState<StaffLoginRow[]>([])
  const [members, setMembers] = useState<BusinessMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<ListResponse>('admin-users')
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to load users')
        setStaff([]); setMembers([])
      } else {
        setStaff(resp.staff ?? [])
        setMembers(resp.members ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setStaff([]); setMembers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function toggle(which: Kind, id: string, label: string) {
    setBusyId(id)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<{ ok?: boolean; member?: { is_active: boolean }; error?: string }>('admin-users', {
        body: { op: 'toggle', kind: which, id },
      })
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to update')
        return
      }
      const next = resp.member?.is_active ?? false
      if (which === 'staff') setStaff(prev => prev.map(r => r.id === id ? { ...r, is_active: next } : r))
      else setMembers(prev => prev.map(r => r.id === id ? { ...r, is_active: next } : r))
      setActionMsg(`${label} ${next ? 'enabled' : 'disabled'}.`)
      setTimeout(() => setActionMsg(null), 3000)
    } finally {
      setBusyId(null)
    }
  }

  const activeBadge = (active: boolean) => (
    <StatusBadge variant={active ? 'green' : 'muted'}>{active ? 'Active' : 'Inactive'}</StatusBadge>
  )

  const staffColumns: ColumnDef<StaffLoginRow>[] = [
    {
      key: 'full_name',
      header: 'Login',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.full_name || r.email}</div>
          {r.full_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.email}</div>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '130px',
      render: (r) => <StatusBadge variant={r.role === 'MASTER' ? 'purple' : 'muted'}>{r.role}</StatusBadge>,
    },
    { key: 'business_name', header: 'Business', width: '200px', render: (r) => r.business_name ?? r.business_id.slice(0, 8) + '…' },
    { key: 'created_at', header: 'Created', width: '130px', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    { key: 'is_active', header: 'Status', width: '110px', render: (r) => activeBadge(r.is_active) },
  ]

  const memberColumns: ColumnDef<BusinessMemberRow>[] = [
    {
      key: 'users',
      header: 'User',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.users?.full_name ?? r.user_id.slice(0, 8) + '…'}</div>
          {r.users?.email && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.users.email}</div>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '140px',
      render: (r) => <StatusBadge variant={r.role === 'OWNER' || r.role === 'ADMIN' ? 'purple' : 'muted'}>{r.role}</StatusBadge>,
    },
    { key: 'businesses', header: 'Business', width: '200px', render: (r) => r.businesses?.name ?? r.business_id.slice(0, 8) + '…' },
    { key: 'joined_at', header: 'Joined', width: '150px', render: (r) => r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '—' },
    { key: 'is_active', header: 'Status', width: '110px', render: (r) => activeBadge(r.is_active) },
  ]

  const toggleButton = (active: boolean, id: string, onClick: () => void) => (
    <button className={`btn btn-sm ${active ? 'btn-danger' : 'btn-success'}`} disabled={busyId === id} onClick={onClick}>
      {busyId === id ? '…' : active ? 'Disable' : 'Enable'}
    </button>
  )

  return (
    <div className="fade-in">
      <div style={usersStyles.headerRow}>
        <div>
          <h1 style={usersStyles.title}>Platform Users</h1>
          <p style={usersStyles.subtitle}>
            {kind === 'staff'
              ? 'Logins the desktop app signs in with — disabling one cuts that person off at their next sync'
              : 'Web dashboard access across all businesses'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {([['staff', `Desktop logins (${staff.length})`], ['member', `Web members (${members.length})`]] as const).map(([k, label]) => (
              <button
                key={k}
                className="btn btn-sm"
                style={{
                  borderRadius: '99px',
                  background: kind === k ? 'var(--purple-main)' : 'transparent',
                  color: kind === k ? '#fff' : 'var(--text-secondary)',
                }}
                onClick={() => setKind(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => void load()}>🔄 Refresh</button>
        </div>
      </div>

      {actionMsg && <div className="alert alert-success" style={{ marginBottom: '20px' }}>✓ {actionMsg}</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>⚠️ {error}</div>}

      {kind === 'staff' ? (
        <DataTable
          title={`Desktop logins (${staff.length})`}
          columns={staffColumns}
          data={staff}
          loading={loading}
          searchPlaceholder="Search by name, email, role, business…"
          rowKey={(r) => r.id}
          actions={(r) => toggleButton(r.is_active, r.id, () => void toggle('staff', r.id, r.full_name || r.email))}
        />
      ) : (
        <DataTable
          title={`Web members (${members.length})`}
          columns={memberColumns}
          data={members}
          loading={loading}
          searchPlaceholder="Search by user name, email, role, business…"
          rowKey={(r) => r.id}
          actions={(r) => toggleButton(r.is_active, r.id, () => void toggle('member', r.id, r.users?.full_name || r.users?.email || 'User'))}
        />
      )}
    </div>
  )
}
