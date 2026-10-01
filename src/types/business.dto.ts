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
}

export interface BusinessDetailStats {
  activeMembers: number
  activeWorkstations: number
  totalRevenue: number
  saleCount: number
}
