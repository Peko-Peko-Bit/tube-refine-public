-- Add columns the app depends on that were previously created ad hoc on the
-- remote database. Idempotent (IF NOT EXISTS) so it is a no-op where they exist.
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS tags_en          text[],
  ADD COLUMN IF NOT EXISTS tags_ai          text[],
  ADD COLUMN IF NOT EXISTS channel_name     text,
  ADD COLUMN IF NOT EXISTS published_at     timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS rating           integer,  -- 0-100; UI renders rating/20 as 5 stars
  ADD COLUMN IF NOT EXISTS is_trashed       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bookmarks_user_id_is_trashed_idx
  ON bookmarks (user_id, is_trashed);
