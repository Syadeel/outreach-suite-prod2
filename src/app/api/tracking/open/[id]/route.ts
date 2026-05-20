import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Transparent 1x1 pixel GIF base64 string
const TRANSPARENT_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const emailId = params.id;

    if (emailId) {
      // Get the email status to verify if it has already been opened
      const { data: emailRecord } = await supabaseAdmin
        .from('sent_emails')
        .select('opened_at')
        .eq('id', emailId)
        .single();

      // Only update if opened_at is not already recorded to avoid resetting the timestamp
      if (emailRecord && !emailRecord.opened_at) {
        await supabaseAdmin
          .from('sent_emails')
          .update({ opened_at: new Date().toISOString() })
          .eq('id', emailId);
      }
    }
  } catch (err) {
    console.error('Tracking pixel open error:', err);
  }

  // Always return the transparent 1x1 GIF
  return new NextResponse(TRANSPARENT_PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
