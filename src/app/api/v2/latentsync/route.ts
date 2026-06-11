/**
 * V2 LatentSync API — Spawns Modal LatentSync inference and waits for result.
 *
 * POST /api/v2/latentsync
 *   { audioUrl: string, videoUrl?: string }
 *
 * Pipeline:
 * 1. Spawn Modal LatentSync on A10G (detached)
 * 2. Poll until complete
 * 3. Fetch result from Modal volume
 * 4. Upload to Cloudinary
 * 5. Return video URL
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FACE_VIDEO_URL =
  process.env.FACE_VIDEO_URL ||
  'https://res.cloudinary.com/dacq1vyxp/video/upload/v1781118782/v2_face/video_1781118774.mp4';
const LATENTSYNC_APP = 'latentsync-v16-original';
const TEMP_DIR = path.join(process.cwd(), 'tmp');

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { audioUrl, videoUrl: customVideoUrl } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    const faceVideoUrl = customVideoUrl || FACE_VIDEO_URL;

    // ---- Step 1: Spawn Modal LatentSync ----
    console.log(`[V2 latentsync] Spawning inference...`);
    console.log(`  Video: ${faceVideoUrl}`);
    console.log(`  Audio: ${audioUrl}`);

    const spawnScript = `
import modal
f = modal.Function.from_name("${LATENTSYNC_APP}", "run_inference")
call = f.spawn(
    video_url="${faceVideoUrl}",
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
    console.log(`[V2 latentsync] Spawned: ${fcId}`);

    // ---- Step 2: Poll for completion ----
    console.log(`[V2 latentsync] Polling for completion...`);

    const pollScript = `
import modal
fc = modal.FunctionCall.from_id("${fcId}")
try:
    result = fc.get(timeout=120)
    print(result)
except TimeoutError:
    print("TIMEOUT")
except Exception as e:
    if 'timeout' in str(e).lower():
        print("TIMEOUT")
    else:
        raise
`;

    let inferenceResult: string | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const pollResult = await execFileAsync('python', ['-c', pollScript], {
        timeout: 180_000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      const output = pollResult.stdout?.trim();
      if (output && output !== 'TIMEOUT') {
        inferenceResult = output;
        break;
      }
      console.log(`  [V2 latentsync] Poll ${attempt + 1}/20 — still running...`);
      await new Promise(r => setTimeout(r, 30_000));
    }

    if (!inferenceResult) {
      throw new Error(
        `LatentSync timed out. Check: modal function get ${fcId}`,
      );
    }

    console.log(`[V2 latentsync] Inference complete: ${inferenceResult}`);

    // ---- Step 3: Fetch result from volume ----
    const videoPath = path.join(TEMP_DIR, `latentsync_${Date.now()}.mp4`);
    const fetchScript = `
import modal
f = modal.Function.from_name("${LATENTSYNC_APP}", "_fetch_output")
out = f.remote("/cache/output/lipsync_v16_final.mp4")
with open(r"${videoPath.replace(/\\/g, '/')}", "wb") as fh:
    fh.write(out)
print("FETCHED")
`;

    const fetchResult = await execFileAsync('python', ['-c', fetchScript], {
      timeout: 300_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (!existsSync(videoPath)) {
      throw new Error('Failed to fetch LatentSync output from volume');
    }

    const { readFileSync } = require('fs');
    const videoSize = readFileSync(videoPath).length;
    console.log(`[V2 latentsync] Fetched: ${(videoSize / 1e6).toFixed(1)} MB`);

    // ---- Step 4: Upload to Cloudinary ----
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'v2_videos';
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET || '',
    );

    const videoBuffer = require('fs').readFileSync(videoPath);
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
    const videoUrl = cloudData.secure_url;
    const duration = cloudData.duration || 0;

    // Cleanup
    await unlink(videoPath).catch(() => {});

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[V2 latentsync] Done in ${elapsed}s: ${videoUrl}`);

    return NextResponse.json({
      videoUrl,
      duration: parseFloat(String(duration)),
      elapsed: parseFloat(elapsed),
      functionCallId: fcId,
    });
  } catch (err: any) {
    console.error('[V2 latentsync] Error:', err.message || err);
    return NextResponse.json(
      { error: err.message || 'LatentSync failed' },
      { status: 500 },
    );
  }
}
