-- ─────────────────────────────────────────────────────────────────────────
-- Rush Fitness GMS — initial schema
-- PostgreSQL 14+. Run with: npm run db:migrate
-- All money columns store the smallest currency unit as NUMERIC(14,2).
-- Times are TIMESTAMPTZ so the API stays timezone-safe.
-- ─────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive emails / usernames

-- ── reusable: updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- USERS (staff accounts that can log in)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        CITEXT UNIQUE NOT NULL,
  email           CITEXT UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','manager','receptionist','trainer')),
  phone           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- MEMBERS
-- (Field names match the existing React app: first_name, last_name, etc.
--  Use surname=last_name and other_names=first_name conceptually.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code        TEXT UNIQUE,                      -- human-readable e.g. RF-00001
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  phone              TEXT NOT NULL,
  email              CITEXT,
  gender             TEXT CHECK (gender IN ('Male','Female','Other')),
  dob                DATE,
  national_id        TEXT,
  emergency_name     TEXT,
  emergency_phone    TEXT,
  emergency_phone_2  TEXT,
  photo_url          TEXT,
  pin_hash           TEXT,                             -- self check-in pin (hashed)
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  joined_on          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX members_phone_idx     ON members (phone);
CREATE INDEX members_name_idx      ON members (last_name, first_name);
CREATE INDEX members_active_idx    ON members (is_active);
CREATE TRIGGER members_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- TRAINERS
-- (Independent record. If a trainer also needs to log in we link via user_id.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE trainers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             CITEXT,
  gender            TEXT CHECK (gender IN ('Male','Female','Other')),
  dob               DATE,
  national_id       TEXT,
  emergency_name    TEXT,
  emergency_phone   TEXT,
  specialisation    TEXT,                              -- e.g. "Strength, Boxing"
  hourly_rate       NUMERIC(12,2),
  hired_on          DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX trainers_active_idx ON trainers (is_active);
CREATE TRIGGER trainers_updated_at BEFORE UPDATE ON trainers
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- PLANS (membership pricing catalogue — replaces hardcoded PLANS object)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,                  -- e.g. gym_monthly
  name          TEXT NOT NULL,                         -- e.g. "Monthly (Gym)"
  category      TEXT NOT NULL CHECK (category IN ('gym','combo','prepaid','group')),
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  group_size    INTEGER,                               -- only for group plans
  daily_rate    NUMERIC(12,2),                         -- only for prepaid
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- MEMBERSHIPS (a member's purchase of a plan)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES plans(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  total_due     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid    NUMERIC(12,2) NOT NULL DEFAULT 0,
  frozen_days   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','expired','frozen','cancelled')),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memberships_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX memberships_member_idx     ON memberships (member_id);
CREATE INDEX memberships_status_idx     ON memberships (status);
CREATE INDEX memberships_end_idx        ON memberships (end_date);
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- DISCOUNTS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE discounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  description  TEXT,
  type         TEXT NOT NULL CHECK (type IN ('percent','flat')),
  value        NUMERIC(12,2) NOT NULL CHECK (value >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER discounts_updated_at BEFORE UPDATE ON discounts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- PAYMENTS
-- A payment may be tied to a membership, a walk-in, or a product sale
-- (only one of those FKs should be set per row, enforced by check below).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID REFERENCES members(id) ON DELETE SET NULL,
  membership_id   UUID REFERENCES memberships(id) ON DELETE SET NULL,
  walk_in_id      UUID,                            -- FK added below
  product_sale_id UUID,                            -- FK added below
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'KES',
  method          TEXT NOT NULL CHECK (method IN ('cash','mpesa','card','bank_transfer')),
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('pending','completed','failed','refunded')),
  reference       TEXT,                            -- M-Pesa code, bank ref, last 4
  payer_phone     TEXT,                            -- for M-Pesa
  card_brand      TEXT,                            -- for card payments
  card_last4      TEXT,
  discount_id     UUID REFERENCES discounts(id),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type            TEXT NOT NULL DEFAULT 'membership'
                  CHECK (type IN ('membership','addon','walk_in','product','other')),
  activity_id     UUID,                            -- FK added below
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_member_idx     ON payments (member_id);
CREATE INDEX payments_membership_idx ON payments (membership_id);
CREATE INDEX payments_paid_at_idx    ON payments (paid_at);

-- ─────────────────────────────────────────────────────────────────────────
-- LOCKERS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE lockers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        INTEGER NOT NULL,
  section       TEXT NOT NULL CHECK (section IN ('gents','ladies')),
  status        TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','occupied','maintenance')),
  member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  occupied_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section, number)
);
CREATE INDEX lockers_status_idx ON lockers (status);
CREATE TRIGGER lockers_updated_at BEFORE UPDATE ON lockers
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- ACTIVITIES (classes)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,             -- e.g. "spinning"
  name            TEXT NOT NULL,
  standalone_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  addon_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Now that activities exists we can wire payments.activity_id
ALTER TABLE payments
  ADD CONSTRAINT payments_activity_fk
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- TIMETABLE (recurring weekly class slots)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE timetable (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  trainer_id    UUID REFERENCES trainers(id) ON DELETE SET NULL,
  capacity      INTEGER,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX timetable_day_idx ON timetable (day_of_week);
CREATE TRIGGER timetable_updated_at BEFORE UPDATE ON timetable
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- ATTENDANCE / CHECK-INS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  check_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_at  TIMESTAMPTZ,
  visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  source        TEXT NOT NULL DEFAULT 'staff'
                CHECK (source IN ('staff','self','kiosk')),
  locker_id     UUID REFERENCES lockers(id) ON DELETE SET NULL,
  activity_id   UUID REFERENCES activities(id) ON DELETE SET NULL,
  recorded_by   UUID REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out_at IS NULL OR check_out_at >= check_in_at)
);
CREATE INDEX attendance_member_idx  ON attendance (member_id);
CREATE INDEX attendance_date_idx    ON attendance (visit_date);

