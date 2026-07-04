/**
 * POST /api/v2/batch-personalize
 *
 * Batch personalization: generates short clips for multiple leads using
 * DashScope (TTS + lip-sync) and returns clip URLs.
 * Client-side ffmpeg.wasm splices clips into base video.
 *
 * Body: { avatarConfigId, leadIds: string[] }
 * Returns: { jobId, status: 'pending', totalLeads }
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTTS, submitLipSyncJob, pollLipSyncResult, uploadBufferToStorage } from '@/lib/dashscope';
import { parseScriptWithTimestamps, resolveScriptTemplate, type TimedSegment } from '@/lib/script-parser';
import { generatePersonalizedGifUrl, ensureWebsiteScreenshot } from '@/lib/gif-generator';
import crypto from 'crypto';

interface BatchRequest {
  avatarConfigId: string;
  leadIds: string[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as BatchRequest;
    const { avatarConfigId, leadIds } = body;

    if (!avatarConfigId || !leadIds?.length) {
      return NextResponse.json(
        { error: 'avatarConfigId and leadIds[] are required' },
        { status: 400 }
      );
    }

    // 1. Fetch avatar config
    const { data: config, error: configErr } = await supabaseAdmin
      .from('avatar_config')
      .select('*')
      .eq('id', avatarConfigId)
      .single();

    if (configErr || !config) {
      return NextResponse.json({ error: 'Avatar config not found' }, { status: 404 });
    }

    const faceImageUrl = config.face_video_url;
    const voiceRefUrl = config.voice_ref_url;
    const scriptTemplate = config.script_template || "Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow.";

    if (!faceImageUrl) {
      return NextResponse.json({ error: 'No face image configured' }, { status: 400 });
    }

    // 2. Create batch job record
    const batchJobId = crypto.randomUUID();
    await supabaseAdmin.from('batch_jobs').insert({
      id: batchJobId,
      status: 'processing',
      total_leads: leadIds.length,
      completed_leads: 0,
      created_at: new Date().toISOString(),
    });

    // 3. Process all leads (returns immediately — client polls status)
    processBatchLeads(
      batchJobId,
      leadIds,
      scriptTemplate,
      faceImageUrl,
      voiceRefUrl
    ).catch((err) => {
      console.error('[batch-personalize] Fatal error:', err);
      supabaseAdmin
        .from('batch_jobs')
        .update({ status: 'failed', error: err.message })
        .eq('id', batchJobId);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[batch-personalize] Job ${batchJobId} started for ${leadIds.length} leads in ${elapsed}s`);

    return NextResponse.json({
      jobId: batchJobId,
      status: 'processing',
      totalLeads: leadIds.length,
    });
  } catch (err: any) {
    console.error('[batch-personalize] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Batch personalization failed' },
      { status: 500 }
    );
  }
}

/**
 * Process batch leads sequentially (called in background).
 * For each lead:
 * 1. Resolve script template with lead data
 * 2. Generate TTS via DashScope CosyVoice
 * 3. Generate lip-sync video via DashScope wan2.2-s2v
 * 4. Save clip URLs + timestamps to batch_job_items
 */
