-- UK pronunciation MP3 from the Cambridge word-of-the-day block.
-- Nullable so rows copied from Aiven stay valid.

ALTER TABLE words
  ADD COLUMN IF NOT EXISTS pronounciation_audio BYTEA;
