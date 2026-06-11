-- V2 Migration: Complete schema for V2 AI Avatar pipeline + template system
-- Run this in Supabase SQL Editor AFTER the existing supabase_v2_migration.sql

-- 1. Add columns to leads table for V2 avatar pipeline
-- (some may already exist from supabase_v2_migration.sql — IF NOT EXISTS handles it)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_gif_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalized_landing_page_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v2_avatar_voice_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v2_avatar_face_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v2_video_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v2_generated_at TIMESTAMP WITH TIME ZONE;

-- Ensure v2_status exists (previous migration had DEFAULT 'pending', this is fine)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v2_status TEXT DEFAULT 'none';

-- Note: existing columns from previous V2 migration that are still used:
--   leads.dynamic_gif_url  → maps to old system (kept for backward compat)
--   leads.lp_url           → maps to old system (kept for backward compat)
--   leads.video_url        → maps to old system (kept for backward compat)

-- 2. Create landing_page_templates table for editable sections
CREATE TABLE IF NOT EXISTS landing_page_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    
    -- Branding
    brand_title TEXT DEFAULT 'Capital Acquisition',
    brand_logo_url TEXT,
    brand_color TEXT DEFAULT '#4F46E5',
    
    -- Badge section
    badge_text TEXT DEFAULT 'Personalized Video Walkthrough',
    
    -- Hero section
    hero_heading TEXT DEFAULT 'Hey {{first_name}} 👋',
    hero_subheading TEXT DEFAULT 'Tailored for {{company}}',
    hero_body TEXT DEFAULT 'I put together this personalized video for you and the team at {{company}}. I think you&apos;ll find the first 30 seconds especially relevant.',
    
    -- CTA section
    cta_text TEXT DEFAULT 'Book a 15-Min Call',
    cta_url TEXT,
    cta_description TEXT DEFAULT 'If our acquisition solutions make sense for you, schedule a quick discovery call below:',
    
    -- Calendar section
    calendar_embed_code TEXT,
    calendar_heading TEXT DEFAULT 'Schedule a time to chat',
    
    -- Social proof section
    social_proof_heading TEXT DEFAULT 'Trusted by growth teams everywhere',
    social_proof_logos TEXT[] DEFAULT ARRAY['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'],
    
    -- Why this matters section
    why_matters_heading TEXT DEFAULT 'This isn&apos;t a generic pitch, {{first_name}}.',
    why_matters_subheading TEXT DEFAULT 'It was built specifically for what you&apos;re building at {{company}}.',
    why_matters_body TEXT DEFAULT 'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.',
    
    -- Footer
    footer_text TEXT DEFAULT '© {{year}} {{brand_title}}. All rights reserved.',
    footer_powered_by TEXT DEFAULT 'Powered by {{brand_title}}',
    
    -- Custom CSS (optional)
    custom_css TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Insert default template
INSERT INTO landing_page_templates (
    name, is_default, brand_title, brand_color, badge_text,
    hero_heading, hero_subheading, hero_body,
    cta_text, cta_description,
    social_proof_heading, social_proof_logos,
    why_matters_heading, why_matters_subheading, why_matters_body,
    calendar_heading
) VALUES (
    'Default Dark Theme', true, 'Capital Acquisition', '#4F46E5',
    'Personalized Video Walkthrough',
    'Hey {{first_name}} 👋',
    'Tailored for {{company}}',
    'I put together this personalized video for you and the team at {{company}}. I think you&apos;ll find the first 30 seconds especially relevant.',
    'Book a 15-Min Call',
    'If our acquisition solutions make sense for you, schedule a quick discovery call below:',
    'Trusted by growth teams everywhere',
    ARRAY['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'],
    'This isn&apos;t a generic pitch, {{first_name}}.',
    'It was built specifically for what you&apos;re building at {{company}}.',
    'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.',
    'Schedule a time to chat'
) ON CONFLICT DO NOTHING;

-- 4. Update video_recordings with template support + V2 columns
-- (lead_id and landing_page_url may already exist from supabase_v2_migration.sql)
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS landing_page_url TEXT;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS landing_page_template_id UUID REFERENCES landing_page_templates(id) ON DELETE SET NULL;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS brand_title TEXT;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS brand_subtitle TEXT;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS cta_description TEXT;
ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 5. Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_leads_v2_status ON leads(v2_status);
CREATE INDEX IF NOT EXISTS idx_leads_v2_generated ON leads(v2_generated_at);
