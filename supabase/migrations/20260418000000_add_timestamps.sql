-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add created_at / updated_at to all tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared trigger function: auto-set updated_at on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── telegram_users ────────────────────────────────────────────────────────────
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_telegram_users_updated_at ON telegram_users;
CREATE TRIGGER trg_telegram_users_updated_at
  BEFORE UPDATE ON telegram_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── debt_records ──────────────────────────────────────────────────────────────
ALTER TABLE debt_records
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_debt_records_updated_at ON debt_records;
CREATE TRIGGER trg_debt_records_updated_at
  BEFORE UPDATE ON debt_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── debt_items ────────────────────────────────────────────────────────────────
ALTER TABLE debt_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_debt_items_updated_at ON debt_items;
CREATE TRIGGER trg_debt_items_updated_at
  BEFORE UPDATE ON debt_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── youtube_subscription_months ───────────────────────────────────────────────
ALTER TABLE youtube_subscription_months
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_yt_months_updated_at ON youtube_subscription_months;
CREATE TRIGGER trg_yt_months_updated_at
  BEFORE UPDATE ON youtube_subscription_months
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── youtube_subscription_members ─────────────────────────────────────────────
ALTER TABLE youtube_subscription_members
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_yt_members_updated_at ON youtube_subscription_members;
CREATE TRIGGER trg_yt_members_updated_at
  BEFORE UPDATE ON youtube_subscription_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── app_config ────────────────────────────────────────────────────────────────
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON app_config;
CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
