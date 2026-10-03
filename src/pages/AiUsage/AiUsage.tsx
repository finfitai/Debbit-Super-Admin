import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DataTable from '../../components/organisms/DataTable/DataTable'
import StatusBadge from '../../components/atoms/StatusBadge'
import { ColumnDef } from '../../types'
import { aiUsageStyles as s } from './AiUsage.styles'

interface Row {
  business_id: string; name: string; country: string
  requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; blocked: number
  last_used: string | null; enabled: boolean; monthly_token_budget: number | null; note: string
}
type Config = Record<string, unknown>

const fmt = (n: number) => n.toLocaleString()

async function call<T = unknown>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string } & T>('admin-ai-usage', { body })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.error ?? 'Request failed')
  return data
}

export default function AiUsage() {
  const [rows, setRows] = useState<Row[]>([])
  const [config, setConfig] = useState<Config>({})
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await call<{ rows: Row[]; config: Config }>({ action: 'overview', month })
      setRows(d.rows ?? []); setConfig(d.config ?? {})
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') } finally { setLoading(false) }
  }, [month])
  useEffect(() => { void load() }, [load])

  async function act(body: Record<string, unknown>, ok: string) {
    setError(null); setNotice(null)
    try { await call(body); setNotice(ok); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  const killed = config.kill_switch === true
  const priceIn = typeof config.price_input_per_mtok === 'number' ? config.price_input_per_mtok : null
  const priceOut = typeof config.price_output_per_mtok === 'number' ? config.price_output_per_mtok : null
  const cost = (r: Row) => (priceIn !== null && priceOut !== null ? (r.input_tokens / 1e6) * priceIn + (r.output_tokens / 1e6) * priceOut : null)
  const totals = rows.reduce((a, r) => ({ req: a.req + r.requests, inp: a.inp + r.input_tokens, out: a.out + r.output_tokens, blocked: a.blocked + r.blocked }), { req: 0, inp: 0, out: 0, blocked: 0 })

  function editBudget(r: Row) {
    const cur = r.monthly_token_budget === null ? '' : String(r.monthly_token_budget)
    const v = window.prompt(`Monthly token budget for ${r.name}\n(blank = use the default ${config.default_monthly_token_budget === null ? 'unlimited' : fmt(Number(config.default_monthly_token_budget))})`, cur)
    if (v === null) return
    const n = v.trim() === '' ? null : Number(v.replace(/,/g, ''))
    if (n !== null && (!Number.isInteger(n) || n < 0)) { setError('Enter a whole number of tokens, or leave blank'); return }
    void act({ action: 'set_business', business_id: r.business_id, monthly_token_budget: n }, 'Budget updated')
  }
  function editConfig(key: string, label: string, parse: (v: string) => unknown) {
    const v = window.prompt(`${label}\n(current: ${JSON.stringify(config[key])})`, config[key] === null ? '' : String(config[key]))
    if (v === null) return
    void act({ action: 'set_config', key, value: parse(v) }, `${label} updated`)
  }
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')))

  const columns: ColumnDef<Row>[] = [
    { key: 'name', header: 'Business', render: (r) => <span>{r.name} <span style={{ color: 'var(--text-secondary)' }}>· {r.country}</span></span> },
    { key: 'requests', header: 'Requests', align: 'right', render: (r) => fmt(r.requests) },
    { key: 'input_tokens', header: 'Input tokens', align: 'right', render: (r) => fmt(r.input_tokens) },
    { key: 'output_tokens', header: 'Output tokens', align: 'right', render: (r) => fmt(r.output_tokens) },
    { key: 'cost', header: 'Est. cost', align: 'right', render: (r) => (cost(r) === null ? '—' : `$${cost(r)!.toFixed(2)}`) },
    {
      key: 'monthly_token_budget', header: 'Budget', align: 'right',
      render: (r) => {
        const b = r.monthly_token_budget ?? (config.default_monthly_token_budget as number | null)
        if (b === null || b === undefined) return 'Unlimited'
        const used = r.input_tokens + r.output_tokens
        return <span style={{ color: used >= b ? '#ef4444' : undefined }}>{fmt(used)} / {fmt(b)}{r.monthly_token_budget === null ? ' (default)' : ''}</span>
      },
    },
    { key: 'blocked', header: 'Blocked', align: 'right', render: (r) => (r.blocked ? <StatusBadge variant="amber">{r.blocked}</StatusBadge> : '0') },
    { key: 'enabled', header: 'AI', render: (r) => <StatusBadge variant={r.enabled ? 'green' : 'red'}>{r.enabled ? 'On' : 'Off'}</StatusBadge> },
  ]

  return (
    <div className="fade-in">
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>AI Usage &amp; Controls</h1>
          <p style={s.subtitle}>Every AI call from every customer goes through the proxy. The key lives only on the server.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
          <button className="btn btn-primary" onClick={() => void load()}>🔄 Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      {notice && <div className="alert" style={{ marginBottom: 16 }}>✓ {notice}</div>}

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLabel}>Requests</div><div style={s.cardValue}>{fmt(totals.req)}</div></div>
        <div style={s.card}><div style={s.cardLabel}>Input tokens</div><div style={s.cardValue}>{fmt(totals.inp)}</div></div>
        <div style={s.card}><div style={s.cardLabel}>Output tokens</div><div style={s.cardValue}>{fmt(totals.out)}</div></div>
        <div style={s.card}><div style={s.cardLabel}>Blocked</div><div style={s.cardValue}>{fmt(totals.blocked)}</div></div>
      </div>

      <div style={s.panel}>
        <div style={s.panelTitle}>Global controls</div>
        <div style={s.controls}>
          <button className={'btn ' + (killed ? 'btn-primary' : '')} onClick={() => void act({ action: 'set_config', key: 'kill_switch', value: !killed }, killed ? 'AI turned back on' : 'AI switched off for everyone')}>
            {killed ? '⛔ Kill switch ON — click to restore AI' : 'Kill switch (off) — click to stop all AI'}
          </button>
          <button className="btn" onClick={() => editConfig('model', 'Model', (v) => v.trim())}>Model: {String(config.model ?? '—')}</button>
          <button className="btn" onClick={() => editConfig('default_monthly_token_budget', 'Default monthly token budget (blank = unlimited)', num)}>Default budget: {config.default_monthly_token_budget === null ? 'Unlimited' : fmt(Number(config.default_monthly_token_budget ?? 0))}</button>
          <button className="btn" onClick={() => editConfig('max_output_tokens', 'Max output tokens per reply', (v) => Number(v))}>Max reply: {String(config.max_output_tokens ?? '—')}</button>
          <button className="btn" onClick={() => editConfig('max_requests_per_minute', 'Max requests per minute, per business', (v) => Number(v))}>Rate: {String(config.max_requests_per_minute ?? '—')}/min</button>
          <button className="btn" onClick={() => editConfig('price_input_per_mtok', 'Price per million INPUT tokens (USD, blank to hide cost)', num)}>Input $/M: {priceIn ?? '—'}</button>
          <button className="btn" onClick={() => editConfig('price_output_per_mtok', 'Price per million OUTPUT tokens (USD, blank to hide cost)', num)}>Output $/M: {priceOut ?? '—'}</button>
        </div>
      </div>

      <DataTable
        title={`Businesses using AI — ${month}`}
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search business…"
        rowKey={(r) => r.business_id}
        actions={(r) => (
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => editBudget(r)}>Budget</button>
            <button className="btn" onClick={() => void act({ action: 'set_business', business_id: r.business_id, enabled: !r.enabled }, r.enabled ? `AI off for ${r.name}` : `AI on for ${r.name}`)}>{r.enabled ? 'Turn off' : 'Turn on'}</button>
          </span>
        )}
      />
    </div>
  )
}
