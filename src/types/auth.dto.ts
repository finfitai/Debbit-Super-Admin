import { Session } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null | undefined
  isSuperAdmin: boolean
  checking: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export interface SuperAdminRow {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  created_at: string
}
