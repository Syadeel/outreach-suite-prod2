import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Triggers the automated campaign sending queue.
 * Runs on a cron cycle (e.g., via n8n HTTP trigger or Vercel Cron).
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Simple secret token check to prevent unauthorized public trigger
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const cronSecret = process.env.SUPABASE_SERVICE_ROLE_KEY; // reuse service key or set custom CRON_SECRET

    if (token !== cronSecret && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized cron access' }, { status: 401 });
    }

    // 1. Fetch pending campaign leads whose send time has arrived
    // Filters: status is 'pending', next_send_time <= now, and campaign status is 'active'
    const now = new Date().toISOString();
    
    const { data: pendingSends, error } = await supabaseAdmin
      .from('campaign_leads')
      .select(`
        id,
        campaign_id,
        campaign:campaigns(status)
      `)
      .eq('status', 'pending')
      .lte('next_send_time', now)
      .limit(5);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter to only include sends where the parent campaign is active/running
    const activePendingSends = pendingSends.filter(
      (item: any) => item.campaign?.status === 'active'
    );

    if (activePendingSends.length === 0) {
      return NextResponse.json({ status: 'success', sentCount: 0, message: 'No active emails in queue to send' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let successCount = 0;
    const errors: any[] = [];

    // 2. Dispatch sending logic for each matched lead
    for (const item of activePendingSends) {
      try {
        const sendRes = await fetch(`${appUrl}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignLeadId: item.id })
        });
        
        const resData = await sendRes.json();
        
        if (sendRes.ok && resData.status === 'success') {
          successCount++;
        } else {
          errors.push({ id: item.id, error: resData.error || 'Failed to dispatch send' });
        }
      } catch (err: any) {
        errors.push({ id: item.id, error: err.message });
      }
    }

    return NextResponse.json({
      status: 'success',
      sentCount: successCount,
      errorsCount: errors.length,
      details: errors
    });
  } catch (err: any) {
    console.error('Cron dispatcher error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
