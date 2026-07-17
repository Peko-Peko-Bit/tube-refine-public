-- Rename summary to description_summary (was: AI-generated summary of the description text)
ALTER TABLE bookmarks RENAME COLUMN summary TO description_summary;

-- Add video_summary column for user-triggered Gemini video summaries
ALTER TABLE bookmarks ADD COLUMN video_summary TEXT NULL;
