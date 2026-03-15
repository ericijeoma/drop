-- ============================================================
-- Drop — Complete Seed Data
-- File path: supabase/seed.sql
-- Run AFTER 001_schema.sql
--
-- Creates:
--   1 admin user
--   2 customer users
--   2 driver users
--   2 driver profiles (vehicles, location)
--   2 sample rides (1 completed, 1 pending)
--   1 sample order (delivered)
--   1 sample payment (captured)
--
-- All users use phone OTP provider.
-- Phone numbers are Nigerian format (+234...).
-- Passwords are irrelevant — Drop uses OTP, not passwords.
-- ============================================================

-- ── Enable required extensions ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STEP 1 — Insert auth.users (Supabase Auth layer)
-- These are the authentication identities.
-- Must exist BEFORE public.users rows.
-- ============================================================
DO $$
DECLARE
  -- Fixed UUIDs so the seed is reproducible and consistent
  v_admin_auth_id    UUID := 'a0000000-0000-0000-0000-000000000001';
  v_customer1_auth_id UUID := 'a0000000-0000-0000-0000-000000000002';
  v_customer2_auth_id UUID := 'a0000000-0000-0000-0000-000000000003';
  v_driver1_auth_id  UUID := 'a0000000-0000-0000-0000-000000000004';
  v_driver2_auth_id  UUID := 'a0000000-0000-0000-0000-000000000005';

BEGIN

  -- ── Insert into auth.users ──────────────────────────────────
  -- aud = 'authenticated', role = 'authenticated' is required
  -- phone_confirmed_at is set because OTP has already been "verified"
  -- encrypted_password is empty string — OTP users have no password

  INSERT INTO auth.users (
    id, instance_id, aud, role,
    phone, phone_confirmed_at,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    is_super_admin
  ) VALUES
    -- Admin
    (v_admin_auth_id,
     '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated',
     '+2348000000001', NOW(),
     '',
     '{"provider":"phone","providers":["phone"]}',
     '{"full_name":"Drop Admin"}',
     NOW(), NOW(), '', '', false),

    -- Customer 1
    (v_customer1_auth_id,
     '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated',
     '+2348000000002', NOW(),
     '',
     '{"provider":"phone","providers":["phone"]}',
     '{"full_name":"Ada Okonkwo"}',
     NOW(), NOW(), '', '', false),

    -- Customer 2
    (v_customer2_auth_id,
     '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated',
     '+2348000000003', NOW(),
     '',
     '{"provider":"phone","providers":["phone"]}',
     '{"full_name":"Emeka Nwosu"}',
     NOW(), NOW(), '', '', false),

    -- Driver 1
    (v_driver1_auth_id,
     '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated',
     '+2348000000004', NOW(),
     '',
     '{"provider":"phone","providers":["phone"]}',
     '{"full_name":"Chidi Obi"}',
     NOW(), NOW(), '', '', false),

    -- Driver 2
    (v_driver2_auth_id,
     '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated',
     '+2348000000005', NOW(),
     '',
     '{"provider":"phone","providers":["phone"]}',
     '{"full_name":"Fatima Aliyu"}',
     NOW(), NOW(), '', '', false)

  ON CONFLICT (id) DO NOTHING;

  -- ── Insert into auth.identities ─────────────────────────────
  -- Required in Supabase 2025+: every auth.user needs an identity row.
  -- provider_id must be set — use the auth user id as provider_id.
  -- For phone provider, identity_data contains sub + phone.

  INSERT INTO auth.identities (
    id, user_id, provider_id,
    identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), v_admin_auth_id,    v_admin_auth_id::text,
     format('{"sub":"%s","phone":"+2348000000001"}', v_admin_auth_id)::jsonb,
     'phone', NOW(), NOW(), NOW()),

    (gen_random_uuid(), v_customer1_auth_id, v_customer1_auth_id::text,
     format('{"sub":"%s","phone":"+2348000000002"}', v_customer1_auth_id)::jsonb,
     'phone', NOW(), NOW(), NOW()),

    (gen_random_uuid(), v_customer2_auth_id, v_customer2_auth_id::text,
     format('{"sub":"%s","phone":"+2348000000003"}', v_customer2_auth_id)::jsonb,
     'phone', NOW(), NOW(), NOW()),

    (gen_random_uuid(), v_driver1_auth_id,  v_driver1_auth_id::text,
     format('{"sub":"%s","phone":"+2348000000004"}', v_driver1_auth_id)::jsonb,
     'phone', NOW(), NOW(), NOW()),

    (gen_random_uuid(), v_driver2_auth_id,  v_driver2_auth_id::text,
     format('{"sub":"%s","phone":"+2348000000005"}', v_driver2_auth_id)::jsonb,
     'phone', NOW(), NOW(), NOW())

  ON CONFLICT DO NOTHING;

