-- schema_avatar_library.sql
-- Multi-avatar library: save/manage multiple voice+face combos
-- Run this in Supabase SQL Editor

-- 1. Avatar library table
CREATE TABLE IF NOT EXISTS avatar_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default_user',
  name TEXT NOT NULL,
  voice_ref_url TEXT NOT NULL,
  face_video_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_avatar_library_user ON avatar_library(user_id);

-- Enable RLS
ALTER TABLE avatar_library ENABLE ROW LEVEL SECURITY;

-- RLS policy (allow all for now since we use service role)
DROP POLICY IF EXISTS "Allow all on avatar_library" ON avatar_library;
CREATE POLICY "Allow all on avatar_library" ON avatar_library
  FOR ALL USING (true);

-- 2. Generation queue table
CREATE TABLE IF NOT EXISTS generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  script_text TEXT,
  face_video_url TEXT,
  voice_ref_url TEXT,
  video_url TEXT,
  gif_url TEXT,
  landing_page_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index for fast queue lookups
CREATE INDEX IF NOT EXISTS idx_generation_queue_status ON generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_generation_queue_lead ON generation_queue(lead_id);

-- Enable RLS
ALTER TABLE generation_queue ENABLE ROW LEVEL SECURITY;

-- RLS policy
DROP POLICY IF EXISTS "Allow all on generation_queue" ON generation_queue;
CREATE POLICY "Allow all on generation_queue" ON generation_queue
  FOR ALL USING (true);

-- 3. Migrate existing avatar_config data to avatar_library if any
INSERT INTO avatar_library (user_id, name, voice_ref_url, face_video_url, is_active)
SELECT 
  COALESCE(user_id, 'default_user'),
  'Default Avatar',
  voice_ref_url,
  face_video_url,
  true
FROM avatar_config
WHERE voice_ref_url IS NOT NULL AND face_video_url IS NOT NULL
ON CONFLICT DO NOTHING;
