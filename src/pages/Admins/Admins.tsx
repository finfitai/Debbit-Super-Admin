import { useEffect, useState, useCallback, FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge from '../../components/atoms/StatusBadge'
import { ColumnDef, SuperAdminRow } from '../../types'
import { adminsStyles } from './Admins.styles'

interface AdminsResponse {
  ok?: boolean
  admins?: SuperAdminRow[]
  admin?: SuperAdminRow
  error?: string
}

// Manage the people who can use THIS portal (the super_admins allowlist). Everything goes through the admin-admins Edge
// Function, which re-checks that the caller is an active super admin before it touches anything.
export default function Admins() {
  const { session } = useAuth()
  const myEmail = session?.user?.email?.toLowerCase() ?? ''

  const [data, setData]           = useState<SuperAdminRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busyId, setBusyId]       = useState<string | null>(null)

  const [email, setEmail]       = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)

  const flash = (msg: string) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<AdminsResponse>('admin-admins', { body: { op: 'list' } })
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to load admins')
        setData([])
      } else {
        setData(resp.admins ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function createAdmin(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<AdminsResponse>('admin-admins', {
        body: { op: 'create', email, full_name: fullName, password },
      })
      if (err || !resp?.ok || !resp.admin) {
        setError(err?.message || resp?.error || 'Failed to create admin')
        return
      }
      const created = resp.admin
      setData(prev => [created, ...prev.filter(a => a.id !== created.id)])
      flash(`${created.email} can now sign in to this portal.`)
      setEmail(''); setFullName(''); setPassword('')
    } finally {
      setCreating(false)
    }
  }

  async function setActive(row: SuperAdminRow, active: boolean) {
    setBusyId(row.id)
    setError(null)
    try {
      const { data: resp, error: err } = await supabase.functions.invoke<AdminsResponse>('admin-admins', {
        body: { op: active ? 'activate' : 'deactivate', id: row.id },
      })
      if (err || !resp?.ok) {
        setError(err?.message || resp?.error || 'Failed to update admin')
        return
      }
      setData(prev => prev.map(a => a.id === row.id ? { ...a, is_active: active } : a))
      flash(`${row.email} ${active ? 'reactivated' : 'deactivated'}.`)
    } finally {
      setBusyId(null)
    }
  }

  const columns: ColumnDef<SuperAdminRow>[] = [
    {
      key: 'email',
      header: 'Admin',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {r.full_name || r.email}{r.email.toLowerCase() === myEmail ? ' (you)' : ''}
          </div>
          {r.full_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.email}</div>}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '140px',
      render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '110px',
      render: (r) => <StatusBadge variant={r.is_active ? 'green' : 'muted'}>{r.is_active ? 'Active' : 'Inactive'}</StatusBadge>,
    },
  ]

  const actions = (row: SuperAdminRow) => {
    const isMe = row.email.toLowerCase() === myEmail
    return (
      <button
        className={`btn btn-sm ${row.is_active ? 'btn-danger' : 'btn-success'}`}
        disabled={busyId === row.id || (isMe && row.is_active)}
        title={isMe && row.is_active ? "You can't deactivate your own account" : undefined}
        onClick={() => void setActive(row, !row.is_active)}
      >
        {busyId === row.id ? '…' : row.is_active ? 'Deactivate' : 'Reactivate'}
      </button>
    )
  }

  return (
    <div className="fade-in">
      <div style={adminsStyles.headerRow}>
        <div>
          <h1 style={adminsStyles.title}>Portal Admins</h1>
          <p style={adminsStyles.subtitle}>The people who can sign in to this Super Admin Portal</p>
        </div>
        <button className="btn btn-primary" onClick={() => void load()}>🔄 Refresh</button>
      </div>

      {actionMsg && <div className="alert alert-success" style={{ marginBottom: '20px' }}>✓ {actionMsg}</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>⚠️ {error}</div>}

      <div style={adminsStyles.grid}>
        <form style={adminsStyles.formCard} onSubmit={(e) => void createAdmin(e)}>
          <div style={adminsStyles.formTitle}>Add an admin</div>
          <div style={adminsStyles.formGroup}>
            <label style={adminsStyles.label} htmlFor="admin-email">Email</label>
            <input id="admin-email" style={adminsStyles.input} type="email" required autoComplete="off"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div style={adminsStyles.formGroup}>
            <label style={adminsStyles.label} htmlFor="admin-name">Full name</label>
            <input id="admin-name" style={adminsStyles.input} type="text" autoComplete="off"
              value={fullName} onChange={e => setFullName(e.target.value)} placeholder="optional" />
          </div>
          <div style={adminsStyles.formGroup}>
            <label style={adminsStyles.label} htmlFor="admin-password">Password</label>
            <input id="admin-password" style={adminsStyles.input} type="password" required minLength={8} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="at least 8 characters" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add admin'}</button>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
            Creates their sign-in and grants platform-wide access. If they already have an account the password above is ignored
            and they simply regain access.
          </p>
        </form>

        <DataTable
          title={`Admins (${data.length})`}
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search by name or email…"
          rowKey={(r) => r.id}
          actions={actions}
        />
      </div>
    </div>
  )
}
