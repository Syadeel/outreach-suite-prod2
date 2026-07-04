/**
 * V2 LatentSync API — DashScope wan2.2-s2v lip-sync video generation.
 *
 * POST /api/v2/latentsync
 *   { audioUrl: string, videoUrl?: string }
 *
 * Pipeline:
 * 1. Submit async task to DashScope wan2.2-s2v
 * 2. Poll until complete (15s intervals, max 50 min)
 * 3. Download result video
 * 4. Upload to Supabase Storage
 * 5. Return video URL
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_AVATAR_IMAGE = 'https://res.cloudinary.com/dacq1vyxp/image/upload/v1781118782/v2_face/video_1781118774.jpg';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { audioUrl, videoUrl } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    const apiKey = process.env.ALIBABA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ALIBABA_API_KEY not configured' }, { status: 500 });
    }

    const imageUrl = videoUrl || DEFAULT_AVATAR_IMAGE;
    console.log(`[latentsync] Starting: audio=${audioUrl}, image=${imageUrl}`);

    // ---- Step 1: Submit async task ----
    const submitRes = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis',
      {
        method: 'POST',
        headers: {
          'X-DashScope-Async': 'enable',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'wan2.2-s2v',
          input: { image_url: imageUrl, audio_url: audioUrl },
          parameters: { resolution: '480P' },
        }),
      },
    );

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`DashScope submit failed (${submitRes.status}): ${errText.slice(0, 300)}`);
    }

    const submitData = await submitRes.json();
    const taskId = submitData.output?.task_id;
    if (!taskId) throw new Error('No task_id returned from DashScope');

    console.log(`[latentsync] Task submitted: ${taskId}`);

    // ---- Step 2: Poll for completion ----
    let result: any = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      await sleep(15_000);

      const taskRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!taskRes.ok) {
        console.warn(`[latentsync] Poll ${attempt + 1} failed, retrying...`);
        continue;
      }

      const taskData = await taskRes.json();
      const status = taskData.output?.task_status;
      console.log(`[latentsync] Poll ${attempt + 1}/200: ${status}`);

      if (status === 'SUCCEEDED') {
        result = taskData.output;
        break;
      } else if (status === 'FAILED') {
        throw new Error(`Task failed: ${taskData.output?.message || 'Unknown'}`);
      }
    }

    if (!result) throw new Error('Task timed out after 50 minutes');

    // ---- Step 3: Download result video ----
    const resultVideoUrl = result.results?.video_url;
    if (!resultVideoUrl) throw new Error('No video_url in task result');

    console.log(`[latentsync] Downloading video...`);
    const downloadRes = await fetch(resultVideoUrl);
    if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);

    const videoBuffer = Buffer.from(await downloadRes.arrayBuffer());
    console.log(`[latentsync] Downloaded: ${(videoBuffer.length / 1e6).toFixed(1)} MB`);

    // ---- Step 4: Upload to Supabase Storage ----
    const supabase = getSupabase();
    const fileName = `latentsync/${crypto.randomUUID()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('videos').getPublicUrl(fileName);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('Failed to get public URL');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[latentsync] Done in ${elapsed}s: ${publicUrl}`);

    return NextResponse.json({ videoUrl: publicUrl, duration: result.duration || 0 });
  } catch (err: any) {
    console.error('[latentsync] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'LatentSync failed' }, { status: 500 });
  }
}
