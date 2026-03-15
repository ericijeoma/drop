-- ============================================================
-- Drop — Complete Database Schema
-- File path: supabase/migrations/001_schema.sql
-- Safe to run multiple times — no errors on re-run.
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
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      UUID          NOT NULL REFERENCES users(id),
    driver_id        UUID          REFERENCES drivers(id),
    vehicle_type     vehicle_type  NOT NULL,
    status           ride_status   NOT NULL DEFAULT 'pending',
    pickup_address   TEXT          NOT NULL,
    dropoff_address  TEXT          NOT NULL,
    pickup_location  geography(POINT, 4326) NOT NULL,
    dropoff_location geography(POINT, 4326) NOT NULL,
    distance_km      NUMERIC(8,3)  NOT NULL CHECK (distance_km > 0),
    fare_amount      NUMERIC(10,2) NOT NULL CHECK (fare_amount > 0),
    payment_status   payment_status NOT NULL DEFAULT 'pending',
    requested_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    cancelled_at     TIMESTAMPTZ,
    timeout_at       TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes'),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE orders (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID          NOT NULL REFERENCES users(id),
    driver_id           UUID          REFERENCES drivers(id),
    status              order_status  NOT NULL DEFAULT 'pending',
    pickup_address      TEXT          NOT NULL,
    dropoff_address     TEXT          NOT NULL,
    pickup_location     geography(POINT, 4326) NOT NULL,
    dropoff_location    geography(POINT, 4326) NOT NULL,
    package_description TEXT          NOT NULL DEFAULT '',
    package_size        TEXT          NOT NULL DEFAULT 'small'
                        CHECK (package_size IN ('small','medium','large')),
    delivery_photo_url  TEXT,
    distance_km         NUMERIC(8,3)  NOT NULL CHECK (distance_km > 0),
    fare_amount         NUMERIC(10,2) NOT NULL CHECK (fare_amount > 0),
    payment_status      payment_status NOT NULL DEFAULT 'pending',
    requested_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    assigned_at         TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    timeout_at          TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE payments (
    id                        UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id                   UUID           REFERENCES rides(id),
    order_id                  UUID           REFERENCES orders(id),
    customer_id               UUID           NOT NULL REFERENCES users(id),
    amount                    NUMERIC(10,2)  NOT NULL CHECK (amount > 0),
    currency                  CHAR(3)        NOT NULL DEFAULT 'NGN',
    status                    payment_status NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id  TEXT           UNIQUE,
    stripe_charge_id          TEXT,
    failure_reason            TEXT,
    idempotency_key           TEXT           NOT NULL UNIQUE,
    created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_belongs_to_one CHECK (
      (ride_id IS NOT NULL AND order_id IS NULL) OR
      (ride_id IS NULL  AND order_id IS NOT NULL)
    )
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE ratings (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     UUID      REFERENCES rides(id),
    order_id    UUID      REFERENCES orders(id),
    customer_id UUID      NOT NULL REFERENCES users(id),
    driver_id   UUID      NOT NULL REFERENCES drivers(id),
    score       SMALLINT  NOT NULL CHECK (score BETWEEN 1 AND 5),
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


-- ── Indexes ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE INDEX idx_users_auth_id ON users(auth_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_users_phone ON users(phone);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_users_role ON users(role);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

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

DO $$ BEGIN
  CREATE INDEX idx_notifications_user_id ON notifications(user_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

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

DO $$ BEGIN
  CREATE INDEX idx_audit_admin_id ON admin_audit_log(admin_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ── Helper functions ─────────────────────────────────────────
-- CREATE OR REPLACE is already idempotent — no wrapper needed.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
    AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
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


-- ── Atomic functions ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_ride_atomic(
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

CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat          DOUBLE PRECISION,
  p_lng          DOUBLE PRECISION,
  p_radius_m     INTEGER          DEFAULT 5000,
  p_vehicle_type vehicle_type     DEFAULT NULL
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

CREATE OR REPLACE FUNCTION accept_ride_atomic(
  p_ride_id   UUID,
  p_driver_id UUID
)
RETURNS rides
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'total_users',    (SELECT COUNT(*) FROM users    WHERE role = 'customer'),
    'total_drivers',  (SELECT COUNT(*) FROM users    WHERE role = 'driver'),
    'online_drivers', (SELECT COUNT(*) FROM drivers  WHERE status = 'online'),
    'active_rides',   (SELECT COUNT(*) FROM rides    WHERE status = 'active'),
    'active_orders',  (SELECT COUNT(*) FROM orders   WHERE status IN ('assigned','in_transit')),
    'rides_today',    (SELECT COUNT(*) FROM rides    WHERE created_at >= CURRENT_DATE),
    'orders_today',   (SELECT COUNT(*) FROM orders   WHERE created_at >= CURRENT_DATE),
    'revenue_today',  (SELECT COALESCE(SUM(amount),0) FROM payments
                       WHERE status = 'captured' AND created_at >= CURRENT_DATE),
    'pending_rides',  (SELECT COUNT(*) FROM rides    WHERE status = 'pending')
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


-- ── Policies — users ─────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: read own profile"
    ON users FOR SELECT
    USING (auth_id = auth.uid() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users: update own profile"
    ON users FOR UPDATE
    USING (auth_id = auth.uid())
    WITH CHECK (
      auth_id = auth.uid()
      AND role = (SELECT role FROM users WHERE auth_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: full access to users"
    ON users FOR ALL
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — drivers ────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "drivers: read own profile"
    ON drivers FOR SELECT
    USING (user_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    USING (user_id = current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: full access to drivers"
    ON drivers FOR ALL
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — rides ──────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own rides"
    ON rides FOR SELECT
    TO authenticated
    USING (customer_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: see assigned or pending rides"
    ON rides FOR SELECT
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = current_user_id()
                   LIMIT 1)
      OR (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM drivers
          WHERE user_id = current_user_id()
        )
      )
      OR is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert rides"
    ON rides FOR INSERT
    WITH CHECK (customer_id = current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: update assigned rides"
    ON rides FOR UPDATE
    USING (
      driver_id = (SELECT id FROM drivers WHERE user_id = current_user_id())
      OR is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — orders ─────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own orders"
    ON orders FOR SELECT
    USING (customer_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: see assigned or pending orders"
    ON orders FOR SELECT
    TO authenticated
    USING (
      driver_id = (SELECT id FROM drivers
                   WHERE user_id = current_user_id()
                   LIMIT 1)
      OR (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM drivers
          WHERE user_id = current_user_id()
        )
      )
      OR is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert orders"
    ON orders FOR INSERT
    WITH CHECK (customer_id = current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drivers: update assigned orders"
    ON orders FOR UPDATE
    USING (
      driver_id = (SELECT id FROM drivers WHERE user_id = current_user_id())
      OR is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — payments ───────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "customers: see own payments"
    ON payments FOR SELECT
    USING (customer_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service: insert payments"
    ON payments FOR INSERT
    WITH CHECK (customer_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — ratings ────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: see ratings"
    ON ratings FOR SELECT
    USING (
      customer_id = current_user_id()
      OR driver_id = (SELECT id FROM drivers WHERE user_id = current_user_id())
      OR is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers: insert own ratings"
    ON ratings FOR INSERT
    WITH CHECK (customer_id = current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — notifications ──────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: see own notifications"
    ON notifications FOR SELECT
    USING (user_id = current_user_id() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users: mark own notifications read"
    ON notifications FOR UPDATE
    USING (user_id = current_user_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — app_logs ───────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users: insert own logs"
    ON app_logs FOR INSERT
    WITH CHECK (user_id = current_user_id() OR user_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin: read all logs"
    ON app_logs FOR SELECT
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Policies — admin_audit_log ────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "admin: full access to audit log"
    ON admin_audit_log FOR ALL
    USING (is_admin());
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
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✓ Drop schema installed successfully';
  RAISE NOTICE '  Tables:    users, drivers, rides, orders,';
  RAISE NOTICE '             payments, ratings, notifications,';
  RAISE NOTICE '             app_logs, admin_audit_log';
  RAISE NOTICE '  Functions: is_admin, current_user_id,';
  RAISE NOTICE '             create_ride_atomic,';
  RAISE NOTICE '             accept_ride_atomic,';
  RAISE NOTICE '             find_nearby_drivers,';
  RAISE NOTICE '             get_admin_stats';
  RAISE NOTICE '  RLS:       enabled on all tables';
  RAISE NOTICE '  Realtime:  rides, orders, drivers,';
  RAISE NOTICE '             notifications';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE 'After your first signup, run:';
  RAISE NOTICE 'UPDATE users SET role = ''admin''';
  RAISE NOTICE 'WHERE phone = ''+YOUR_PHONE'';';
  RAISE NOTICE '══════════════════════════════════════════════';
END $$;