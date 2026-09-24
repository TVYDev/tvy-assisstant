-- Cambridge Dictionary word of the day.
-- Column types match the existing Aiven `words` table.

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(250) NOT NULL,
  definition VARCHAR(500) NOT NULL,
  pronounciation_region VARCHAR(50),
  pronounciation VARCHAR(250),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
