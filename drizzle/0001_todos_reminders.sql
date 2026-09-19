-- Owner-only todo lists, todos, reminders, and the Fit-style add wizard.

CREATE TABLE IF NOT EXISTS todo_lists (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT todo_lists_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS todos (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES todo_lists(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  due_at TIMESTAMPTZ,
  reminder_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_list_id_done
  ON todos (list_id, done);

CREATE INDEX IF NOT EXISTS idx_todos_due_at
  ON todos (due_at);

CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  recurrence TEXT CHECK (
    recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'weekdays')
  ),
  target_chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'cancelled')
  ),
  todo_id BIGINT REFERENCES todos(id) ON DELETE SET NULL,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_remind_at
  ON reminders (status, remind_at);

CREATE TABLE IF NOT EXISTS task_wizard_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('todo', 'reminder')),
  step TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_wizard_sessions_expires_at
  ON task_wizard_sessions (expires_at);

DROP TRIGGER IF EXISTS trg_todo_lists_updated_at ON todo_lists;
CREATE TRIGGER trg_todo_lists_updated_at
  BEFORE UPDATE ON todo_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_todos_updated_at ON todos;
CREATE TRIGGER trg_todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reminders_updated_at ON reminders;
CREATE TRIGGER trg_reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_task_wizard_sessions_updated_at ON task_wizard_sessions;
CREATE TRIGGER trg_task_wizard_sessions_updated_at
  BEFORE UPDATE ON task_wizard_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO todo_lists (slug, title)
VALUES ('inbox', 'Inbox')
ON CONFLICT (slug) DO NOTHING;
