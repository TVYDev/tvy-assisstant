-- YouTube monthly fee schedules with effective / expiry dates.
-- Each unpaid subscription month is billed at the fee active on that month.

CREATE TABLE IF NOT EXISTS youtube_fee_schedules (
  id            SERIAL PRIMARY KEY,
  fee           NUMERIC(10, 2) NOT NULL CHECK (fee >= 0),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_youtube_fee_schedules_dates
  ON youtube_fee_schedules (effective_from, effective_to);

DROP TRIGGER IF EXISTS trg_youtube_fee_schedules_updated_at ON youtube_fee_schedules;
CREATE TRIGGER trg_youtube_fee_schedules_updated_at
  BEFORE UPDATE ON youtube_fee_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed from legacy app_config when present; otherwise default $1.19 from 2020-01-01.
INSERT INTO youtube_fee_schedules (fee, effective_from, effective_to)
SELECT
  COALESCE(
    (SELECT value::NUMERIC FROM app_config WHERE key = 'youtube_monthly_fee' LIMIT 1),
    1.19
  ),
  DATE '2020-01-01',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM youtube_fee_schedules);
