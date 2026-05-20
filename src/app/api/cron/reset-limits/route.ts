import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Resets the daily sending counts for all active inboxes back to 0.
 * Runs on a daily cron cycle (e.g. at 12:00 AM UTC).
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const cronSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (token !== cronSecret && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized cron access' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('inboxes')
      .update({ sent_today: 0 });

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: 'success', message: 'Daily sending limits reset to 0' });
  } catch (err: any) {
    console.error('Limits reset error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
