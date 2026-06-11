-- Avatar Configuration Storage
-- Persists avatar voice/face URLs to DB instead of only localStorage

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS avatar_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default_user',
  voice_ref_url TEXT,
  face_video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO avatar_config (user_id)
VALUES ('default_user')
ON CONFLICT (user_id) DO NOTHING;

-- Unique index on user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_config_user ON avatar_config(user_id);

-- Enable RLS (Row Level Security) and allow open access for now
ALTER TABLE avatar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow all access" ON avatar_config
FOR ALL USING (true);