-- ─────────────────────────────────────────────────────────────────────────
-- WALK-INS (non-members paying for a single visit)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE walk_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  phone           TEXT,
  visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_id     UUID REFERENCES activities(id) ON DELETE SET NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status  TEXT NOT NULL DEFAULT 'pending'
                  CHECK (payment_status IN ('pending','paid','refunded')),
  checked_in      BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at   TIMESTAMPTZ,
  recorded_by     UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX walk_ins_date_idx ON walk_ins (visit_date);
CREATE TRIGGER walk_ins_updated_at BEFORE UPDATE ON walk_ins
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

ALTER TABLE payments
  ADD CONSTRAINT payments_walk_in_fk
  FOREIGN KEY (walk_in_id) REFERENCES walk_ins(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- PRODUCTS (shop inventory)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           TEXT UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX products_active_idx ON products (is_active);
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE product_sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  member_id     UUID REFERENCES members(id) ON DELETE SET NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total         NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  sold_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by   UUID REFERENCES users(id)
);
CREATE INDEX product_sales_product_idx ON product_sales (product_id);
CREATE INDEX product_sales_date_idx    ON product_sales (sold_at);

ALTER TABLE payments
  ADD CONSTRAINT payments_product_sale_fk
  FOREIGN KEY (product_sale_id) REFERENCES product_sales(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- EQUIPMENT
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT,
  serial_number   TEXT UNIQUE,
  purchased_on    DATE,
  purchase_cost   NUMERIC(12,2),
  status          TEXT NOT NULL DEFAULT 'operational'
                  CHECK (status IN ('operational','maintenance','retired')),
  last_serviced   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER equipment_updated_at BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,
  description   TEXT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  spent_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by       TEXT,
  receipt_url   TEXT,
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX expenses_date_idx ON expenses (spent_on);

-- ─────────────────────────────────────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  username      TEXT,                               -- snapshot in case user deleted
  action        TEXT NOT NULL,                      -- e.g. 'member.create'
  entity_type   TEXT,                               -- e.g. 'members'
  entity_id     TEXT,                               -- stringified id of touched row
  ip_address    INET,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_user_idx    ON audit_logs (user_id);
CREATE INDEX audit_entity_idx  ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_created_idx ON audit_logs (created_at);
