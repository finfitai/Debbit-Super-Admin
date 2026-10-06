-- Test data for edge-functions.test.mjs (two businesses in different currencies, 1,500 sales to prove the 1,000-row cap is not hit).
ALTER TABLE sales DISABLE TRIGGER USER;
INSERT INTO super_admins (email, full_name) VALUES ('admin@x.com', 'Admin');
INSERT INTO users (id, email, full_name) VALUES ('11111111-1111-1111-1111-111111111111', 'o@x.com', 'Owner');
INSERT INTO businesses (id, owner_id, name, country, currency, active_tax_regime) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Biz MY', 'MY', 'MYR', 'MY_SST_6'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Biz SA', 'SA', 'SAR', 'MY_SST_6');
INSERT INTO sales (business_id, invoice_no, sale_date, subtotal, tax_amount, total, is_void)
  SELECT 'aaaaaaaa-0000-0000-0000-000000000001', 'INV-' || g, current_date, 1, 0, 1, false FROM generate_series(1, 1500) g;
INSERT INTO sales (business_id, invoice_no, sale_date, subtotal, tax_amount, total, is_void) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'S-1', current_date, 50, 0, 50, false),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'S-2', current_date, 99, 0, 99, true);
INSERT INTO auth.users (id, email) VALUES ('22222222-2222-2222-2222-222222222222', 'cashier@x.com');
INSERT INTO staff_accounts (auth_user_id, business_id, email, full_name, role, is_active)
  VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'cashier@x.com', 'Cass Hier', 'POS', true);
INSERT INTO business_members (business_id, user_id, role) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'OWNER');
INSERT INTO workstation_devices (id, business_id, code, name, branch_name) VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'POS1', 'Till 1', 'HQ');
INSERT INTO employees (id, business_id, name, full_name) VALUES ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cass Hier', 'Cass Hier');
INSERT INTO shift_reconciliations (business_id, cashier_id, shift_start, shift_end, declared_amount_sen, expected_amount_sen, variance_sen, flagged)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', now() - interval '8 hours', now(), 10000, 10500, -500, true);
INSERT INTO sync_devices (business_id, device_id, device_secret, label) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dev-1', 'sekret', 'Front till'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dev-2', 'sekret2', 'Back office');
INSERT INTO support_tickets (id, business_id, source, subject, status, severity)
  SELECT gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'MANUAL', s, st, 'low'
  FROM (VALUES ('a','OPEN'),('b','IN_PROGRESS'),('c','RESOLVED'),('d','CLOSED'),('e','open'),('f','WAITING'),('g','resolved')) v(s, st);
INSERT INTO app_telemetry (business_id, device_id, event_type, severity, message) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'dev-1', 'error', 'error', 'boom');
