// debbit has no local "plan tier" / "amount" / "billing cycle" table — pricing
// and invoicing live in Stripe. This mirrors exactly what businesses carries
// (set by bootstrap_owner_registration, kept current by the Stripe webhook
// handler — see supabase/migrations/045_billing_subscription.sql).
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

export interface BillingBusinessRow {
  id: string
  name: string
  country: string
  currency: string
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}
