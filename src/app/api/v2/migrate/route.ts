/**
 * POST /api/v2/migrate — One-shot Supabase migration for V2 columns
 * Delete this file after running it once.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Simple auth check
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET || 'migrate-local'}`;
  if (auth !== expected && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = `
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dynamic_gif_url TEXT,
  ADD COLUMN IF NOT EXISTS lp_url TEXT,
  ADD COLUMN IF NOT EXISTS v2_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE video_recordings
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id),
  ADD COLUMN IF NOT EXISTS landing_page_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_v2_status ON leads(v2_status);
`;

  // Supabase JS client v2 can execute raw SQL via .rpc with custom function
  // Since we don't have exec_sql, we try multiple approaches
  
  const errors: string[] = [];

  // Approach 1: Try to use the sql endpoint
  try {
    const { data, error } = await supabase.from('_sql').select('*').limit(1);
    // This will fail but we ignore it
  } catch {}

  // Approach 2: Use the underlying fetch to call the sql endpoint
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sql`;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      const result = await res.json();
      return NextResponse.json({ success: true, result });
    }
    errors.push(`/rest/v1/sql: ${res.status} ${await res.text()}`);
  } catch (e: any) {
    errors.push(`/rest/v1/sql error: ${e.message}`);
  }

  // Approach 3: Try management API
  try {
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '') || '';
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      return NextResponse.json({ success: true, method: 'mgmt-api', result: await res.json() });
    }
    errors.push(`mgmt-api: ${res.status} ${await res.text()}`);
  } catch (e: any) {
    errors.push(`mgmt-api error: ${e.message}`);
  }

  return NextResponse.json({
    success: false,
    errors,
    message: 'Could not run migration automatically. Please run in Supabase SQL Editor.',
    sql,
  }, { status: 500 });
}