END $$;


-- ============================================================
-- STEP 2 — Insert public.users
-- Application-level user profiles.
-- auth_id references auth.users(id) — must match exactly.
-- ============================================================
INSERT INTO public.users (id, auth_id, phone, full_name, role, is_banned) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '+2348000000001', 'Drop Admin',     'admin',    false),

  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   '+2348000000002', 'Ada Okonkwo',    'customer', false),

  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003',
   '+2348000000003', 'Emeka Nwosu',    'customer', false),

  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   '+2348000000004', 'Chidi Obi',      'driver',   false),

  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   '+2348000000005', 'Fatima Aliyu',   'driver',   false)

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 3 — Insert drivers
-- Vehicle details and starting location (Lagos coordinates).
-- Both drivers are online with known GPS positions.
-- ============================================================
INSERT INTO public.drivers (
  id, user_id, vehicle_type, vehicle_plate, vehicle_model,
  status, current_location, rating, total_trips, is_verified
) VALUES
  -- Driver 1: Chidi — Toyota Camry, near Lagos Island
  ('c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000004',
   'car', 'LAG-001-AA', 'Toyota Camry 2020',
   'online',
   ST_SetSRID(ST_MakePoint(3.3869, 6.4550), 4326)::geography,
   4.85, 142, true),

  -- Driver 2: Fatima — Honda CBR motorbike, near Victoria Island
  ('c0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000005',
   'motorbike', 'LAG-002-BB', 'Honda CBR 150',
   'online',
   ST_SetSRID(ST_MakePoint(3.4219, 6.4281), 4326)::geography,
   4.70, 89, true)

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 4 — Insert sample rides
-- Two rides: one completed (for history testing),
-- one pending (for driver matching testing).
-- ============================================================
INSERT INTO public.rides (
  id, customer_id, driver_id, vehicle_type,
  pickup_address, dropoff_address,
  pickup_location, dropoff_location,
  distance_km, fare_amount,
  status, payment_status,
  requested_at, accepted_at, completed_at
) VALUES
  -- Completed ride: Ada → Victoria Island (paid)
  ('d0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',  -- Ada (customer)
   'c0000000-0000-0000-0000-000000000001',  -- Chidi (driver)
   'car',
   '1 Broad Street, Lagos Island',
   '15 Adeola Odeku, Victoria Island',
   ST_SetSRID(ST_MakePoint(3.3869, 6.4550), 4326)::geography,
   ST_SetSRID(ST_MakePoint(3.4219, 6.4281), 4326)::geography,
   5.3, 886,
   'completed', 'captured',
   NOW() - INTERVAL '2 days',
   NOW() - INTERVAL '2 days' + INTERVAL '4 minutes',
   NOW() - INTERVAL '2 days' + INTERVAL '22 minutes'),

  -- Pending ride: Emeka waiting for a driver
  ('d0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000003',  -- Emeka (customer)
   NULL,                                    -- no driver yet
   'car',
   '5 Awolowo Road, Ikoyi',
   '32 Bode Thomas, Surulere',
   ST_SetSRID(ST_MakePoint(3.4281, 6.4480), 4326)::geography,
   ST_SetSRID(ST_MakePoint(3.3600, 6.4990), 4326)::geography,
   7.1, 1102,
   'pending', 'pending',
   NOW() - INTERVAL '1 minute',
   NULL, NULL)

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 5 — Insert sample order (delivery)
-- One delivered order for history testing.
-- ============================================================
INSERT INTO public.orders (
  id, customer_id, driver_id, status,
  pickup_address, dropoff_address,
  pickup_location, dropoff_location,
  package_description, package_size,
  delivery_photo_url,
  distance_km, fare_amount, payment_status,
  requested_at, assigned_at, delivered_at
) VALUES
  ('e0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',   -- Ada (customer)
   'c0000000-0000-0000-0000-000000000002',   -- Fatima (driver)
   'delivered',
   '10 Marina, Lagos Island',
   '4 Karimu Kotun, Victoria Island',
   ST_SetSRID(ST_MakePoint(3.3920, 6.4523), 4326)::geography,
   ST_SetSRID(ST_MakePoint(3.4174, 6.4295), 4326)::geography,
   'Important legal documents — handle with care',
   'small',
   'https://placehold.co/400x300?text=Proof+of+Delivery',
   3.8, 554, 'captured',
   NOW() - INTERVAL '5 days',
   NOW() - INTERVAL '5 days' + INTERVAL '6 minutes',
   NOW() - INTERVAL '5 days' + INTERVAL '28 minutes')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 6 — Insert sample payment
