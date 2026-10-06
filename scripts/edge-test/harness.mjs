import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const FN = process.env.FN_DIR ?? new URL('../../supabase/functions', import.meta.url).pathname
const secret = 'super-secret-jwt-token-with-at-least-32-characters-long'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (role) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ role, iss: 'x', exp: 4102444800 }); return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}` }
process.env.SUPABASE_URL = 'http://pgrst.local'
process.env.SUPABASE_ANON_KEY = jwt('anon')
process.env.SERVICE_ROLE_KEY = jwt('service_role'); process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY

export const authState = { id: 'u1', email: 'admin@x.com', created: [] }
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString())
  if (url.host === 'pgrst.local') {
    if (url.pathname === '/auth/v1/user') {
      const tok = (new Headers(init?.headers).get('authorization') || '').replace(/^Bearer /, '')
      if (tok !== 'GOODTOKEN') return new Response(JSON.stringify({ msg: 'bad' }), { status: 401 })
      return new Response(JSON.stringify({ id: authState.id ?? 'u1', email: authState.email, aud: 'authenticated' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.pathname === '/auth/v1/admin/users') {
      const body = JSON.parse(init.body)
      authState.created.push(body)
      if (body.email === 'existing@x.com') return new Response(JSON.stringify({ msg: 'A user with this email address has already been registered', code: 'email_exists' }), { status: 422, headers: { 'content-type': 'application/json' } })
      return new Response(JSON.stringify({ id: 'new', email: body.email }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const path = url.pathname.replace(/^\/rest\/v1/, '')
    return realFetch(`http://localhost:3555${path}${url.search}`, init)
  }
  return realFetch(input, init)
}

const handlers = {}
globalThis.Deno = { env: { get: (k) => process.env[k] }, serve: (h) => { globalThis.__last = h } }
export async function load(name) {
  if (!handlers[name]) { globalThis.__last = null; await import(pathToFileURL(`${FN}/${name}/index.ts`).href); handlers[name] = globalThis.__last }
  return handlers[name]
}
export async function call(name, body, token = 'GOODTOKEN') {
  const h = await load(name)
  const res = await h(new Request('http://fn.local/', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }))
  return { status: res.status, body: await res.json() }
}
