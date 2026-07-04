/**
 * POST /api/v2/avatar-config/generate-base
 *
 * Generates a base video from face image + voice sample + script template.
 * Uses DashScope CosyVoice for TTS and wan2.2-s2v for lip-sync.
 *
 * Body: { avatarConfigId } or { userId }
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTTS, generateLipSyncVideo, uploadBufferToStorage, downloadBufferFromUrl } from '@/lib/dashscope';
import { parseScriptTemplate, estimateSpeechDurationSeconds } from '@/lib/script-parser';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { avatarConfigId, userId = 'default_user' } = body;

    // Fetch avatar config
    let config: any = null;

    if (avatarConfigId) {
      const { data, error } = await supabaseAdmin
        .from('avatar_config')
        .select('*')
        .eq('id', avatarConfigId)
        .single();
      if (error || !data) throw new Error('Avatar config not found');
      config = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('avatar_config')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error || !data) throw new Error('Avatar config not found for user');
      config = data;
    }

    const faceImageUrl = config.face_video_url;
    const voiceRefUrl = config.voice_ref_url;
    const scriptTemplate = config.script_template;

    if (!faceImageUrl) throw new Error('No face image configured');
    if (!scriptTemplate) throw new Error('No script template configured');

    // Update status to processing
    await supabaseAdmin
      .from('avatar_config')
      .update({ base_video_status: 'processing' })
      .eq('id', config.id);

    console.log(`[generate-base] Starting for config ${config.id}`);

    // Parse template
    const parsed = parseScriptTemplate(scriptTemplate);

    // Generate TTS for static segments only (skip variables — they'll be empty/silent)
    const staticTexts: string[] = [];
    for (const seg of parsed.segments) {
      if (seg.type === 'static' && seg.text) {
        staticTexts.push(seg.text.trim());
      } else if (seg.type === 'variable') {
        // Insert a short pause placeholder for variable segments
        staticTexts.push('...');
      }
    }

    const fullStaticText = staticTexts.join('. ');
    console.log(`[generate-base] Generating TTS for static script (${fullStaticText.length} chars)...`);

    // Step 1: Generate TTS audio for the full script (static parts)
    const ttsResult = await generateTTS({
      text: fullStaticText,
      referenceAudioUrl: voiceRefUrl || undefined,
    });

    console.log(`[generate-base] TTS generated: ${(ttsResult.audioBuffer.byteLength / 1024).toFixed(0)} KB`);

    // Upload TTS audio to storage
    const audioFileName = `base-audio/${crypto.randomUUID()}.wav`;
    const audioUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: audioFileName,
      buffer: Buffer.from(ttsResult.audioBuffer),
      contentType: 'audio/wav',
    });

    console.log(`[generate-base] Audio uploaded: ${audioUrl}`);

    // Step 2: Generate base video via lip-sync
    console.log(`[generate-base] Generating lip-sync video...`);
    const videoResult = await generateLipSyncVideo({
      audioUrl,
      imageUrl: faceImageUrl,
      resolution: '480P',
    });

    console.log(`[generate-base] Video generated: ${videoResult.videoUrl}`);

    // Download and re-upload to our storage
    const videoBuffer = await downloadBufferFromUrl(videoResult.videoUrl);
    const videoFileName = `base-videos/${crypto.randomUUID()}.mp4`;
    const finalVideoUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: videoFileName,
      buffer: videoBuffer,
      contentType: 'video/mp4',
    });

    console.log(`[generate-base] Video uploaded: ${finalVideoUrl}`);

    // Estimate variable timing (approximate based on word count)
    const variableTiming = parsed.segments
      .filter((s) => s.type === 'variable')
      .map((s) => {
        // Rough estimate: variables are ~1-2 seconds each
        const estimatedDuration = 1.5;
        return {
          placeholder: s.placeholder,
          index: s.index,
          durationSec: estimatedDuration,
        };
      });

    // Update config with results
    await supabaseAdmin
      .from('avatar_config')
      .update({
        base_video_url: finalVideoUrl,
        base_video_status: 'done',
        variable_timing: JSON.parse(JSON.stringify(variableTiming)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[generate-base] Done in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      baseVideoUrl: finalVideoUrl,
      variableTiming,
      audioUrl,
      duration: parseFloat(elapsed),
    });
  } catch (err: any) {
    console.error('[generate-base] Error:', err.message || err);

    // Try to update status to failed
    try {
      const body = await req.clone().json().catch(() => ({}));
      const configId = body.avatarConfigId;
      const userId = body.userId || 'default_user';
      if (configId) {
        await supabaseAdmin.from('avatar_config').update({ base_video_status: 'failed' }).eq('id', configId);
      } else {
        await supabaseAdmin.from('avatar_config').update({ base_video_status: 'failed' }).eq('user_id', userId);
      }
    } catch {}

    return NextResponse.json({ error: err.message || 'Base video generation failed' }, { status: 500 });
  }
}
