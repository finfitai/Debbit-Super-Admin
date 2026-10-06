import { CORS_HEADERS, json, requireSuperAdmin, AuthzError } from '../_shared/authz.ts'

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

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const legal_name = typeof body.legal_name === 'string' ? body.legal_name.trim() : null
  const registration_no = typeof body.registration_no === 'string' ? body.registration_no.trim() : null
  const tax_id = typeof body.tax_id === 'string' ? body.tax_id.trim() : null
  const country = typeof body.country === 'string' && body.country ? body.country : 'MY'
  const currency = typeof body.currency === 'string' && body.currency ? body.currency : 'MYR'
  const active_tax_regime = typeof body.active_tax_regime === 'string' && body.active_tax_regime ? body.active_tax_regime : 'MY_SST_6'
  const business_type = typeof body.business_type === 'string' && body.business_type ? body.business_type : 'RETAIL'
  const address_line1 = typeof body.address_line1 === 'string' ? body.address_line1.trim() : null
  const address_line2 = typeof body.address_line2 === 'string' ? body.address_line2.trim() : null
  const city = typeof body.city === 'string' ? body.city.trim() : null
  const postal_code = typeof body.postal_code === 'string' ? body.postal_code.trim() : null
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null
  const email = typeof body.email === 'string' ? body.email.trim() : null
  const website = typeof body.website === 'string' ? body.website.trim() : null
  const owner_id = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : null
  const owner_email = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : ''

  if (!name) {
    return json({ ok: false, error: 'Business name is required' }, 400)
  }

  // A business must belong to a named, existing owner. (This used to fall back to "the first user in the table", which handed a
  // brand-new business to whichever unrelated customer happened to be first — and so gave that customer access to it.)
  if (!owner_id && !owner_email) {
    return json({ ok: false, error: 'owner_email (or owner_id) is required — the owner must already have a debbit account' }, 400)
  }
  const ownerQuery = owner_id
    ? supabase.from('users').select('id').eq('id', owner_id)
    : supabase.from('users').select('id').ilike('email', owner_email.replace(/[\\%_]/g, '\\$&'))
  const { data: ownerRows, error: ownerErr } = await ownerQuery.limit(2)
  if (ownerErr) return json({ ok: false, error: ownerErr.message }, 500)
  if (!ownerRows || ownerRows.length === 0) {
    return json({ ok: false, error: 'No debbit account found for that owner' }, 404)
  }
  if (ownerRows.length > 1) {
    return json({ ok: false, error: 'More than one account matches that email — use owner_id instead' }, 409)
  }
  const ownerId = ownerRows[0].id as string

  // A new business gets the same one-month trial the website sign-up gives (migration 050). Without a trial_ends_at the desktop
  // treats "trialing" as never expiring.
  const trial_ends_at = new Date(Date.now() + 30 * 86400000).toISOString()

  const payload = {
    owner_id: ownerId,
    name,
    legal_name,
    registration_no,
    tax_id,
    country,
    currency,
    active_tax_regime,
    business_type,
    address_line1,
    address_line2,
    city,
    postal_code,
    phone,
    email,
    website,
    subscription_status: 'trialing',
    trial_ends_at,
  }

  const { data, error } = await supabase
    .from('businesses')
    .insert([payload])
    .select('*')
    .maybeSingle()

  if (error || !data) {
    return json({ ok: false, error: error?.message ?? 'Business was not created' }, 500)
  }

  // The owner's membership: the web dashboard reads access from business_members, so without this row the owner can't open it.
  const { error: memberErr } = await supabase
    .from('business_members')
    .insert([{ business_id: data.id, user_id: ownerId, role: 'OWNER', is_active: true }])
  if (memberErr) {
    // Don't leave an ownerless business behind (nothing has been posted to it yet, so removing it is safe).
    await supabase.from('businesses').delete().eq('id', data.id)
    return json({ ok: false, error: `Could not add the owner to the business: ${memberErr.message}` }, 500)
  }

  return json({ ok: true, business: data })
})
