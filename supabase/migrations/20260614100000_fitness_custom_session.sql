-- Allow custom gym session labels (buttons still offer presets)

ALTER TABLE daily_fitness_logs
  DROP CONSTRAINT IF EXISTS daily_fitness_logs_gym_session_check;

ALTER TABLE daily_fitness_logs
  ADD CONSTRAINT daily_fitness_logs_gym_session_check CHECK (
    gym_session IS NULL
    OR (
      length(trim(gym_session)) > 0
      AND length(gym_session) <= 50
    )
  );
