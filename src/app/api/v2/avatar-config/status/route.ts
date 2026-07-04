/**
 * GET /api/v2/avatar-config/status?userId=default_user
 *
 * Returns current avatar config status including base video info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default_user';

    const { data, error } = await supabaseAdmin
      .from('avatar_config')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          status: 'not_configured',
          baseVideoUrl: null,
          baseVideoStatus: null,
          voiceRefUrl: null,
          faceImageUrl: null,
          scriptTemplate: null,
          variableTiming: null,
        });
      }
      throw new Error(`DB query failed: ${error.message}`);
    }

    return NextResponse.json({
      status: data.base_video_status || 'not_configured',
      baseVideoUrl: data.base_video_url || null,
      baseVideoStatus: data.base_video_status || null,
      voiceRefUrl: data.voice_ref_url || null,
      faceImageUrl: data.face_video_url || null,
      scriptTemplate: data.script_template || null,
      parsedSegments: data.parsed_segments || null,
      variableTiming: data.variable_timing || null,
      updatedAt: data.updated_at || null,
    });
  } catch (err: any) {
    console.error('[avatar-config/status] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
