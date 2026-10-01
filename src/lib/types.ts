// ─── Supabase row types ────────────────────────────────────────────────────

export type CountryCode = 'AE' | 'SA' | 'MY' | 'ID' | 'IN'
export type CurrencyCode = 'AED' | 'SAR' | 'MYR' | 'IDR' | 'INR'
export type BusinessType = 'RETAIL' | 'FOOD_BEVERAGE' | 'WHOLESALE' | 'SERVICE' | 'MANUFACTURING'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'CASHIER' | 'WAREHOUSE' | 'VIEWER'
export type TelemetrySeverity = 'ERROR' | 'WARN' | 'INFO'
export type TelemetryEventType = 'ERROR' | 'SYNC_FAIL' | 'MYINVOIS_FAIL' | 'CRASH' | 'HEALTH'

export interface SuperAdmin {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  created_at: string
}

export interface Business {
  id: string
  owner_id: string
  name: string
  legal_name: string | null
  registration_no: string | null
  tax_id: string | null
  country: CountryCode
  currency: CurrencyCode
  business_type: BusinessType
  is_active: boolean
  city: string | null
  phone: string | null
  email: string | null
  created_at: string
  updated_at: string
  // joined fields
  owner?: Pick<User, 'email' | 'full_name'>
  member_count?: number
}

export interface User {
  id: string
  auth_uid: string | null
  email: string
  full_name: string
  phone: string | null
  auth_provider: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BusinessMember {
  id: string
  business_id: string
  user_id: string
  role: MemberRole
  is_active: boolean
  joined_at: string
  users?: Pick<User, 'email' | 'full_name'>
  businesses?: Pick<Business, 'name'>
}

export interface AppTelemetry {
  id: string
  business_id: string | null
  device_id: string | null
  app_version: string | null
  platform: string | null
  event_type: TelemetryEventType | null
  scope: string | null
  severity: TelemetrySeverity | null
  message: string | null
  occurred_at: string | null
  received_at: string
}

export interface DeviceKey {
  id: string
  business_id: string
  device_id: string
  label: string | null
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  businesses?: Pick<Business, 'name'>
}

export interface Workstation {
  id: string
  business_id: string
  device_id: string
  hostname: string | null
  platform: string | null
  last_sync_at: string | null
  app_version: string | null
  is_active: boolean
  created_at: string
  businesses?: Pick<Business, 'name'>
}

// ─── Dashboard KPI types ───────────────────────────────────────────────────

export interface DashboardStats {
  totalBusinesses: number
  activeBusinesses: number
  totalUsers: number
  errorCount24h: number
  deviceCount: number
  newBusinesses7d: number
}

// ─── Pagination ────────────────────────────────────────────────────────────

export interface ColumnDef<T = any> {
  key: string
  header: string
  width?: string
  render?: (row: T) => React.ReactNode
}

export interface PaginatedResult<T> {
  data: T[]
  count: number
}
