-- The schema applier re-runs every file. Only rebuild `words` when it still
-- has the first Neon shape (bigint id). After that this is a no-op, so a
-- later data copy from Aiven is left in place.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'id'
      AND data_type = 'bigint'
  ) THEN
    DROP TABLE words;
    CREATE TABLE words (
      id SERIAL PRIMARY KEY,
      word VARCHAR(250) NOT NULL,
      definition VARCHAR(500) NOT NULL,
      pronounciation_region VARCHAR(50),
      pronounciation VARCHAR(250),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;
