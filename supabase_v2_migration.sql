ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dynamic_gif_url TEXT,
  ADD COLUMN IF NOT EXISTS lp_url TEXT,
  ADD COLUMN IF NOT EXISTS v2_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE video_recordings
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id),
  ADD COLUMN IF NOT EXISTS landing_page_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_v2_status ON leads(v2_status);
