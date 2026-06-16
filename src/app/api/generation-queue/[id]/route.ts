// /api/generation-queue/[id] - Update queue item status or retry
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const id = params.id;
    const body = await req.json();
    const { status, videoUrl, gifUrl, landingPageUrl, errorMessage } = body;

    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (videoUrl !== undefined) updates.video_url = videoUrl;
    if (gifUrl !== undefined) updates.gif_url = gifUrl;
    if (landingPageUrl !== undefined) updates.landing_page_url = landingPageUrl;
    if (errorMessage !== undefined) updates.error_message = errorMessage;

    if (status === 'processing') updates.started_at = new Date().toISOString();
    if (status === 'ready' || status === 'failed') updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('generation_queue')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update queue item' }, { status: 500 });
  }
}

// Retry: reset a failed queue item to 'queued'
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const id = params.id;

    const { data, error } = await supabase
      .from('generation_queue')
      .update({
        status: 'queued',
        error_message: null,
        completed_at: null,
        started_at: null,
      })
      .eq('id', id)
      .eq('status', 'failed')
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Queue item not found or not in failed status' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Retry queued' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to retry' }, { status: 500 });
  }
}
