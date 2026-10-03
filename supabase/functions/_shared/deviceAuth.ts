// =============================================================================
// debbit OS · supabase/functions/_shared/deviceAuth.ts
// Shared auth for the sync edge functions.
//
// Trust model (in priority order):
//   1. Per-device credential — header `x-debbit-device` + HMAC signed with that
//      device's secret (sync_devices). Resolves business_id FROM the device, so
//      the caller cannot act for another tenant. Revoked devices are rejected.
//   2. Legacy shared SYNC_SECRET — no per-tenant scoping. Kept for one
//      transition release so existing installs keep syncing; business_id is null
//      and the caller must still supply it (no scoping enforced).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-debbit-sig, x-debbit-ts, x-debbit-device',
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
}

async function hmacHex(secret: string, ts: string, rawBody: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawBody}`))
  return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface SyncAuth {
  ok: boolean
  status?: number
  error?: string
  mode?: 'device' | 'shared'
  businessId?: string | null
  deviceId?: string | null
  role?: string | null
  rawBody?: string
  // deno-lint-ignore no-explicit-any
  supabase?: any
}

/** Authenticate a sync request. Reads the raw body (so callers must not read it again). */
export async function authenticateSyncRequest(req: Request): Promise<SyncAuth> {
  const sig = req.headers.get('x-debbit-sig') ?? ''
  const ts = req.headers.get('x-debbit-ts') ?? ''
  const deviceId = req.headers.get('x-debbit-device') ?? ''
  if (!sig || !ts) return { ok: false, status: 401, error: 'Missing x-debbit-sig or x-debbit-ts' }

  const reqTime = parseInt(ts, 10)
  if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > REPLAY_WINDOW_MS) {
    return { ok: false, status: 401, error: 'Request timestamp expired or invalid' }
  }

  const rawBody = await req.text()
  const supabase = serviceClient()

  // 1 · Preferred: per-device credential.
  if (deviceId) {
    const { data: dev } = await supabase
      .from('sync_devices')
      .select('business_id, device_secret, revoked_at, role')
      .eq('device_id', deviceId)
      .maybeSingle()
    if (!dev) return { ok: false, status: 401, error: 'Unknown device' }
    if (dev.revoked_at) return { ok: false, status: 401, error: 'Device revoked' }
    const expected = await hmacHex(dev.device_secret, ts, rawBody)
    if (!constantTimeEq(expected, sig)) return { ok: false, status: 401, error: 'Invalid signature' }
    // best-effort heartbeat (don't block on it)
    supabase.from('sync_devices').update({ last_seen_at: new Date().toISOString() }).eq('device_id', deviceId).then(() => {}, () => {})
    return { ok: true, mode: 'device', businessId: dev.business_id, deviceId, role: dev.role ?? 'DESKTOP', rawBody, supabase }
  }

  // 2 · Transition fallback: shared SYNC_SECRET (no per-tenant scoping).
  const shared = Deno.env.get('SYNC_SECRET')
  if (!shared) return { ok: false, status: 500, error: 'No device credential supplied and SYNC_SECRET not configured' }
  const expected = await hmacHex(shared, ts, rawBody)
  if (!constantTimeEq(expected, sig)) return { ok: false, status: 401, error: 'Invalid signature' }
  return { ok: true, mode: 'shared', businessId: null, deviceId: null, role: 'DESKTOP', rawBody, supabase }
}
