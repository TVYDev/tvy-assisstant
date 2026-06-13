-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: deposit balances + transaction history (separate from debt_records)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deposit_balances (
  shortcode TEXT PRIMARY KEY REFERENCES telegram_users(shortcode) ON DELETE CASCADE,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_deposit_balances_updated_at ON deposit_balances;
CREATE TRIGGER trg_deposit_balances_updated_at
  BEFORE UPDATE ON deposit_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS deposit_transactions (
  id BIGSERIAL PRIMARY KEY,
  shortcode TEXT NOT NULL REFERENCES telegram_users(shortcode) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('add', 'reduce')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(10, 2) NOT NULL CHECK (balance_after >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_transactions_shortcode
  ON deposit_transactions(shortcode, created_at DESC);

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
