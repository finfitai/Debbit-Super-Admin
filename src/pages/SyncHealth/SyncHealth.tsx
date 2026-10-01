import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge, { BadgeVariant } from '../../components/atoms/StatusBadge'
import { ColumnDef } from '../../types'
import { syncHealthStyles } from './SyncHealth.styles'

// Matches `workstation_devices` table schema in Supabase (db/010_day29_workstation_sync.sql)
interface WorkstationDevice {
  id: string
  business_id: string
  code: string
  name: string
  branch_name?: string
  is_active: boolean
  updated_at?: string
}

// Matches `workstation_audit_logs` table schema in Supabase (db/010_day29_workstation_sync.sql)
interface WorkstationAuditLog {
  id: string
  business_id: string
  workstation_id?: string
  workstation_code?: string
  branch_name?: string
  event_type: string
  entity_type?: string
  entity_id?: string
  created_at: string
}

export default function SyncHealth() {
  const [workstations, setWorkstations] = useState<WorkstationDevice[]>([])
  const [auditLogs, setAuditLogs]       = useState<WorkstationAuditLog[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; workstations?: WorkstationDevice[]; auditLogs?: WorkstationAuditLog[] }>('admin-sync-health', {
        body: { days: 30 },
      })

      if (!error && data?.ok) {
        setWorkstations((data.workstations ?? []) as WorkstationDevice[])
        setAuditLogs((data.auditLogs ?? []) as WorkstationAuditLog[])
        return
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

      const [wsRes, auditRes] = await Promise.all([
        supabase
          .from('workstation_devices')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('workstation_audit_logs')
          .select('*')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(150),
      ])

      if (wsRes.error) setError(wsRes.error.message)
      else setWorkstations((wsRes.data ?? []) as WorkstationDevice[])

      if (auditRes.error && !wsRes.error) setError(auditRes.error.message)
      else setAuditLogs((auditRes.data ?? []) as WorkstationAuditLog[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const wsColumns: ColumnDef<WorkstationDevice>[] = [
    {
      key: 'code',
      header: 'Workstation',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.code} · {r.name}</div>
          {r.branch_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.branch_name}</div>}
        </div>
      ),
    },
    {
      key: 'business_id',
      header: 'Business ID',
      width: '180px',
      render: (r) => <code style={{ fontSize: '11px', color: 'var(--cyan)' }}>{r.business_id.slice(0, 8)}…</code>,
    },
    {
      key: 'updated_at',
      header: 'Last Seen',
      width: '160px',
      render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleString() : '—',
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '110px',
      render: (r) => (
        <StatusBadge variant={r.is_active ? 'green' : 'muted'}>
          {r.is_active ? 'Active' : 'Offline'}
        </StatusBadge>
      ),
    },
  ]

  const auditBadge: Record<string, BadgeVariant> = {
    LOGIN:        'green',
    LOGOUT:       'muted',
    SYNC_PUSH:    'cyan',
    SYNC_PULL:    'cyan',
    AUTH_FAIL:    'red',
    CRASH:        'red',
    KEY_REVOKED:  'red',
    UPDATE:       'purple',
  }

  const auditColumns: ColumnDef<WorkstationAuditLog>[] = [
    {
      key: 'created_at',
      header: 'Time',
      width: '160px',
      render: (r) => new Date(r.created_at).toLocaleString(),
    },
    {
      key: 'event_type',
      header: 'Event',
      width: '140px',
      render: (r) => (
        <StatusBadge variant={auditBadge[r.event_type] || 'purple'}>{r.event_type}</StatusBadge>
      ),
    },
    {
      key: 'workstation_code',
      header: 'Workstation',
      width: '150px',
      render: (r) => r.workstation_code ?? '—',
    },
    {
      key: 'entity_type',
      header: 'Detail',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {r.entity_type ? `${r.entity_type}${r.entity_id ? ` ${r.entity_id}` : ''}` : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="fade-in">
      <div style={syncHealthStyles.headerRow}>
        <div>
          <h1 style={syncHealthStyles.title}>Sync Health &amp; Workstations</h1>
          <p style={syncHealthStyles.subtitle}>Monitor offline-first SQLite database synchronization across POS registers</p>
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

      <div style={{ marginBottom: '32px' }}>
        <DataTable
          title={`Registered Workstations (${workstations.length})`}
          columns={wsColumns}
          data={workstations}
          loading={loading}
          searchPlaceholder="Search workstation code, business, platform…"
          rowKey={r => r.id}
        />
      </div>

      <div>
        <DataTable
          title={`Workstation Audit Logs — last 30 days (${auditLogs.length})`}
          columns={auditColumns}
          data={auditLogs}
          loading={loading}
          searchPlaceholder="Search event type, workstation…"
          rowKey={r => r.id}
        />
      </div>
    </div>
  )
}
