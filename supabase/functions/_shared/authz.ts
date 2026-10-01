// =============================================================================
// debbit OS Super Admin Portal · shared Edge Function auth gate
//
// Every admin-* function reads/writes across ALL businesses using the
// service-role key, bypassing RLS entirely. Supabase's platform-level JWT
// check only proves the caller is SOME authenticated Supabase user — not a
// super admin — and Supabase allows public self-signup by default, so
// without this check anyone who signs themselves up gets full cross-tenant
// access. This verifies the caller's JWT, then checks them against the
// super_admins allowlist before the caller touches anything.
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

export class AuthzError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Verifies the request's bearer token belongs to an active super_admins row.
 * Returns {supabase, email} on success — `supabase` is a service-role client
 * the caller can use for the actual cross-tenant query. Throws AuthzError
 * (401/403) on any failure; callers should catch it and return json(...).
 */
export async function requireSuperAdmin(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new AuthzError('Missing Supabase environment variables', 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new AuthzError('Missing bearer token', 401)

  // Verify the token against Supabase Auth itself (anon key + the caller's
  // own token — never trust a client-supplied email/id unverified).
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await callerClient.auth.getUser(token)
  const email = userData?.user?.email
  if (userErr || !email) throw new AuthzError('Invalid or expired session', 401)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: admin, error: adminErr } = await supabase
    .from('super_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle()

  if (adminErr) throw new AuthzError('Failed to verify admin status', 500)
  if (!admin || !admin.is_active) throw new AuthzError('Not authorized as a super admin', 403)

  return { supabase, email }
}
