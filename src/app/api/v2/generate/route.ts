// File: api/v2/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v2 as cloudinary } from 'cloudinary';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { generateLandingPage } from '@/lib/landingPage';

export const maxDuration = 300;

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const TEMP_DIR = path.join(process.cwd(), 'tmp');
const FACE_VIDEO_URL =
  process.env.FACE_VIDEO_URL ||
  'https://res.cloudinary.com/dacq1vyxp/video/upload/v1781118782/v2_face/video_1781118774.mp4';
const VOICE_REF_URL =
  process.env.VOICE_REF_URL ||
  'https://res.cloudinary.com/dacq1vyxp/video/upload/v1781112795/v2_voice_ref/voice_ref_optimized_30s.wav';
const VOICE_CLONE_URL =
  process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v2/voice-clone`
    : 'http://localhost:3000/api/v2/voice-clone';
const LATENTSYNC_APP = 'latentsync-v16-original';
const OUTPUT_DIR = path.join(process.cwd(), '..', 'voicekit', 'output');

// ---------------------------------------------------------------------------
// POST /api/v2/generate
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let leadId = '';
  let audioUrl = '';
  let videoUrl = '';

  try {
    const body = await req.json();
    leadId = body.leadId;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    // Accept custom script, faceVideoUrl, and voiceRefUrl from request
    const customScript = body.script || '';
    const customFaceVideoUrl = body.faceVideoUrl || '';
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

    // 2. Generate personalized script
    const firstName = lead.first_name || lead.email?.split('@')[0] || 'there';
    const company = lead.company || 'your company';
    const script = (customScript || `Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach. Let me show you how it works.`)
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);

    // Determine face video and voice ref URLs (custom > env hardcoded)
    const currentFaceVideoUrl = customFaceVideoUrl || FACE_VIDEO_URL;
    const currentVoiceRefUrl = customVoiceRefUrl || VOICE_REF_URL;

    // 3. Generate voice clone audio via Qwen3-TTS
    console.log(`[V2] Generating voice clone for lead ${leadId}...`);
    const vcUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v2/voice-clone`
      : 'http://localhost:3000/api/v2/voice-clone';
    
    const voiceCloneRes = await fetch(
      vcUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, ref_audio_url: currentVoiceRefUrl }),
      },
    );

    if (!voiceCloneRes.ok) {
      const errData = await voiceCloneRes.json().catch(() => ({ error: 'Unknown' }));
      throw new Error(`Voice clone failed: ${errData.error}`);
    }

    const voiceData = await voiceCloneRes.json();
    audioUrl = voiceData.audioUrl;

    console.log(`[V2] Voice clone ready: ${audioUrl} (${voiceData.duration}s)`);

    // 4. Spawn Modal LatentSync inference (detached)
    console.log(`[V2] Spawning LatentSync inference...`);

    // Use Python to spawn the Modal function
    const spawnScript = `
import modal
f = modal.Function.from_name("${LATENTSYNC_APP}", "run_inference")
call = f.spawn(
    video_url="${currentFaceVideoUrl}",
    audio_url="${audioUrl}",
    inference_steps=25,
    guidance_scale=1.5,
    seed=1247,
    enable_deepcache=True,
)
print(call.object_id)
`;

    await mkdir(TEMP_DIR, { recursive: true });
    const spawnResult = await execFileAsync('python', ['-c', spawnScript], {
      timeout: 60_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const fcId = spawnResult.stdout?.trim();
    if (!fcId || !fcId.startsWith('fc-')) {
      throw new Error(`Invalid function call ID: ${fcId}`);
    }
    console.log(`[V2] LatentSync spawned: ${fcId}`);

    // 5. Wait for inference to complete (poll every 30s, max 20 min)
    console.log(`[V2] Waiting for inference to complete...`);
    const pollScript = `
import modal
fc = modal.FunctionCall.from_id("${fcId}")
try:
    result = fc.get(timeout=600)
    print(result)
except Exception as e:
    if 'timeout' in str(e).lower():
        print('TIMEOUT')
    else:
        raise
`;

    let inferenceResult: string | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const pollResult = await execFileAsync('python', ['-c', pollScript], {
        timeout: 120_000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      const output = pollResult.stdout?.trim();
      if (output && output !== 'TIMEOUT') {
        inferenceResult = output;
        break;
      }
      console.log(`  [V2] Poll ${attempt + 1}/40 — still running...`);
      await new Promise(r => setTimeout(r, 30_000));
    }

    if (!inferenceResult) {
      throw new Error(`LatentSync timed out after 40 polls. Check: modal function get ${fcId}`);
    }

    console.log(`[V2] Inference completed: ${inferenceResult}`);

    // 6. Fetch the result video from Modal volume
    const fetchScript = `
import modal
f = modal.Function.from_name("${LATENTSYNC_APP}", "_fetch_output")
out = f.remote("/cache/output/lipsync_v16_final.mp4")
with open(r"${path.join(TEMP_DIR, 'latentsync_result.mp4').replace(/\\/g, '/')}", "wb") as fh:
    fh.write(out)
print("FETCHED")
`;

    await execFileAsync('python', ['-c', fetchScript], {
      timeout: 300_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const videoPath = path.join(TEMP_DIR, 'latentsync_result.mp4');
    if (!existsSync(videoPath)) {
      throw new Error('Failed to fetch LatentSync output');
    }

    // 7. Upload result video to Cloudinary
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'v2_videos';
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET || '',
    );

    const videoBuffer = readFileSync(videoPath);
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([videoBuffer]), 'video.mp4');
    uploadForm.append('api_key', process.env.CLOUDINARY_API_KEY || '');
    uploadForm.append('timestamp', String(timestamp));
    uploadForm.append('signature', signature);
    uploadForm.append('folder', folder);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
      { method: 'POST', body: uploadForm },
    );

    if (!cloudRes.ok) {
      throw new Error(`Cloudinary upload failed: ${await cloudRes.text()}`);
    }

    const cloudData = await cloudRes.json();
    videoUrl = cloudData.secure_url;

    // 8. Generate GIF preview
    const gifUrl = videoUrl
      .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
      .replace(/\.[^/.]+$/, '.gif');

    // 9. Generate landing page
    const calendarUrl = process.env.CALENDLY_URL || process.env.NEXT_PUBLIC_CALENDLY_URL || '#';
    const lpHtml = generateLandingPage(
      lead.first_name || '',
      lead.last_name || '',
      lead.company || '',
      lead.website || '',
      videoUrl,
      gifUrl,
      calendarUrl,
    );

    const lpPath = path.join(TEMP_DIR, `lp_${leadId}_${Date.now()}.html`);
    await writeFile(lpPath, lpHtml);
    const lpUpload = await cloudinary.uploader.upload(lpPath, {
      resource_type: 'raw',
      folder: 'v2_landing_pages',
    });
    const lpUrl = lpUpload.secure_url;
    await unlink(lpPath).catch(() => {});

    // 10. Save to Supabase
    await supabase
      .from('leads')
      .update({
        v2_status: 'ready',
        v2_video_url: videoUrl,
        personalized_landing_page_url: lpUrl,
        email_gif_url: gifUrl,
        v2_generated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    await supabase.from('video_recordings').insert({
      lead_id: leadId,
      video_url: videoUrl,
      gif_url: gifUrl,
      landing_page_url: lpUrl,
      title: `V2 - ${lead.first_name || ''} ${lead.last_name || ''}`,
      cta_text: 'Book a Call',
      brand_color: '#34d399',
    });

    // Cleanup
    await unlink(videoPath).catch(() => {});

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[V2] Generated for lead ${leadId} in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      videoUrl,
      gifUrl,
      lpUrl,
      audioUrl,
      duration: parseFloat(elapsed),
    });
  } catch (err: any) {
    console.error('[V2] Generate error:', err?.message || err);
    try {
      if (leadId) {
        await getSupabase().from('leads').update({ v2_status: 'failed' }).eq('id', leadId);
      }
    } catch {}
    return NextResponse.json({ error: err?.message || 'Generate failed', leadId }, { status: 500 });
  }
}
