export interface BusinessRow {
  id: string | number
  name: string
  legal_name?: string
  country: string
  currency: string
  business_type: string
  created_at: string
  is_active: boolean
}

export interface BusinessDetailDTO extends BusinessRow {
  owner?: { email?: string; full_name?: string } | null
  phone?: string | null
  email?: string | null
  address_line1?: string | null
  city?: string | null
  subscription_status?: string
  trial_ends_at?: string | null
  current_period_end?: string | null
  device_limit?: number | null
}

export interface BusinessDetailStats {
  activeMembers: number
  activeWorkstations: number
  totalRevenue: number
  saleCount: number
}

export interface WorkstationDeviceRow {
  id: string
  code: string
  name: string
  branch_name: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SyncDeviceRow {
  id: string
  device_id: string
  label: string | null
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

export interface ShiftRow {
  id: string
  cashier_id: string | null
  shift_start: string
  shift_end: string | null
  declared_amount_sen: number | null
  expected_amount_sen: number | null
  variance_sen: number | null
  flagged: boolean
  created_at: string
  cashier: { full_name?: string } | null
}
