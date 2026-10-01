-- =============================================================================
-- debbit OS · Migration 052 · Admin portal performance indexes
-- Run AFTER 051_super_admin.sql
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales (sale_date);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_telemetry') THEN
    CREATE INDEX IF NOT EXISTS idx_app_telemetry_occurred_at ON public.app_telemetry (occurred_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workstation_devices') THEN
    CREATE INDEX IF NOT EXISTS idx_workstation_devices_updated_at ON public.workstation_devices (updated_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workstation_audit_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_workstation_audit_logs_created_at ON public.workstation_audit_logs (created_at DESC);
  END IF;
END $$;
