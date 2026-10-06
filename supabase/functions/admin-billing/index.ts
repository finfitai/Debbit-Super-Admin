import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'
import { fetchAll } from '../_shared/paginate.ts'

// Returns each business's real subscription state. debbit has no local
// "plan tier" / "amount" / "billing cycle" data — pricing lives in Stripe —
// so this surfaces exactly what the businesses table actually tracks
// (subscription_status, trial_ends_at, current_period_end, stripe ids),
// set on signup by bootstrap_owner_registration and kept current by the
// Stripe webhook handler. See supabase/migrations/045_billing_subscription.sql.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  let supabase
  try {
    ;({ supabase } = await requireSuperAdmin(req))
  } catch (e) {
    const err = e as AuthzError
    return json({ ok: false, error: err.message }, err.status ?? 500)
  }

  const { data, error } = await fetchAll((from, to) => supabase
    .from('businesses')
    .select('id, name, country, currency, subscription_status, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id, created_at')
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to))

  if (error) return json({ ok: false, error: error.message }, 500)

  return json({ ok: true, businesses: data ?? [] })
})
