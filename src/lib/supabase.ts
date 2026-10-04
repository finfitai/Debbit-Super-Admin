import { createClient, SupabaseClient } from '@supabase/supabase-js'

// The debbit Supabase project (the single canonical one — see docs/SUPABASE.md in the main repo).
// The anon key is PUBLIC by design (it ships in every page's JavaScript; row-level security is what
// protects the data), so a built-in copy is safe. It is only used when the configured value is
// missing or malformed — e.g. someone pasted the masked "eyJhbGci•••••" text from a dashboard into
// the host's environment variables, which silently breaks every request.
const BUILTIN_URL = 'https://pzhwkjrznchbjdsdofsp.supabase.co'
const BUILTIN_ANON_KEY = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6aHdranJ6bmNoYmpkc2RvZnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MjYyOTgsImV4cCI6MjEwMTAwMjI5OH0',
  'CeOeJO3TCqhVO0SqxdbuZxjOQRDT7zFQGhIXhmWgIl8',
].join('.')

const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/

const configuredUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  ''
) as string

const configuredKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  ''
) as string

export const envUrl = URL_RE.test(configuredUrl.trim()) ? configuredUrl.trim() : BUILTIN_URL
export const envAnonKey = JWT_RE.test(configuredKey.trim()) ? configuredKey.trim() : BUILTIN_ANON_KEY

// Kept for callers that show a "configuration missing" screen; with the built-in values this
// is now only true if someone deliberately blanks them in code.
export const isMissingConfig = !envUrl || !envAnonKey

export const supabase: SupabaseClient = createClient(envUrl, envAnonKey)
