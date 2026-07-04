import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const emailId = searchParams.get('emailId');

  if (emailId) {
    try {
      // Get existing clicked_at
      const { data: record } = await supabaseAdmin
        .from('sent_emails')
        .select('clicked_at')
        .eq('id', emailId)
        .single();

      if (record && !record.clicked_at) {
        await supabaseAdmin
          .from('sent_emails')
          .update({ clicked_at: new Date().toISOString() })
          .eq('id', emailId);
      }
    } catch (err) {
      console.error('Click tracking error:', err);
    }
  }

  // Redirect to target URL or fallback
  if (targetUrl) {
    // SSRF/open redirect protection: only allow external HTTPS URLs
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'https:' && !parsed.hostname.includes('localhost')) {
        return NextResponse.redirect(targetUrl);
      }
    } catch {
      // Invalid URL, fall through to fallback
    }
  }

  // Default fallback URL if missing
  const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(fallbackUrl);
}