-- Payment for the completed ride above.
-- ============================================================
INSERT INTO public.payments (
  id, ride_id, order_id, customer_id,
  amount, currency, status,
  stripe_payment_intent_id,
  idempotency_key, created_at
) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001',  -- completed ride
   NULL,
   'b0000000-0000-0000-0000-000000000002',  -- Ada
   886, 'NGN', 'captured',
   'pi_test_seed_ride_001',
   'b0000000-0000-0000-0000-000000000002:d0000000-0000-0000-0000-000000000001:seed',
   NOW() - INTERVAL '2 days' + INTERVAL '22 minutes')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 7 — Insert a sample rating
-- Ada rated Chidi 5 stars for the completed ride.
-- ============================================================
INSERT INTO public.ratings (
  ride_id, customer_id, driver_id, score, comment
) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001',
   5, 'Very professional and on time. Highly recommended!')

ON CONFLICT DO NOTHING;


-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
DECLARE
  v_users    bigint;
  v_drivers  bigint;
  v_rides    bigint;
  v_orders   bigint;
  v_payments bigint;
BEGIN
  SELECT COUNT(*) INTO v_users    FROM public.users;
  SELECT COUNT(*) INTO v_drivers  FROM public.drivers;
  SELECT COUNT(*) INTO v_rides    FROM public.rides;
  SELECT COUNT(*) INTO v_orders   FROM public.orders;
  SELECT COUNT(*) INTO v_payments FROM public.payments;

  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '✓ Drop seed complete';
  RAISE NOTICE '  users:    % (expected 5)', v_users;
  RAISE NOTICE '  drivers:  % (expected 2)', v_drivers;
  RAISE NOTICE '  rides:    % (expected 2)', v_rides;
  RAISE NOTICE '  orders:   % (expected 1)', v_orders;
  RAISE NOTICE '  payments: % (expected 1)', v_payments;
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE 'Test phone numbers:';
  RAISE NOTICE '  Admin:      +2348000000001';
  RAISE NOTICE '  Customer 1: +2348000000002  (Ada Okonkwo)';
  RAISE NOTICE '  Customer 2: +2348000000003  (Emeka Nwosu)';
  RAISE NOTICE '  Driver 1:   +2348000000004  (Chidi Obi — car)';
  RAISE NOTICE '  Driver 2:   +2348000000005  (Fatima Aliyu — motorbike)';
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE 'To promote yourself to admin after registering:';
  RAISE NOTICE 'UPDATE users SET role = ''admin'' WHERE phone = ''+YOUR_REAL_NUMBER'';';
  RAISE NOTICE '══════════════════════════════════════';
END $$;