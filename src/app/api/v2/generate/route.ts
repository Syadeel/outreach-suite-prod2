/**
 * /api/v2/generate/route.ts — DashScope pipeline
 *
 * POST { leadId, script?, faceVideoUrl?, voiceRefUrl? }
 *
 * Pipeline:
 * 1. Fetch lead
 * 2. Load avatar config (or use provided URLs)
 * 3. Resolve script template with lead data
 * 4. Voice clone (DashScope CosyVoice) — direct, no internal API call
 * 5. Lip-sync (DashScope wan2.2-s2v) — direct, no internal API call
 * 6. Save video recording + landing page
 * 7. Update lead with video/gif/page URLs
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateTTS, generateLipSyncVideo, uploadBufferToStorage, downloadBufferFromUrl } from '@/lib/dashscope';
import { resolveScriptTemplate } from '@/lib/script-parser';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let leadId = '';

  try {
    const body = await req.json();
    leadId = body.leadId;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const customScript = body.script || '';
    const customFaceUrl = body.faceVideoUrl || '';
    const customVoiceRefUrl = body.voiceRefUrl || '';

    // 1. Fetch lead
    const supabase = getSupabase();
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await supabase.from('leads').update({ v2_status: 'processing' }).eq('id', leadId);

    // 2. Determine face image and voice ref URLs
    const firstName = lead.first_name || lead.email?.split('@')[0] || 'there';
    const company = lead.company || 'your company';

    let finalFaceUrl = customFaceUrl || process.env.AVATAR_FACE_IMAGE_URL || '';
    let finalVoiceRef = customVoiceRefUrl || process.env.AVATAR_VOICE_REF_URL || '';
    let scriptTemplate = customScript || 'Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach. Let me show you how it works.';

    // If no face/voice/script provided, load from avatar_config
    if (!finalFaceUrl || !finalVoiceRef || customScript) {
      const { data: config } = await supabase
        .from('avatar_config')
        .select('face_video_url, voice_ref_url, script_template')
        .eq('user_id', 'default_user')
        .single();

      if (config) {
        if (!finalFaceUrl && config.face_video_url) finalFaceUrl = config.face_video_url;
        if (!finalVoiceRef && config.voice_ref_url) finalVoiceRef = config.voice_ref_url;
        if (!customScript && config.script_template) scriptTemplate = config.script_template;
      }
    }

    if (!finalFaceUrl) {
      throw new Error('No face image configured. Set up your avatar in Avatar Studio first.');
    }

    // 3. Resolve script template with lead data
    const resolvedScript = resolveScriptTemplate(scriptTemplate, {
      first_name: firstName,
      company: company,
      last_name: lead.last_name || '',
      email: lead.email || '',
    });

    console.log(`[generate] Generating for lead ${leadId}: "${resolvedScript.slice(0, 80)}..."`);

    // 4. Voice clone — direct DashScope call
    console.log(`[generate] Voice cloning...`);
    const ttsResult = await generateTTS({
      text: resolvedScript,
      referenceAudioUrl: finalVoiceRef || undefined,
    });

    console.log(`[generate] TTS done: ${(ttsResult.audioBuffer.byteLength / 1024).toFixed(0)} KB`);

    // Upload audio to storage
    const audioFileName = `gen-audio/${crypto.randomUUID()}.wav`;
    const audioUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: audioFileName,
      buffer: Buffer.from(ttsResult.audioBuffer),
      contentType: 'audio/wav',
    });

    // 5. Lip-sync — direct DashScope call
    console.log(`[generate] Generating lip-sync video...`);
    const videoResult = await generateLipSyncVideo({
      audioUrl,
      imageUrl: finalFaceUrl,
      resolution: '480P',
    });

    console.log(`[generate] Video generated: ${videoResult.videoUrl}`);

    // Download and re-upload to our storage
    const videoBuffer = await downloadBufferFromUrl(videoResult.videoUrl);
    const videoFileName = `gen-videos/${crypto.randomUUID()}.mp4`;
    const videoUrl = await uploadBufferToStorage({
      bucket: 'videos',
      path: videoFileName,
      buffer: videoBuffer,
      contentType: 'video/mp4',
    });

    // 6. Generate GIF URL
    const gifUrl = process.env.CLOUDINARY_CLOUD_NAME
      ? videoUrl.replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/').replace(/\.[^/.]+$/, '.gif')
      : videoUrl;

    // 7. Save video recording
    const { data: videoRec } = await supabase
      .from('video_recordings')
      .insert({
        lead_id: leadId,
        video_url: videoUrl,
        gif_url: gifUrl,
        title: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'AI Avatar Video',
        cta_text: 'Book a Call',
        brand_color: '#34d399',
        brand_title: 'Capital Acquisition',
      })
      .select()
      .single();

    // 8. Generate landing page URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const landingPageUrl = videoRec?.id
      ? `${appUrl}/landing/${videoRec.id}?leadId=${leadId}`
      : `${appUrl}/landing/placeholder?leadId=${leadId}`;

    // 9. Update lead
    await supabase
      .from('leads')
      .update({
        v2_status: 'ready',
        v2_video_url: videoUrl,
        personalized_landing_page_url: landingPageUrl,
        email_gif_url: gifUrl,
        v2_generated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[generate] Done for lead ${leadId} in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      videoUrl,
      gifUrl,
      landingPageUrl,
      audioUrl,
      duration: parseFloat(elapsed),
    });
  } catch (err: any) {
    console.error('[generate] Error:', err?.message || err);
    try {
      if (leadId) {
        await getSupabase().from('leads').update({ v2_status: 'failed' }).eq('id', leadId);
      }
    } catch {}
    return NextResponse.json({ error: err?.message || 'Generate failed' }, { status: 500 });
  }
}
