/**
 * POST /api/v2/personalize
 *
 * SendR-style personalized video generation.
 *
 * NEW behavior (v2):
 * - Generates SHORT audio clips for each variable segment ({{first_name}}, {{company}})
 * - Generates lip-synced video clips for each
 * - Returns base video URL + clip URLs + timestamps
 * - Client-side ffmpeg.wasm splices clips into base video (zero server cost)
 *
 * LEGACY behavior (fallback):
 * - If clips mode is disabled, falls back to full video generation
 *
 * Body: { leadId, firstName, company, mode?: 'clips' | 'full' }
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  generateTTS,
  submitLipSyncJob,
  pollLipSyncResult,
  generateLipSyncVideo,
  uploadBufferToStorage,
  downloadBufferFromUrl,
} from '@/lib/dashscope';
import {
  resolveScriptTemplate,
  parseScriptWithTimestamps,
  estimateSpeechDurationSeconds,
  type TimedSegment,
} from '@/lib/script-parser';
import crypto from 'crypto';

interface PersonalizeBody {
  leadId: string;
  firstName?: string;
  company?: string;
  userId?: string;
  mode?: 'clips' | 'full';  // default: 'clips'
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let leadId = '';

  try {
    const body = (await req.json()) as PersonalizeBody;
    leadId = body.leadId;
    const firstName = body.firstName || 'there';
    const company = body.company || 'your company';
    const userId = body.userId || 'default_user';
    const mode = body.mode || 'clips';

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    // 1. Fetch lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await supabaseAdmin.from('leads').update({ v2_status: 'processing' }).eq('id', leadId);

    // 2. Load avatar config
    const { data: config } = await supabaseAdmin
      .from('avatar_config')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!config) {
      throw new Error('No avatar configured. Set up your avatar in Avatar Studio first.');
    }

    const faceImageUrl = config.face_video_url;
    const voiceRefUrl = config.voice_ref_url;
    const baseVideoUrl = config.base_video_url;
    const scriptTemplate =
      config.script_template ||
      "Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach.";

    if (!faceImageUrl) throw new Error('No face image configured');

    // 3. Resolve template with lead data
    const resolvedScript = resolveScriptTemplate(scriptTemplate, {
      first_name: firstName,
      company: company,
      last_name: lead.last_name || '',
      email: lead.email || '',
    });

    // Estimate total duration from script
    const totalDuration = estimateSpeechDurationSeconds(resolvedScript);

    // Parse script to get variable segments with timestamps
    const timedSegments = parseScriptWithTimestamps(scriptTemplate, totalDuration);
    const variableSegments = timedSegments.filter((s) => s.type === 'variable');

    console.log(
      `[personalize] Generating for lead ${leadId} — mode: ${mode}, ` +
      `${variableSegments.length} variable segments, ~${totalDuration.toFixed(1)}s`
    );

    if (mode === 'clips' && baseVideoUrl && variableSegments.length > 0) {
      // ===== CLIPS MODE (SendR-style) =====
      // Generate short audio + video clips for each variable segment
      const clips = [];

      for (const seg of variableSegments) {
        const placeholder = seg.placeholder!;
        const value =
          placeholder === 'first_name'
            ? firstName
            : placeholder === 'company'
            ? company
            : (lead as any)[placeholder] || `[${placeholder}]`;

        // Skip if value is empty or placeholder
        if (!value || value.startsWith('[')) continue;

        // Generate TTS for this short segment
        const segmentText = value;
        const ttsResult = await generateTTS({
          text: segmentText,
          referenceAudioUrl: voiceRefUrl || undefined,
        });

        // Upload audio clip
        const audioPath = `clips/${leadId}/${crypto.randomUUID()}.wav`;
        const audioUrl = await uploadBufferToStorage({
          bucket: 'videos',
          path: audioPath,
          buffer: Buffer.from(ttsResult.audioBuffer),
          contentType: 'audio/wav',
        });

        // Generate lip-sync video clip
        const lipSyncResult = await submitLipSyncJob({
          audioUrl,
          imageUrl: faceImageUrl,
          resolution: '480P',
        });

        const videoResult = await pollLipSyncResult(lipSyncResult.taskId);

        // Download and re-upload to our storage
        const videoBuffer = await downloadBufferFromUrl(videoResult.videoUrl);
        const clipPath = `clips/${leadId}/${crypto.randomUUID()}.mp4`;
        const clipUrl = await uploadBufferToStorage({
          bucket: 'videos',
          path: clipPath,
          buffer: videoBuffer,
          contentType: 'video/mp4',
        });

        clips.push({
          startTime: seg.startTime,
          endTime: seg.endTime,
          clipUrl,
          placeholder,
          value,
        });
      }

      // Generate landing page URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // Save video recording (using base video as reference)
      const { data: videoRec } = await supabaseAdmin
        .from('video_recordings')
        .insert({
          lead_id: leadId,
          video_url: baseVideoUrl,
          title: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'AI Avatar Video',
          cta_text: 'Book a Call',
          brand_color: '#34d399',
          brand_title: 'Capital Acquisition',
        })
        .select()
        .single();

      const landingPageUrl = videoRec?.id
        ? `${appUrl}/landing/${videoRec.id}?leadId=${leadId}`
        : `${appUrl}/landing/placeholder?leadId=${leadId}`;

      // Update lead
      await supabaseAdmin
        .from('leads')
        .update({
          v2_status: 'ready',
          v2_video_url: baseVideoUrl,
          personalized_landing_page_url: landingPageUrl,
          v2_generated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[personalize] Clips mode done for ${leadId} — ${clips.length} clips in ${elapsed}s`);

      return NextResponse.json({
        success: true,
        mode: 'clips',
        baseVideoUrl,
        clips,
        timedSegments: variableSegments,
        totalDuration,
        landingPageUrl,
        duration: parseFloat(elapsed),
      });
    }

    // ===== FULL MODE (legacy fallback) =====
    console.log(`[personalize] Full mode — generating complete video for ${leadId}`);

    const ttsResult = await generateTTS({
      text: resolvedScript,
      referenceAudioUrl: voiceRefUrl || undefined,
    });

    const audioFileName = `personalize-audio/${crypto.randomUUID()}.wav`;
    const audioUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: audioFileName,
      buffer: Buffer.from(ttsResult.audioBuffer),
      contentType: 'audio/wav',
    });

    const videoResult = await generateLipSyncVideo({
      audioUrl,
      imageUrl: faceImageUrl,
      resolution: '480P',
    });

    const videoBuffer = await downloadBufferFromUrl(videoResult.videoUrl);
    const videoFileName = `lead-videos/${crypto.randomUUID()}.mp4`;
    const finalVideoUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: videoFileName,
      buffer: videoBuffer,
      contentType: 'video/mp4',
    });

    const gifUrl = process.env.CLOUDINARY_CLOUD_NAME
      ? finalVideoUrl
          .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
          .replace(/\.[^/.]+$/, '.gif')
      : finalVideoUrl;

    const { data: videoRec } = await supabaseAdmin
      .from('video_recordings')
      .insert({
        lead_id: leadId,
        video_url: finalVideoUrl,
        gif_url: gifUrl,
        title: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'AI Avatar Video',
        cta_text: 'Book a Call',
        brand_color: '#34d399',
        brand_title: 'Capital Acquisition',
      })
      .select()
      .single();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const landingPageUrl = videoRec?.id
      ? `${appUrl}/landing/${videoRec.id}?leadId=${leadId}`
      : `${appUrl}/landing/placeholder?leadId=${leadId}`;

    await supabaseAdmin
      .from('leads')
      .update({
        v2_status: 'ready',
        v2_video_url: finalVideoUrl,
        personalized_landing_page_url: landingPageUrl,
        email_gif_url: gifUrl,
        v2_generated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[personalize] Full mode done for ${leadId} in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      mode: 'full',
      videoUrl: finalVideoUrl,
      gifUrl,
      landingPageUrl,
      audioUrl,
      duration: parseFloat(elapsed),
    });
  } catch (err: any) {
    console.error('[personalize] Error:', err?.message || err);
    try {
      if (leadId) {
        await supabaseAdmin.from('leads').update({ v2_status: 'failed' }).eq('id', leadId);
      }
    } catch {}
    return NextResponse.json(
      { error: err?.message || 'Personalization failed' },
      { status: 500 }
    );
  }
}
