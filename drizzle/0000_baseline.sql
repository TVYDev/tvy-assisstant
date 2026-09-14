-- Baseline schema ported from live Supabase usage + repo migrations.
-- Includes tables missing from supabase/migrations and PL/pgSQL RPCs.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS telegram_users (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT UNIQUE,
  telegram_username TEXT,
  shortcode TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debt_records (
  id BIGSERIAL PRIMARY KEY,
  shortcode TEXT NOT NULL UNIQUE REFERENCES telegram_users(shortcode)
    ON DELETE CASCADE ON UPDATE CASCADE,
  owes_me NUMERIC(10, 2) NOT NULL DEFAULT 0,
  i_owe NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debt_items (
  id BIGSERIAL PRIMARY KEY,
  debt_record_id BIGINT NOT NULL REFERENCES debt_records(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  date DATE NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposit_balances (
  shortcode TEXT PRIMARY KEY REFERENCES telegram_users(shortcode)
    ON DELETE CASCADE ON UPDATE CASCADE,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposit_transactions (
  id BIGSERIAL PRIMARY KEY,
  shortcode TEXT NOT NULL REFERENCES telegram_users(shortcode)
    ON DELETE CASCADE ON UPDATE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('add', 'reduce')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(10, 2) NOT NULL CHECK (balance_after >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_transactions_shortcode
  ON deposit_transactions(shortcode, created_at DESC);

CREATE TABLE IF NOT EXISTS youtube_subscription_members (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS youtube_subscription_months (
  id BIGSERIAL PRIMARY KEY,
  shortcode TEXT NOT NULL,
  month DATE NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shortcode, month)
);

CREATE TABLE IF NOT EXISTS youtube_fee_schedules (
  id SERIAL PRIMARY KEY,
  fee NUMERIC(10, 2) NOT NULL CHECK (fee >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_youtube_fee_schedules_dates
  ON youtube_fee_schedules (effective_from, effective_to);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_fitness_logs (
  id BIGSERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  weight_kg NUMERIC(5, 2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  gym_status TEXT NOT NULL CHECK (gym_status IN ('gym', 'rest', 'skip')),
  gym_session TEXT CHECK (
    gym_session IS NULL
    OR (length(trim(gym_session)) > 0 AND length(gym_session) <= 50)
  ),
  gym_minutes INTEGER CHECK (
    gym_minutes IS NULL OR (gym_minutes > 0 AND gym_minutes <= 600)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gym_fields_consistency CHECK (
    (
      gym_status = 'gym'
      AND gym_session IS NOT NULL
      AND gym_minutes IS NOT NULL
    )
    OR (
      gym_status IN ('rest', 'skip')
      AND gym_session IS NULL
      AND gym_minutes IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_daily_fitness_logs_log_date
  ON daily_fitness_logs (log_date DESC);

CREATE TABLE IF NOT EXISTS fitness_log_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  step TEXT NOT NULL CHECK (step IN ('weight', 'gym', 'session', 'minutes')),
  weight_kg NUMERIC(5, 2),
  gym_session TEXT,
  target_log_date DATE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fitness_log_sessions_expires_at
  ON fitness_log_sessions (expires_at);

DROP TRIGGER IF EXISTS trg_telegram_users_updated_at ON telegram_users;
CREATE TRIGGER trg_telegram_users_updated_at
  BEFORE UPDATE ON telegram_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_debt_records_updated_at ON debt_records;
CREATE TRIGGER trg_debt_records_updated_at
  BEFORE UPDATE ON debt_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_debt_items_updated_at ON debt_items;
CREATE TRIGGER trg_debt_items_updated_at
  BEFORE UPDATE ON debt_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deposit_balances_updated_at ON deposit_balances;
CREATE TRIGGER trg_deposit_balances_updated_at
  BEFORE UPDATE ON deposit_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_yt_months_updated_at ON youtube_subscription_months;
CREATE TRIGGER trg_yt_months_updated_at
  BEFORE UPDATE ON youtube_subscription_months
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_yt_members_updated_at ON youtube_subscription_members;
CREATE TRIGGER trg_yt_members_updated_at
  BEFORE UPDATE ON youtube_subscription_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_youtube_fee_schedules_updated_at ON youtube_fee_schedules;
CREATE TRIGGER trg_youtube_fee_schedules_updated_at
  BEFORE UPDATE ON youtube_fee_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON app_config;
CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_daily_fitness_logs_updated_at ON daily_fitness_logs;
CREATE TRIGGER trg_daily_fitness_logs_updated_at
  BEFORE UPDATE ON daily_fitness_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_fitness_log_sessions_updated_at ON fitness_log_sessions;
CREATE TRIGGER trg_fitness_log_sessions_updated_at
  BEFORE UPDATE ON fitness_log_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION increment_owes_me(p_shortcode TEXT, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  new_val NUMERIC;
BEGIN
  UPDATE debt_records
  SET owes_me = owes_me + p_amount
  WHERE shortcode = p_shortcode
  RETURNING owes_me INTO new_val;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_owes_me(p_shortcode TEXT, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  new_val NUMERIC;
BEGIN
  UPDATE debt_records
  SET owes_me = owes_me - p_amount
  WHERE shortcode = p_shortcode
  RETURNING owes_me INTO new_val;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_deposit_balance(
  p_shortcode TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  INSERT INTO deposit_balances (shortcode, balance)
  VALUES (p_shortcode, p_amount)
  ON CONFLICT (shortcode) DO UPDATE
    SET balance = deposit_balances.balance + EXCLUDED.balance;

  SELECT balance INTO new_balance
  FROM deposit_balances
  WHERE shortcode = p_shortcode;

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_deposit_balance(
  p_shortcode TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE deposit_balances
  SET balance = balance - p_amount
  WHERE shortcode = p_shortcode
    AND balance >= p_amount
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_deposit_balance';
  END IF;

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION insert_youtube_months_current()
RETURNS void AS $$
BEGIN
  INSERT INTO youtube_subscription_months (shortcode, month, paid)
  SELECT
    m.id,
    date_trunc('month', timezone('Asia/Phnom_Penh', now()))::date,
    false
  FROM youtube_subscription_members m
  ON CONFLICT (shortcode, month) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

INSERT INTO app_config (key, value)
VALUES ('gym_motivation_reminder_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value)
VALUES (
  'command_followup_stickers',
  '{"start":{"enabled":true,"stickerId":"CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA","minNetOwed":null},"owe":{"enabled":false,"stickerId":null,"minNetOwed":5},"qr":{"enabled":false,"stickerId":null,"minNetOwed":5},"about":{"enabled":false,"stickerId":null,"minNetOwed":null}}'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value)
VALUES ('command_sticker_setup_pending', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO youtube_fee_schedules (fee, effective_from, effective_to)
SELECT 1.19, DATE '2020-01-01', NULL
WHERE NOT EXISTS (SELECT 1 FROM youtube_fee_schedules);
