// /api/generation-queue - Manage V2 generation queue
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(req.url);
    const stats = searchParams.get('stats');

    if (stats === 'true') {
      // Queue stats
      const { data, error } = await supabase
        .from('generation_queue')
        .select('status');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const counts = { queued: 0, processing: 0, ready: 0, failed: 0, total: 0 };
      (data || []).forEach((item: any) => {
        counts.total++;
        if (counts.hasOwnProperty(item.status)) counts[item.status as keyof typeof counts]++;
      });

      return NextResponse.json(counts);
    }

    // Full queue list
    const { data, error } = await supabase
      .from('generation_queue')
      .select(`
        id,
        lead_id,
        status,
        script_text,
        video_url,
        gif_url,
        landing_page_url,
        error_message,
        created_at,
        completed_at,
        lead:leads(first_name, last_name, company, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to camelCase
    const mapped = (data || []).map((q: any) => ({
      id: q.id,
      leadId: q.lead_id,
      status: q.status,
      scriptText: q.script_text,
      videoUrl: q.video_url,
      gifUrl: q.gif_url,
      landingPageUrl: q.landing_page_url,
      errorMessage: q.error_message,
      createdAt: q.created_at,
      completedAt: q.completed_at,
      lead: q.lead ? {
        firstName: q.lead.first_name,
        lastName: q.lead.last_name,
        company: q.lead.company,
        email: q.lead.email,
      } : null,
    }));

    return NextResponse.json(mapped);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch queue' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await req.json();
    const { leadIds, scriptText, faceVideoUrl, voiceRefUrl } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 });
    }

    // Check for existing active queue entries
    const { data: existing } = await supabase
      .from('generation_queue')
      .select('lead_id')
      .in('lead_id', leadIds)
      .in('status', ['queued', 'processing']);

    const activeIds = new Set((existing || []).map((e: any) => e.lead_id));
    const toQueue = leadIds.filter((id: string) => !activeIds.has(id));

    if (toQueue.length === 0) {
      return NextResponse.json({ count: 0, message: 'All leads already in queue' });
    }

    const entries = toQueue.map((leadId: string) => ({
      lead_id: leadId,
      status: 'queued',
      script_text: scriptText || null,
      face_video_url: faceVideoUrl || null,
      voice_ref_url: voiceRefUrl || null,
    }));

    const { error: insertErr } = await supabase
      .from('generation_queue')
      .insert(entries);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ count: toQueue.length, message: `Queued ${toQueue.length} leads` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to add to queue' }, { status: 500 });
  }
}
