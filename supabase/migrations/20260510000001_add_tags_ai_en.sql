-- Add English-translated version of AI-generated tags (parallel to tags_en for YouTube tags)
ALTER TABLE bookmarks ADD COLUMN tags_ai_en TEXT[] NULL;
