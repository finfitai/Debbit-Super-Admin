// In-memory stand-in for the supabase client, just enough for ai-proxy + deviceAuth.
export const DB = { sync_devices: [], ai_global_config: [], ai_business_limits: [], ai_usage: [] }
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.head = false }
  select(_c, o) { this.head = !!o?.head; this.count = o?.count; return this }
  eq(k, v) { this.f.push((r) => r[k] === v); return this }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this }
  insert(row) { DB[this.t].push({ ...row, created_at: new Date().toISOString() }); return Promise.resolve({ error: null }) }
  update(patch) { this.op = 'update'; this.patch = patch; return this }
  rows() { return DB[this.t].filter((r) => this.f.every((f) => f(r))) }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] ?? null, error: null }) }
  then(res, rej) {
    if (this.op === 'update') { this.rows().forEach((r) => Object.assign(r, this.patch)); return Promise.resolve({ error: null }).then(res, rej) }
    const rows = this.rows()
    return Promise.resolve({ data: this.head ? null : rows, count: rows.length, error: null }).then(res, rej)
  }
}
export function createClient() {
  return {
    from: (t) => new Q(t),
    rpc: (name, a) => {
      const by = {}
      for (const u of DB.ai_usage.filter((u) => u.status === 'OK' && u.created_at >= a.p_from && u.created_at < a.p_to)) {
        by[u.business_id] ??= { business_id: u.business_id, input_tokens: 0, output_tokens: 0 }
        by[u.business_id].input_tokens += u.input_tokens; by[u.business_id].output_tokens += u.output_tokens
      }
      return Promise.resolve({ data: Object.values(by), error: null })
    },
  }
}
