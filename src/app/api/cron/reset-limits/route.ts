import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Resets daily sending counts for all inboxes.
 * Runs on a daily cron cycle (e.g. at 12:00 AM UTC).
 * Also sets daily_limit from settings table (default: 50).
 */
export const maxDuration = 300;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (token !== cronSecret && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized cron access' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Get default daily limit from settings
    let defaultDailyLimit = 50;
    const { data: settingData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'default_daily_limit')
      .single();

    if (settingData?.value) {
      defaultDailyLimit = parseInt(settingData.value, 10) || 50;
    }

    // Get all inboxes
    const { data: inboxes, error: inboxesError } = await supabase
      .from('inboxes')
      .select('id, email');

    if (inboxesError) {
      throw new Error(`Failed to fetch inboxes: ${inboxesError.message}`);
    }

    const totalCount = inboxes.length;
    let successCount = 0;

    // Update each inbox
    for (const inbox of inboxes) {
      const { error } = await supabase
        .from('inboxes')
        .update({ sent_today: 0, daily_limit: defaultDailyLimit })
        .eq('id', inbox.id);

      if (error) {
        console.error(`[CRON] Failed to reset limits for inbox ${inbox.id} (${inbox.email}):`, error.message);
      } else {
        console.log(`[CRON] Reset limits for inbox ${inbox.id} (${inbox.email}): sent_today=0, daily_limit=${defaultDailyLimit}`);
        successCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reset daily limits for ${successCount}/${totalCount} inboxes to sent_today=0, daily_limit=${defaultDailyLimit}`,
      successCount,
      totalCount,
      defaultDailyLimit,
    });
  } catch (err: any) {
    console.error('[CRON] Limits reset error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Reset failed' }, { status: 500 });
  }
}
