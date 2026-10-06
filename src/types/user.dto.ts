export interface UserRow {
  id: string | number
  email: string
  full_name: string
  role: string
  business_name?: string
  last_sign_in: string
  status: 'Active' | 'Inactive' | 'Pending'
}

/** A login the desktop app signs in with (public.staff_accounts). The sync functions check `is_active` on every call. */
export interface StaffLoginRow {
  id: string
  business_id: string
  business_name: string | null
  auth_user_id: string
  employee_id: string | null
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

/** A web-dashboard membership row (public.business_members) with its joined user and business. */
export interface BusinessMemberRow {
  id: string
  business_id: string
  user_id: string
  role: string
  is_active: boolean
  joined_at: string
  users: { full_name?: string; email?: string } | null
  businesses: { name?: string } | null
}
