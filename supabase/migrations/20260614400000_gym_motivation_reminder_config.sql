-- Default: weekday gym motivation reminder enabled

INSERT INTO app_config (key, value)
VALUES ('gym_motivation_reminder_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
