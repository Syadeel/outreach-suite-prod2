-- Migration: Create batch processing tables
-- Run this in Supabase SQL Editor or via the migration script

-- 1. Batch jobs table
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  total_leads INTEGER NOT NULL,
  completed_leads INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  error TEXT
);

-- 2. Batch job items (per-lead results)
CREATE TABLE IF NOT EXISTS batch_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id UUID NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  clip_url TEXT,
  timed_segments JSONB,
  error TEXT,
  completed_at TIMESTAMPTZ
);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_batch_job_items_batch_id ON batch_job_items(batch_job_id);
CREATE INDEX IF NOT EXISTS idx_batch_job_items_lead_id ON batch_job_items(lead_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);

-- 4. Add base_video_url to avatar_config if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'avatar_config' AND column_name = 'base_video_url'
  ) THEN
    ALTER TABLE avatar_config ADD COLUMN base_video_url TEXT;
  END IF;
END $$;

-- 5. Add timed_segments support to leads if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'v2_clip_url'
  ) THEN
    ALTER TABLE leads ADD COLUMN v2_clip_url TEXT;
  END IF;
END $$;