async function processBatchLeads(
  batchJobId: string,
  leadIds: string[],
  scriptTemplate: string,
  faceImageUrl: string,
  voiceRefUrl: string | null
) {
  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];

    try {
      // Fetch lead data
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadErr || !lead) throw new Error(`Lead ${leadId} not found`);

      // Resolve script with lead variables
      const resolvedScript = resolveScriptTemplate(scriptTemplate, {
        first_name: lead.first_name || 'there',
        company: lead.company || 'your company',
        last_name: lead.last_name || '',
        email: lead.email || '',
      });

      console.log(`[batch] ${i + 1}/${leadIds.length} — Generating for ${lead.first_name}: "${resolvedScript.slice(0, 60)}..."`);

      // Generate TTS
      const ttsResult = await generateTTS({
        text: resolvedScript,
        referenceAudioUrl: voiceRefUrl || undefined,
      });

      // Upload audio
      const audioPath = `batch/${batchJobId}/${leadId}_audio.wav`;
      const audioUrl = await uploadBufferToStorage({
        bucket: 'videos',
        path: audioPath,
        buffer: Buffer.from(ttsResult.audioBuffer),
        contentType: 'audio/wav',
      });

      // Generate lip-sync video
      const lipSyncResult = await submitLipSyncJob({
        audioUrl,
        imageUrl: faceImageUrl,
        resolution: '480P',
      });

      const videoResult = await pollLipSyncResult(lipSyncResult.taskId);

      // Upload video to our storage
      const videoRes = await fetch(videoResult.videoUrl);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      const videoPath = `batch/${batchJobId}/${leadId}_clip.mp4`;
      const finalClipUrl = await uploadBufferToStorage({
        bucket: 'videos',
        path: videoPath,
        buffer: videoBuffer,
        contentType: 'video/mp4',
      });

      // Calculate timestamps for this lead's script
      const timedSegments = parseScriptWithTimestamps(scriptTemplate, 30); // assume 30s base
      const variableSegments = timedSegments.filter((s) => s.type === 'variable');

      // Generate personalized GIF (website screenshot background + video overlay)
      const website = lead.website || '';
      let gifUrl: string | null = null;

      try {
        // Ensure screenshot exists in Cloudinary (fetch if not cached)
        if (website) {
          await ensureWebsiteScreenshot(website);
        }
        // Generate the composite GIF URL
        gifUrl = generatePersonalizedGifUrl({ videoUrl: finalClipUrl, website });
        console.log(`[batch] GIF generated for ${lead.first_name}: ${gifUrl?.slice(0, 80)}...`);
      } catch (gifErr: any) {
        console.warn(`[batch] GIF generation failed for ${lead.first_name}: ${gifErr.message}`);
        // Fallback: simple GIF from video
        gifUrl = generatePersonalizedGifUrl({ videoUrl: finalClipUrl, website: null });
      }

      // Generate landing page URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // Save video recording
      const { data: videoRec } = await supabaseAdmin
        .from('video_recordings')
        .insert({
          lead_id: leadId,
          video_url: finalClipUrl,
          gif_url: gifUrl,
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

      // Save clip result
      await supabaseAdmin.from('batch_job_items').insert({
        batch_job_id: batchJobId,
        lead_id: leadId,
        status: 'completed',
        clip_url: finalClipUrl,
        timed_segments: JSON.stringify(variableSegments),
        completed_at: new Date().toISOString(),
      });

      // Update lead with video URL, GIF URL, and landing page URL
      await supabaseAdmin
        .from('leads')
        .update({
          v2_status: 'ready',
          v2_video_url: finalClipUrl,
          email_gif_url: gifUrl,
          personalized_landing_page_url: landingPageUrl,
          v2_generated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      console.log(`[batch] ${i + 1}/${leadIds.length} — Done for ${lead.first_name}`);
    } catch (err: any) {
      console.error(`[batch] ${i + 1}/${leadIds.length} — Failed for ${leadId}:`, err.message);

      await supabaseAdmin.from('batch_job_items').insert({
        batch_job_id: batchJobId,
        lead_id: leadId,
        status: 'failed',
        error: err.message,
        completed_at: new Date().toISOString(),
      });

      await supabaseAdmin
        .from('leads')
        .update({ v2_status: 'failed' })
        .eq('id', leadId);
    }

    // Update progress
    await supabaseAdmin
      .from('batch_jobs')
      .update({ completed_leads: i + 1, updated_at: new Date().toISOString() })
      .eq('id', batchJobId);
  }

  // Mark batch complete
  await supabaseAdmin
    .from('batch_jobs')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', batchJobId);

  console.log(`[batch] Job ${batchJobId} completed — ${leadIds.length} leads processed`);
}
