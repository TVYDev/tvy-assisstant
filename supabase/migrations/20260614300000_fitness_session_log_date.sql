-- Store target log date for guided backdate sessions

ALTER TABLE fitness_log_sessions
  ADD COLUMN IF NOT EXISTS target_log_date DATE;
