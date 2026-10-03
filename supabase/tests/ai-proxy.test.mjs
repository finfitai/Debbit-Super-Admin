// Offline test of the ai-proxy Edge Function logic (no Deno / Supabase needed):
//   npm run test:ai-proxy
import { build } from 'esbuild'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import fs from 'node:fs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-proxy-'))
fs.copyFileSync(path.join(HERE, 'fake-supabase.mjs'), `${SP}/fake-supabase.mjs`)
const out = `${SP}/ai-proxy.bundle.mjs`
await build({
  entryPoints: [path.join(HERE, '../functions/ai-proxy/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out,
  plugins: [{ name: 'fake', setup(b) { b.onResolve({ filter: /^https:\/\/esm\.sh/ }, () => ({ path: `${SP}/fake-supabase.mjs`, external: true })) } }],
})
const { DB } = await import(`${SP}/fake-supabase.mjs`)
let handler
globalThis.Deno = { serve: (h) => { handler = h }, env: { get: (k) => ({ ANTHROPIC_API_KEY: 'sk-ant-SERVER', SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' }[k]) } }
await import(out + '?v=1')
let upstreamCalls = []
globalThis.fetch = async (url, init) => { upstreamCalls.push({ url, init }); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200 }) }
const BIZ = 'biz-1', DEV = 'dev-1', SECRET = 'devsecret'
DB.sync_devices.push({ device_id: DEV, business_id: BIZ, device_secret: SECRET, revoked_at: null, role: 'DESKTOP' })
DB.ai_global_config.push(...[['kill_switch', false], ['model', 'claude-sonnet-5-5'], ['max_output_tokens', 2048], ['default_monthly_token_budget', 1000], ['max_requests_per_minute', 1000]].map(([key, value]) => ({ key, value })))
const call = async (payload, { device = DEV, secret = SECRET, ts = Date.now().toString() } = {}) => {
  const body = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  const headers = { 'x-debbit-sig': sig, 'x-debbit-ts': ts, 'content-length': String(Buffer.byteLength(body)) }
  if (device) headers['x-debbit-device'] = device
  const res = await handler(new Request('http://x/ai-proxy', { method: 'POST', headers, body }))
  return { status: res.status, json: await res.json() }
}
const results = []
const t = (name, ok, extra) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)) }
const req = { messages: [{ role: 'user', content: 'hello' }], system: 's', max_tokens: 99999, model: 'claude-opus-WRONG', evil: 'x' }

let r = await call(req)
t('valid device call forwards and returns Anthropic body', r.status === 200 && r.json.content?.[0]?.text === 'hi', r)
const sent = JSON.parse(upstreamCalls[0].init.body)
t('server forces its own model', sent.model === 'claude-sonnet-5-5', sent)
t('max_tokens is capped', sent.max_tokens === 2048, sent)
t('unknown fields are dropped', sent.evil === undefined, sent)
t('server key is used, never sent by client', upstreamCalls[0].init.headers['x-api-key'] === 'sk-ant-SERVER')
t('usage recorded with business from the device', DB.ai_usage.length === 1 && DB.ai_usage[0].business_id === BIZ && DB.ai_usage[0].input_tokens === 100 && DB.ai_usage[0].status === 'OK', DB.ai_usage)
t('no message content is stored', !JSON.stringify(DB.ai_usage).includes('hello'))

r = await call(req, { secret: 'wrong' }); t('bad signature rejected', r.status === 401, r)
r = await call(req, { device: 'unknown' }); t('unknown device rejected', r.status === 401, r)
r = await call(req, { ts: String(Date.now() - 3600_000) }); t('stale timestamp rejected', r.status === 401, r)
r = await call({ messages: [] }); t('empty messages rejected', r.status === 400, r)

// budget: default 1000, used 120 so far -> push usage over the line
DB.ai_usage.push({ business_id: BIZ, status: 'OK', input_tokens: 900, output_tokens: 0, created_at: new Date().toISOString() })
const before = upstreamCalls.length
r = await call(req); t('over monthly budget -> 429 and upstream NOT called', r.status === 429 && r.json.code === 'AI_BUDGET_EXCEEDED' && upstreamCalls.length === before, r)
t('blocked attempt is logged', DB.ai_usage.some((u) => u.status === 'BLOCKED_BUDGET'))
DB.ai_business_limits.push({ business_id: BIZ, enabled: true, monthly_token_budget: 5_000_000 })
r = await call(req); t('per-business budget overrides default', r.status === 200, r)

DB.ai_global_config.find((c) => c.key === 'max_requests_per_minute').value = 2
r = await call(req); t('rate limit -> 429', r.status === 429 && r.json.code === 'AI_RATE_LIMIT', r)
DB.ai_global_config.find((c) => c.key === 'max_requests_per_minute').value = 1000

DB.ai_business_limits[0].enabled = false
r = await call(req); t('disabled business -> 403', r.status === 403 && r.json.code === 'AI_DISABLED', r)
DB.ai_business_limits[0].enabled = true
DB.ai_global_config.find((c) => c.key === 'kill_switch').value = true
r = await call(req); t('kill switch -> 503', r.status === 503, r)
DB.ai_global_config.find((c) => c.key === 'kill_switch').value = false

DB.sync_devices[0].revoked_at = new Date().toISOString()
r = await call(req); t('revoked device rejected', r.status === 401, r)
console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED')
