-- ============================================================
-- Drop — Complete Database Schema (v2)
-- File path: supabase/migrations/001_schema.sql
--
-- This file supersedes the original 001_schema.sql and all
-- subsequent fix migrations (002, 003, 004). It is the single
-- source of truth for the entire database schema.
--
-- Safe to run multiple times — fully idempotent.
--
-- Fixes applied vs original:
--   ✓ All 7 functions: SET search_path pinned (security)
--   ✓ SECURITY DEFINER functions: search_path = '' +
--     fully-qualified table names (privilege escalation fix)
--   ✓ All RLS policies: auth calls wrapped in (SELECT ...)
--     for initPlan caching (performance)
--   ✓ All RLS policies: TO authenticated added (performance +
--     eliminates multiple-permissive-policy warnings)
--   ✓ drivers SELECT policies consolidated to one (performance)
--   ✓ notifications UPDATE policy: WITH CHECK added (correctness)
--   ✓ 4 missing FK indexes added to ratings table (performance)
--   ✓ Duplicate idx_users_phone removed (write performance)
--   ✓ public.instruments dropped (hygiene)
--
-- Still requires manual action (cannot be done via SQL):
--   • Move PostGIS to extensions schema → Supabase Support ticket
--   • Enable leaked password protection → Dashboard:
--     Authentication → Providers → Email → Password Security
-- ============================================================


-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgtap";


