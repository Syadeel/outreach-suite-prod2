-- Outreach Suite: Core PostgreSQL Database Schema

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Inboxes Table (The 5 Gmail accounts and their sending credentials)
CREATE TABLE IF NOT EXISTS inboxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_user TEXT NOT NULL,
    smtp_pass TEXT NOT NULL, -- encrypted or plain depending on security tier
    provider TEXT NOT NULL, -- 'zeptomail' or 'smtp2go'
    oauth_refresh_token TEXT, -- For reading replies via Gmail API
    oauth_access_token TEXT,
    oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'warmup', 'paused'
    daily_limit INTEGER NOT NULL DEFAULT 50, -- 50 for personal Gmail or Brevo/SMTP2GO limit
    sent_today INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Leads Table (Mini-CRM)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    website TEXT,
    tags TEXT[] DEFAULT '{}',
    stage TEXT NOT NULL DEFAULT 'new', -- 'new', 'contacted', 'replied', 'interested', 'unsubscribed', 'bounce'
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
    steps JSONB NOT NULL DEFAULT '[]', -- Array of steps: [{ step: 1, subject: "...", body: "...", delay_hours: 24 }]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Campaign Leads (Link table for campaigns and leads, tracking status per lead)
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sending', 'sent', 'replied', 'unsubscribed', 'bounce'
    current_step_index INTEGER NOT NULL DEFAULT 0,
    next_send_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(campaign_id, lead_id)
);

-- 6. Sent Emails (Log & Analytics)
CREATE TABLE IF NOT EXISTS sent_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    inbox_id UUID REFERENCES inboxes(id) ON DELETE SET NULL,
    message_id TEXT, -- Gmail Message ID for reply threading
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'bounced'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE
);

-- 7. Video Recordings (VideoSpark recordings & branding config)
CREATE TABLE IF NOT EXISTS video_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    video_url TEXT NOT NULL, -- Raw Cloudinary MP4
    gif_url TEXT NOT NULL, -- Cloudinary transform GIF
    brand_logo_url TEXT,
    brand_color TEXT DEFAULT '#4F46E5', -- Primary purple
    cta_text TEXT,
    cta_url TEXT,
    calendar_embed_code TEXT, -- Calendly/Cal.com widget code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Video Views (VideoSpark engagement logs)
CREATE TABLE IF NOT EXISTS video_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID REFERENCES video_recordings(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    ip_address TEXT,
    watch_percentage INTEGER DEFAULT 0,
    cta_clicked BOOLEAN DEFAULT FALSE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Useful Indexes
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_send ON campaign_leads(next_send_time) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sent_emails_message_id ON sent_emails(message_id);

-- Trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_leads_modtime ON leads;
CREATE TRIGGER update_leads_modtime BEFORE UPDATE ON leads FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS update_campaigns_modtime ON campaigns;
CREATE TRIGGER update_campaigns_modtime BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 9. Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
