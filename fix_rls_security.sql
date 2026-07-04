-- ============================================
-- FIX RLS SECURITY — Enable Row-Level Security on ALL public tables
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wxxjiehgcjrmkbatkvsu/sql
-- ============================================

-- ============================================
-- STEP 1: Enable RLS on ALL tables
-- ============================================

-- Core tables (schema.sql)
ALTER TABLE IF EXISTS inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS video_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_templates ENABLE ROW LEVEL SECURITY;

-- Avatar tables
ALTER TABLE IF EXISTS avatar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS avatar_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS generation_queue ENABLE ROW LEVEL SECURITY;

-- Batch processing tables
ALTER TABLE IF EXISTS batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS batch_job_items ENABLE ROW LEVEL SECURITY;

-- Settings table
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;

-- Landing page templates
ALTER TABLE IF EXISTS landing_page_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop ALL existing policies (clean slate)
-- ============================================

-- leads
DROP POLICY IF EXISTS "Service role full access" ON leads;
DROP POLICY IF EXISTS "Anon can read leads for landing" ON leads;
DROP POLICY IF EXISTS "Allow all access" ON leads;

-- sent_emails
DROP POLICY IF EXISTS "Service role full access" ON sent_emails;
DROP POLICY IF EXISTS "Allow all access" ON sent_emails;

-- campaigns
DROP POLICY IF EXISTS "Service role full access" ON campaigns;
DROP POLICY IF EXISTS "Allow all access" ON campaigns;

-- campaign_leads
DROP POLICY IF EXISTS "Service role full access" ON campaign_leads;
DROP POLICY IF EXISTS "Allow all access" ON campaign_leads;

-- video_recordings
DROP POLICY IF EXISTS "Service role full access" ON video_recordings;
DROP POLICY IF EXISTS "Anon can read recordings" ON video_recordings;
DROP POLICY IF EXISTS "Allow all access" ON video_recordings;

-- video_views
DROP POLICY IF EXISTS "Service role full access" ON video_views;
DROP POLICY IF EXISTS "Allow all access" ON video_views;

-- email_templates
DROP POLICY IF EXISTS "Service role full access" ON email_templates;
DROP POLICY IF EXISTS "Anon can read templates" ON email_templates;
DROP POLICY IF EXISTS "Allow all access" ON email_templates;

-- inboxes
DROP POLICY IF EXISTS "Service role full access" ON inboxes;
DROP POLICY IF EXISTS "Allow all access" ON inboxes;

-- batch_jobs
DROP POLICY IF EXISTS "Service role full access" ON batch_jobs;
DROP POLICY IF EXISTS "Allow all access" ON batch_jobs;

-- batch_job_items
DROP POLICY IF EXISTS "Service role full access" ON batch_job_items;
DROP POLICY IF EXISTS "Allow all access" ON batch_job_items;

-- avatar_config
DROP POLICY IF EXISTS "Allow all access" ON avatar_config;

-- avatar_library
DROP POLICY IF EXISTS "Allow all on avatar_library" ON avatar_library;

-- generation_queue
DROP POLICY IF EXISTS "Allow all on generation_queue" ON generation_queue;

-- settings
DROP POLICY IF EXISTS "Service role full access" ON settings;
DROP POLICY IF EXISTS "Allow all access" ON settings;

-- landing_page_templates
DROP POLICY IF EXISTS "Service role full access" ON landing_page_templates;
DROP POLICY IF EXISTS "Anon can read landing templates" ON landing_page_templates;
DROP POLICY IF EXISTS "Allow all access" ON landing_page_templates;

-- ============================================
-- STEP 3: Create CORRECT policies
-- Service role = full access (bypasses RLS anyway)
-- Anon = read-only where needed for public pages
-- ============================================

-- LEADS: Service role full, anon read for landing pages
CREATE POLICY "leads_service_role_all" ON leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "leads_anon_select" ON leads
  FOR SELECT TO anon USING (true);

-- SENT_EMAILS: Service role only (sensitive)
CREATE POLICY "sent_emails_service_role_all" ON sent_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CAMPAIGNS: Service role only
CREATE POLICY "campaigns_service_role_all" ON campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CAMPAIGN_LEADS: Service role only
CREATE POLICY "campaign_leads_service_role_all" ON campaign_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- VIDEO_RECORDINGS: Service role full, anon read for landing pages
CREATE POLICY "video_recordings_service_role_all" ON video_recordings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "video_recordings_anon_select" ON video_recordings
  FOR SELECT TO anon USING (true);

-- VIDEO_VIEWS: Service role full, anon insert (tracking)
CREATE POLICY "video_views_service_role_all" ON video_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "video_views_anon_insert" ON video_views
  FOR INSERT TO anon WITH CHECK (true);

-- INBOXES: Service role only (highly sensitive - SMTP credentials)
CREATE POLICY "inboxes_service_role_all" ON inboxes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- EMAIL_TEMPLATES: Service role full, anon read
CREATE POLICY "email_templates_service_role_all" ON email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "email_templates_anon_select" ON email_templates
  FOR SELECT TO anon USING (true);

-- BATCH_JOBS: Service role only
CREATE POLICY "batch_jobs_service_role_all" ON batch_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BATCH_JOB_ITEMS: Service role only
CREATE POLICY "batch_job_items_service_role_all" ON batch_job_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AVATAR_CONFIG: Service role full, anon read
CREATE POLICY "avatar_config_service_role_all" ON avatar_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "avatar_config_anon_select" ON avatar_config
  FOR SELECT TO anon USING (true);

-- AVATAR_LIBRARY: Service role only
CREATE POLICY "avatar_library_service_role_all" ON avatar_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- GENERATION_QUEUE: Service role only
CREATE POLICY "generation_queue_service_role_all" ON generation_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SETTINGS: Service role only (contains passwords)
CREATE POLICY "settings_service_role_all" ON settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- LANDING_PAGE_TEMPLATES: Service role full, anon read
CREATE POLICY "landing_page_templates_service_role_all" ON landing_page_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "landing_page_templates_anon_select" ON landing_page_templates
  FOR SELECT TO anon USING (true);

-- ============================================
-- STEP 4: Verify RLS is enabled on all tables
-- ============================================

SELECT 
  schemaname, 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
