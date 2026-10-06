-- =============================================================================
-- debbit OS · Migration 086 · Super Admin Portal revenue aggregates
-- Run AFTER 085_employees_hide_totp_secret.sql
--
-- The portal used to pull every sales row and add the totals up in JavaScript. PostgREST caps a response at 1,000 rows, so past
-- 1,000 sales the dashboard and each business page silently showed a total that was too low — and it added different currencies
-- together as if they were one. These two functions do the sum in the database, per currency, and are callable only with the
-- service-role key (the portal's admin-* Edge Functions, which first verify the caller is an active super admin).
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_sales_by_day(p_from date, p_to date)
RETURNS TABLE (sale_date date, currency text, total numeric, sale_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.sale_date, b.currency::text, COALESCE(SUM(s.total), 0), COUNT(*)
  FROM sales s
  JOIN businesses b ON b.id = s.business_id
  WHERE s.is_void = false AND s.sale_date BETWEEN p_from AND p_to
  GROUP BY s.sale_date, b.currency
  ORDER BY s.sale_date
$$;

CREATE OR REPLACE FUNCTION admin_business_sales(p_business_id uuid)
RETURNS TABLE (total numeric, sale_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(s.total), 0), COUNT(*)
  FROM sales s
  WHERE s.business_id = p_business_id AND s.is_void = false
$$;

REVOKE ALL ON FUNCTION admin_sales_by_day(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_business_sales(uuid)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_sales_by_day(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION admin_business_sales(uuid)      TO service_role;
