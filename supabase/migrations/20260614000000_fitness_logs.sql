-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: daily fitness logs + guided log sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE daily_fitness_logs (
  id BIGSERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  weight_kg NUMERIC(5, 2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  gym_yesterday BOOLEAN NOT NULL DEFAULT FALSE,
  gym_session TEXT CHECK (
    gym_session IS NULL
    OR gym_session IN (
      'chest',
      'shoulder',
      'back',
      'triceps',
      'biceps',
      'legs',
      'cardio'
    )
  ),
  gym_minutes INTEGER CHECK (
    gym_minutes IS NULL
    OR (gym_minutes > 0 AND gym_minutes <= 600)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gym_fields_consistency CHECK (
    (
      gym_yesterday = FALSE
      AND gym_session IS NULL
      AND gym_minutes IS NULL
    )
    OR (
      gym_yesterday = TRUE
      AND gym_session IS NOT NULL
      AND gym_minutes IS NOT NULL
    )
  )
);

CREATE INDEX idx_daily_fitness_logs_log_date ON daily_fitness_logs (log_date DESC);

CREATE TABLE fitness_log_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  step TEXT NOT NULL CHECK (step IN ('weight', 'gym', 'session', 'minutes')),
  weight_kg NUMERIC(5, 2),
  gym_yesterday BOOLEAN,
  gym_session TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fitness_log_sessions_expires_at ON fitness_log_sessions (expires_at);

DROP TRIGGER IF EXISTS trg_daily_fitness_logs_updated_at ON daily_fitness_logs;
CREATE TRIGGER trg_daily_fitness_logs_updated_at
  BEFORE UPDATE ON daily_fitness_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_fitness_log_sessions_updated_at ON fitness_log_sessions;
CREATE TRIGGER trg_fitness_log_sessions_updated_at
  BEFORE UPDATE ON fitness_log_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
