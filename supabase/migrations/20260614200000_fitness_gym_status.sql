-- Replace gym_yesterday boolean with gym_status: gym | rest | skip

ALTER TABLE daily_fitness_logs
  ADD COLUMN IF NOT EXISTS gym_status TEXT;

UPDATE daily_fitness_logs
SET gym_status = CASE
  WHEN gym_yesterday THEN 'gym'
  ELSE 'rest'
END
WHERE gym_status IS NULL;

ALTER TABLE daily_fitness_logs
  ALTER COLUMN gym_status SET NOT NULL;

ALTER TABLE daily_fitness_logs
  DROP CONSTRAINT IF EXISTS gym_fields_consistency;

ALTER TABLE daily_fitness_logs
  DROP COLUMN IF EXISTS gym_yesterday;

ALTER TABLE daily_fitness_logs
  DROP CONSTRAINT IF EXISTS daily_fitness_logs_gym_status_check;

ALTER TABLE daily_fitness_logs
  ADD CONSTRAINT daily_fitness_logs_gym_status_check CHECK (
    gym_status IN ('gym', 'rest', 'skip')
  );

ALTER TABLE daily_fitness_logs
  ADD CONSTRAINT gym_fields_consistency CHECK (
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
  );

ALTER TABLE fitness_log_sessions
  DROP COLUMN IF EXISTS gym_yesterday;
