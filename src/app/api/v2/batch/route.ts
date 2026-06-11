/**
 * V2 Batch API — Process multiple leads through V2 pipeline
 * POST /api/v2/batch { leadIds: string[] }
 */
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

async function processSingleLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v2/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error || 'HTTP ' + res.status };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { leadIds } = await req.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array required' }, { status: 400 });
    }

    // Mark all as processing
    await supabase.from('leads').update({ v2_status: 'processing' }).in('id', leadIds);

    let completed = 0;
    let failed = 0;
    const results: any[] = [];

    for (const leadId of leadIds) {
      const result = await processSingleLead(leadId);
      results.push({ leadId, ...result });
      if (result.success) completed++;
      else failed++;
    }

    return NextResponse.json({ total: leadIds.length, completed, failed, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
