/**
 * VK Generate API — triggers VK generation from VideoTab.
 * This avoids importing Node.js modules (fs, child_process) in a client component.
 * 
 * Timeout extended to 600s (10 min) since voice cloning + lip-sync takes 1-5 min.
 */

export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, company, leadId, voiceSample, templateVideo } = body;

    if (!firstName || !company) {
      return NextResponse.json({ error: 'firstName and company are required' }, { status: 400 });
    }

    const { generateVideoForLead } = await import('@/lib/voicekit-connector');
    const result = await generateVideoForLead({
      firstName,
      company,
      leadId,
      voiceSample: voiceSample || '',
      templateVideo: templateVideo || undefined,
    });

    return NextResponse.json({ videoUrl: result.videoUrl, gifUrl: result.gifUrl, duration: result.duration });
  } catch (err: any) {
    console.error('VK generate API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
