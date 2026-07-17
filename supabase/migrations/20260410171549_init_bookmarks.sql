CREATE TABLE bookmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id    text NOT NULL,
  url         text NOT NULL,
  title       text,
  thumbnail   text,
  tags        text[],
  summary     text,
  category    text,
  ai_status   text NOT NULL DEFAULT 'pending',  -- pending | done | failed
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX ON bookmarks (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Users can only view their own bookmarks" 
ON bookmarks FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bookmarks" 
ON bookmarks FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks" 
ON bookmarks FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks" 
ON bookmarks FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);