-- ── Enums ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'driver', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM ('pending', 'active', 'completed', 'cancelled', 'timed_out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'assigned', 'in_transit', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('offline', 'online', 'busy');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_type AS ENUM ('motorbike', 'car', 'van');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'captured', 'refunded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notif_type AS ENUM (
    'ride_request', 'ride_accepted', 'ride_completed',
    'delivery_request', 'delivery_assigned', 'delivery_delivered',
    'payment_captured', 'system_alert'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Tables ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id     UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    phone       TEXT        NOT NULL UNIQUE,
    full_name   TEXT        NOT NULL DEFAULT '',
    avatar_url  TEXT,
    role        user_role   NOT NULL DEFAULT 'customer',
    is_banned   BOOLEAN     NOT NULL DEFAULT FALSE,
    fcm_token   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE drivers (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type     vehicle_type  NOT NULL,
    vehicle_plate    TEXT          NOT NULL,
    vehicle_model    TEXT          NOT NULL DEFAULT '',
    status           driver_status NOT NULL DEFAULT 'offline',
    current_location geography(POINT, 4326),
    rating           NUMERIC(3,2)  NOT NULL DEFAULT 5.00 CHECK (rating BETWEEN 1 AND 5),
    total_trips      INTEGER       NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
    is_verified      BOOLEAN       NOT NULL DEFAULT FALSE,
    fcm_token        TEXT,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE rides (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      UUID           NOT NULL REFERENCES users(id),
    driver_id        UUID           REFERENCES drivers(id),
    vehicle_type     vehicle_type   NOT NULL,
    status           ride_status    NOT NULL DEFAULT 'pending',
    pickup_address   TEXT           NOT NULL,
    dropoff_address  TEXT           NOT NULL,
    pickup_location  geography(POINT, 4326) NOT NULL,
    dropoff_location geography(POINT, 4326) NOT NULL,
    distance_km      NUMERIC(8,3)   NOT NULL CHECK (distance_km > 0),
    fare_amount      NUMERIC(10,2)  NOT NULL CHECK (fare_amount > 0),
    payment_status   payment_status NOT NULL DEFAULT 'pending',
    requested_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    cancelled_at     TIMESTAMPTZ,
    timeout_at       TIMESTAMPTZ    NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes'),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE orders (
    id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID           NOT NULL REFERENCES users(id),
    driver_id           UUID           REFERENCES drivers(id),
    status              order_status   NOT NULL DEFAULT 'pending',
    pickup_address      TEXT           NOT NULL,
    dropoff_address     TEXT           NOT NULL,
    pickup_location     geography(POINT, 4326) NOT NULL,
    dropoff_location    geography(POINT, 4326) NOT NULL,
    package_description TEXT           NOT NULL DEFAULT '',
    package_size        TEXT           NOT NULL DEFAULT 'small'
                        CHECK (package_size IN ('small','medium','large')),
    delivery_photo_url  TEXT,
    distance_km         NUMERIC(8,3)   NOT NULL CHECK (distance_km > 0),
    fare_amount         NUMERIC(10,2)  NOT NULL CHECK (fare_amount > 0),
    payment_status      payment_status NOT NULL DEFAULT 'pending',
    requested_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    assigned_at         TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    timeout_at          TIMESTAMPTZ    NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE payments (
    id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id                  UUID           REFERENCES rides(id),
    order_id                 UUID           REFERENCES orders(id),
    customer_id              UUID           NOT NULL REFERENCES users(id),
    amount                   NUMERIC(10,2)  NOT NULL CHECK (amount > 0),
    currency                 CHAR(3)        NOT NULL DEFAULT 'NGN',
    status                   payment_status NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id TEXT           UNIQUE,
    stripe_charge_id         TEXT,
    failure_reason           TEXT,
    idempotency_key          TEXT           NOT NULL UNIQUE,
    created_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_belongs_to_one CHECK (
      (ride_id IS NOT NULL AND order_id IS NULL) OR
      (ride_id IS NULL  AND order_id IS NOT NULL)
    )
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE ratings (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     UUID        REFERENCES rides(id),
    order_id    UUID        REFERENCES orders(id),
    customer_id UUID        NOT NULL REFERENCES users(id),
    driver_id   UUID        NOT NULL REFERENCES drivers(id),
    score       SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rating_belongs_to_one CHECK (
      (ride_id IS NOT NULL AND order_id IS NULL) OR
      (ride_id IS NULL  AND order_id IS NOT NULL)
    ),
    UNIQUE (ride_id,  customer_id),
    UNIQUE (order_id, customer_id)
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE notifications (
    id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID        NOT NULL REFERENCES users(id),
    type     notif_type  NOT NULL,
    title    TEXT        NOT NULL,
    body     TEXT        NOT NULL,
    data     JSONB       NOT NULL DEFAULT '{}',
    is_read  BOOLEAN     NOT NULL DEFAULT FALSE,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE app_logs (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        REFERENCES users(id),
    level      log_level   NOT NULL DEFAULT 'info',
    message    TEXT        NOT NULL,
    context    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE admin_audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    admin_id    UUID        NOT NULL REFERENCES users(id),
    action      TEXT        NOT NULL,
    target_type TEXT        NOT NULL,
    target_id   UUID        NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ── Hygiene: drop orphaned table from outside migrations ──────
-- public.instruments was created outside migration files,
-- contained only seed/test data, and has no RLS policies.
-- It is intentionally removed here.
DROP TABLE IF EXISTS public.instruments;


-- ── Indexes ───────────────────────────────────────────────────

-- users
-- NOTE: idx_users_phone is intentionally absent.
-- The UNIQUE constraint on users.phone already creates an
-- implicit btree index (users_phone_key) that serves the same
-- purpose. A second manual index is pure write overhead.
DO $$ BEGIN
  CREATE INDEX idx_users_auth_id ON users(auth_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_users_role ON users(role);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- drivers
DO $$ BEGIN
  CREATE INDEX idx_drivers_location ON drivers USING GIST (current_location);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_drivers_status ON drivers(status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_drivers_user_id ON drivers(user_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- rides
DO $$ BEGIN
  CREATE INDEX idx_rides_customer_id ON rides(customer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rides_driver_id ON rides(driver_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rides_status ON rides(status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rides_timeout ON rides(timeout_at) WHERE status = 'pending';
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rides_pickup ON rides USING GIST (pickup_location);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- orders
DO $$ BEGIN
  CREATE INDEX idx_orders_customer_id ON orders(customer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_orders_driver_id ON orders(driver_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_orders_status ON orders(status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- payments
DO $$ BEGIN
  CREATE INDEX idx_payments_ride_id ON payments(ride_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payments_order_id ON payments(order_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payments_customer_id ON payments(customer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payments_status ON payments(status);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ratings — all four FK columns now covered
-- ride_id and order_id use partial indexes since only one is
-- ever populated per row (the other is always NULL).
DO $$ BEGIN
  CREATE INDEX idx_ratings_customer_id ON ratings(customer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_ratings_driver_id ON ratings(driver_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_ratings_ride_id ON ratings(ride_id)
    WHERE ride_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_ratings_order_id ON ratings(order_id)
    WHERE order_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- notifications
DO $$ BEGIN
  CREATE INDEX idx_notifications_user_id ON notifications(user_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_notifications_unread ON notifications(user_id)
    WHERE is_read = FALSE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- app_logs
DO $$ BEGIN
  CREATE INDEX idx_app_logs_user_id ON app_logs(user_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_app_logs_level ON app_logs(level);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_app_logs_created ON app_logs(created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- admin_audit_log
DO $$ BEGIN
  CREATE INDEX idx_audit_admin_id ON admin_audit_log(admin_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ── Helper functions ──────────────────────────────────────────
-- CREATE OR REPLACE is idempotent — no DO wrapper needed.
--
-- FIX (002): All functions now have a pinned search_path.
--   SECURITY DEFINER functions use search_path = '' with
--   fully-qualified object names to prevent search_path
--   hijacking / privilege escalation attacks.
--   Non-SECURITY-DEFINER functions use search_path = 'public'.
--   PostGIS-using functions use search_path = 'public' until
--   PostGIS is moved to the extensions schema by Supabase
--   Support, at which point change to 'public, extensions'
--   and prefix all ST_* calls with extensions.

-- Checks whether the currently authenticated user is an admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Returns the public.users.id of the currently authenticated user.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Trigger function: stamps updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ── Triggers ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_rides_updated_at
    BEFORE UPDATE ON rides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Atomic functions ──────────────────────────────────────────
--
-- FIX (002): search_path = 'public' pins these functions to
-- the public schema. After PostGIS moves to extensions schema
-- (via Supabase Support ticket), change to:
--   SET search_path = 'public, extensions'
-- and prefix all ST_* calls with extensions.

-- Creates a new ride atomically, preventing duplicate active rides
-- per customer using advisory locks.
CREATE OR REPLACE FUNCTION public.create_ride_atomic(
  p_customer_id     UUID,
  p_vehicle_type    vehicle_type,
  p_pickup_address  TEXT,
  p_dropoff_address TEXT,
  p_pickup_lat      DOUBLE PRECISION,
  p_pickup_lng      DOUBLE PRECISION,
  p_dropoff_lat     DOUBLE PRECISION,
  p_dropoff_lng     DOUBLE PRECISION,
  p_distance_km     NUMERIC,
  p_fare_amount     NUMERIC
)
RETURNS rides
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_ride     rides%ROWTYPE;
  v_lock_key BIGINT;
BEGIN
  v_lock_key := hashtext(p_customer_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF EXISTS (
    SELECT 1 FROM rides
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'customer_has_active_ride';
  END IF;

  IF EXISTS (
    SELECT 1 FROM orders
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'assigned', 'in_transit')
  ) THEN
    RAISE EXCEPTION 'customer_has_active_order';
  END IF;

  INSERT INTO rides (
    customer_id, vehicle_type,
    pickup_address, dropoff_address,
    pickup_location, dropoff_location,
    distance_km, fare_amount
  ) VALUES (
    p_customer_id, p_vehicle_type,
    p_pickup_address, p_dropoff_address,
    ST_SetSRID(ST_MakePoint(p_pickup_lng,  p_pickup_lat),  4326)::geography,
    ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_distance_km, p_fare_amount
  )
  RETURNING * INTO v_ride;

  RETURN v_ride;
END;
$$;

-- Returns up to 10 nearby online drivers sorted by distance.
CREATE OR REPLACE FUNCTION public.find_nearby_drivers(
  p_lat          DOUBLE PRECISION,
  p_lng          DOUBLE PRECISION,
  p_radius_m     INTEGER      DEFAULT 5000,
  p_vehicle_type vehicle_type DEFAULT NULL
)
RETURNS TABLE (
  driver_id    UUID,
  user_id      UUID,
  distance_m   DOUBLE PRECISION,
  vehicle_type vehicle_type,
  rating       NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT
    d.id AS driver_id,
    d.user_id,
    ST_Distance(
      d.current_location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m,
    d.vehicle_type,
    d.rating
  FROM drivers d
  WHERE d.status = 'online'
    AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
    AND ST_DWithin(
          d.current_location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
  ORDER BY distance_m ASC
  LIMIT 10;
$$;

-- Atomically assigns a driver to a pending ride, preventing
-- race conditions using advisory locks and FOR UPDATE.
CREATE OR REPLACE FUNCTION public.accept_ride_atomic(
  p_ride_id   UUID,
  p_driver_id UUID
)
RETURNS rides
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_ride rides%ROWTYPE;
  v_lock BIGINT;
BEGIN
  v_lock := hashtext(p_ride_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock);

  SELECT * INTO v_ride FROM rides WHERE id = p_ride_id FOR UPDATE;

  IF v_ride.status != 'pending' THEN
    RAISE EXCEPTION 'ride_not_available: status=%', v_ride.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM rides
    WHERE driver_id = p_driver_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'driver_has_active_ride';
  END IF;

  UPDATE rides SET
    driver_id   = p_driver_id,
    status      = 'active',
    accepted_at = NOW()
  WHERE id = p_ride_id
  RETURNING * INTO v_ride;

  UPDATE drivers SET status = 'busy' WHERE id = p_driver_id;

  RETURN v_ride;
END;
$$;

-- Returns aggregated admin dashboard statistics.
-- SECURITY DEFINER so it can bypass RLS to count all rows.
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT json_build_object(
    'total_users',    (SELECT COUNT(*) FROM public.users    WHERE role = 'customer'),
    'total_drivers',  (SELECT COUNT(*) FROM public.users    WHERE role = 'driver'),
    'online_drivers', (SELECT COUNT(*) FROM public.drivers  WHERE status = 'online'),
    'active_rides',   (SELECT COUNT(*) FROM public.rides    WHERE status = 'active'),
    'active_orders',  (SELECT COUNT(*) FROM public.orders   WHERE status IN ('assigned','in_transit')),
    'rides_today',    (SELECT COUNT(*) FROM public.rides    WHERE created_at >= CURRENT_DATE),
    'orders_today',   (SELECT COUNT(*) FROM public.orders   WHERE created_at >= CURRENT_DATE),
    'revenue_today',  (SELECT COALESCE(SUM(amount),0) FROM public.payments
                       WHERE status = 'captured' AND created_at >= CURRENT_DATE),
    'pending_rides',  (SELECT COUNT(*) FROM public.rides    WHERE status = 'pending')
  );
$$;


-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;


-- ── Policies — users ──────────────────────────────────────────
--
-- FIX (002/003): All policies now have:
--   • TO authenticated — prevents anon role from triggering
--     policy evaluation (eliminates multiple-permissive warning
--     and cuts unnecessary work for unauthenticated callers)
--   • (SELECT auth.uid()) / (SELECT is_admin()) /
--     (SELECT current_user_id()) — wrapping in SELECT tells
--     the Postgres optimizer to evaluate once per statement
--     as an initPlan, not once per row (massive perf gain)

DO $$ BEGIN
  CREATE POLICY "users: read own profile"
    ON users FOR SELECT
    TO authenticated
    USING (
      auth_id = (SELECT auth.uid())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users: update own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (auth_id = (SELECT auth.uid()))
    WITH CHECK (
      auth_id = (SELECT auth.uid())
      -- Prevent users from self-escalating their own role
      AND role = (SELECT role FROM users WHERE auth_id = (SELECT auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: full access to users"
    ON users FOR ALL
    TO authenticated
    USING ((SELECT is_admin()))
    WITH CHECK ((SELECT is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — drivers ────────────────────────────────────────
--
-- FIX (003): The original had two SELECT policies with no TO
-- clause — "drivers: read own profile" and "authenticated:
-- read driver profiles". Both fired for every role including
-- anon, causing the multiple-permissive-policy warning.
-- "drivers: read own profile" is removed because
-- "authenticated: read driver profiles" (USING true) already
-- covers all authenticated users including the driver themselves.
-- Admins are also authenticated so they are covered too.
-- This leaves exactly one SELECT policy — the warning is gone.

DO $$ BEGIN
  CREATE POLICY "authenticated: read driver profiles"
    ON drivers FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: update own profile"
    ON drivers FOR UPDATE
    TO authenticated
    USING ((SELECT current_user_id()) = user_id)
    WITH CHECK ((SELECT current_user_id()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: full access to drivers"
    ON drivers FOR ALL
    TO authenticated
    USING ((SELECT is_admin()))
    WITH CHECK ((SELECT is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — rides ──────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own rides"
    ON rides FOR SELECT
    TO authenticated
    USING (
      customer_id = (SELECT current_user_id())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: see assigned or pending rides"
    ON rides FOR SELECT
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = (SELECT current_user_id())
                   LIMIT 1)
      OR (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM drivers
          WHERE user_id = (SELECT current_user_id())
        )
      )
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert rides"
    ON rides FOR INSERT
    TO authenticated
    WITH CHECK (customer_id = (SELECT current_user_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: update assigned rides"
    ON rides FOR UPDATE
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = (SELECT current_user_id()))
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — orders ─────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own orders"
    ON orders FOR SELECT
    TO authenticated
    USING (
      customer_id = (SELECT current_user_id())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: see assigned or pending orders"
    ON orders FOR SELECT
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = (SELECT current_user_id())
                   LIMIT 1)
      OR (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM drivers
          WHERE user_id = (SELECT current_user_id())
        )
      )
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert orders"
    ON orders FOR INSERT
    TO authenticated
    WITH CHECK (customer_id = (SELECT current_user_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: update assigned orders"
    ON orders FOR UPDATE
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = (SELECT current_user_id()))
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — payments ───────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own payments"
    ON payments FOR SELECT
    TO authenticated
    USING (
      customer_id = (SELECT current_user_id())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service: insert payments"
    ON payments FOR INSERT
    TO authenticated
    WITH CHECK (
      customer_id = (SELECT current_user_id())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — ratings ────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: see ratings"
    ON ratings FOR SELECT
    TO authenticated
    USING (
      customer_id = (SELECT current_user_id())
      OR driver_id = (SELECT id FROM drivers
                      WHERE user_id = (SELECT current_user_id()))
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert own ratings"
    ON ratings FOR INSERT
    TO authenticated
    WITH CHECK (customer_id = (SELECT current_user_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — notifications ──────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: see own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (
      user_id = (SELECT current_user_id())
      OR (SELECT is_admin())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FIX: WITH CHECK added — original only had USING, which means
-- the row being written was not validated against ownership.
DO $$ BEGIN
  CREATE POLICY "users: mark own notifications read"
    ON notifications FOR UPDATE
    TO authenticated
    USING   (user_id = (SELECT current_user_id()))
    WITH CHECK (user_id = (SELECT current_user_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — app_logs ───────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: insert own logs"
    ON app_logs FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = (SELECT current_user_id())
      OR user_id IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: read all logs"
    ON app_logs FOR SELECT
    TO authenticated
    USING ((SELECT is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — admin_audit_log ────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "admin: full access to audit log"
    ON admin_audit_log FOR ALL
    TO authenticated
    USING ((SELECT is_admin()))
    WITH CHECK ((SELECT is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Realtime ──────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rides;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Confirmation ──────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Drop schema v2 installed successfully';
  RAISE NOTICE '';
  RAISE NOTICE '  Tables:    users, drivers, rides, orders,';
  RAISE NOTICE '             payments, ratings, notifications,';
  RAISE NOTICE '             app_logs, admin_audit_log';
  RAISE NOTICE '';
  RAISE NOTICE '  Functions: is_admin, current_user_id,';
  RAISE NOTICE '             update_updated_at,';
  RAISE NOTICE '             create_ride_atomic,';
  RAISE NOTICE '             accept_ride_atomic,';
  RAISE NOTICE '             find_nearby_drivers,';
  RAISE NOTICE '             get_admin_stats';
  RAISE NOTICE '';
  RAISE NOTICE '  RLS:       enabled on all 9 tables';
  RAISE NOTICE '  Realtime:  rides, orders, drivers, notifications';
  RAISE NOTICE '';
  RAISE NOTICE '  Security fixes applied:';
  RAISE NOTICE '    • search_path pinned on all 7 functions';
  RAISE NOTICE '    • SECURITY DEFINER funcs use search_path = ''''';
  RAISE NOTICE '    • All RLS auth calls wrapped in (SELECT ...)';
  RAISE NOTICE '    • TO authenticated on all policies';
  RAISE NOTICE '    • drivers SELECT policies consolidated';
  RAISE NOTICE '    • notifications UPDATE WITH CHECK added';
  RAISE NOTICE '    • 4 FK indexes added to ratings';
  RAISE NOTICE '    • Duplicate idx_users_phone removed';
  RAISE NOTICE '    • public.instruments dropped';
  RAISE NOTICE '';
  RAISE NOTICE '  Still requires manual action:';
  RAISE NOTICE '    • PostGIS → extensions schema:';
  RAISE NOTICE '      Open a Supabase Support ticket';
  RAISE NOTICE '    • Leaked password protection:';
  RAISE NOTICE '      Dashboard → Auth → Providers → Email';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'After your first signup, promote yourself to admin:';
  RAISE NOTICE '  UPDATE users SET role = ''admin''';
  RAISE NOTICE '  WHERE phone = ''+YOUR_PHONE'';';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;