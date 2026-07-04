/**
 * GET /api/v2/batch-status?jobId=xxx
 *
 * Returns batch job progress: status, completed/total, per-lead results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }

  // Fetch batch job
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('batch_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Fetch per-lead items
  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('batch_job_items')
    .select('lead_id, status, clip_url, timed_segments, error, completed_at')
    .eq('batch_job_id', jobId)
    .order('completed_at', { ascending: true });

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    totalLeads: job.total_leads,
    completedLeads: job.completed_leads,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    items: items ?? [],
  });
}
