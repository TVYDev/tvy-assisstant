-- Default follow-up sticker rules for public commands

INSERT INTO app_config (key, value)
VALUES (
  'command_followup_stickers',
  '{"start":{"enabled":true,"stickerId":"CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA","minNetOwed":null},"owe":{"enabled":false,"stickerId":null,"minNetOwed":5},"qr":{"enabled":false,"stickerId":null,"minNetOwed":5},"about":{"enabled":false,"stickerId":null,"minNetOwed":null}}'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value)
VALUES ('command_sticker_setup_pending', '')
ON CONFLICT (key) DO NOTHING;
