/**
 * V2 Cron Dispatch — Daily batch processor for pending leads
 * GET /api/v2/cron-dispatch
 * Processes up to 10 pending leads per run
 */
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  // Auth: same pattern as existing cron routes
  const auth = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');
  const CRON_TOKEN = process.env.CRON_AUTH_TOKEN;
  if (CRON_TOKEN && !auth?.includes(CRON_TOKEN) && apiKey !== CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get up to 10 pending leads
    const { data: leads, error: fetchErr } = await supabase
      .from('leads')
      .select('id, first_name, last_name, company')
      .eq('v2_status', 'pending')
      .limit(10);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No pending leads', processed: 0 });
    }

    // Process each lead sequentially
    const results = [];
    for (const lead of leads) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v2/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: lead.id }),
          }
        );
        const data = await res.json();
        results.push({ leadId: lead.id, success: res.ok, ...data });
      } catch (err: any) {
        results.push({ leadId: lead.id, success: false, error: err.message });
        await supabase.from('leads').update({ v2_status: 'failed' }).eq('id', lead.id);
      }
    }

    return NextResponse.json({ processed: leads.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
