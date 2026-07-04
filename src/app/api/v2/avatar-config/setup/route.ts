/**
 * POST /api/v2/avatar-config/setup
 *
 * Accepts face image + voice sample + script template.
 * Parses template into segments and stores config for base video generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseScriptTemplate } from '@/lib/script-parser';

export async function POST(req: NextRequest) {
  try {
    const { faceImageUrl, voiceSampleUrl, scriptTemplate, userId = 'default_user' } = await req.json();

    if (!faceImageUrl) {
      return NextResponse.json({ error: 'faceImageUrl is required' }, { status: 400 });
    }
    if (!scriptTemplate || !scriptTemplate.trim()) {
      return NextResponse.json({ error: 'scriptTemplate is required' }, { status: 400 });
    }

    // Parse template into segments
    const parsed = parseScriptTemplate(scriptTemplate);

    // Upsert avatar_config
    const { data: existing } = await supabaseAdmin
      .from('avatar_config')
      .select('id')
      .eq('user_id', userId)
      .single();

    let avatarConfigId: string;

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('avatar_config')
        .update({
          face_video_url: faceImageUrl,
          voice_ref_url: voiceSampleUrl || null,
          script_template: scriptTemplate,
          parsed_segments: JSON.parse(JSON.stringify(parsed.segments)),
          base_video_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) throw new Error(`DB update failed: ${error.message}`);
      avatarConfigId = data.id;
    } else {
      const { data, error } = await supabaseAdmin
        .from('avatar_config')
        .insert({
          user_id: userId,
          face_video_url: faceImageUrl,
          voice_ref_url: voiceSampleUrl || null,
          script_template: scriptTemplate,
          parsed_segments: JSON.parse(JSON.stringify(parsed.segments)),
          base_video_status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw new Error(`DB insert failed: ${error.message}`);
      avatarConfigId = data.id;
    }

    return NextResponse.json({
      avatarConfigId,
      status: 'pending',
      parsedSegments: parsed.segments,
      variableNames: parsed.variableNames,
    });
  } catch (err: any) {
    console.error('[avatar-config/setup] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Setup failed' }, { status: 500 });
  }
}
