-- User-defined tags added manually at bookmark creation time
ALTER TABLE bookmarks ADD COLUMN user_tags TEXT[] NULL;
