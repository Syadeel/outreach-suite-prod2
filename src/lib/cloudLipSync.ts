/**
 * cloudLipSync.ts
 *
 * Cloud-based lip-sync video generation. Laptop can be off — all
 * processing happens on remote GPUs.
 *
 * Provider priority:
 *   1. Modal LatentSync  (best quality — FREE with Modal $30/mo credits)
 *   2. Modal MuseTalk    (fallback — ~$0.001/video)
 *   3. Replicate MuseTalk (2nd fallback — $0.19/video)
 *   4. sync.so           (last resort — $2.40/60s-video)
 *
 * Requires one of these env vars:
 *   MODAL_LATENTSYNC_ENDPOINT_URL — URL from `modal deploy modal_latentsync.py`
 *   MODAL_ENDPOINT_URL            — URL from `modal deploy modal_musetalk.py`
 *   REPLICATE_API_KEY             — https://replicate.com/account/api-tokens
 *   SYNC_API_KEY                  — https://sync.so
 */

import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface LipSyncResult {
  videoUrl: string;
  provider: 'modal' | 'replicate' | 'sync-so';
  cost: number; // estimated USD
  duration: number; // wall-clock seconds
}

const TEMP_DIR = path.join(process.cwd(), 'tmp');

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadToCloudinary(
  filePath: string,
  resourceType: 'video' | 'image' | 'raw',
  folder: string,
): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: resourceType,
    folder,
    overwrite: true,
  });
  return result.secure_url;
}

// ---------------------------------------------------------------------------
// Provider 1 — Modal LatentSync (best quality, ~$0.001/video on Modal free credits)
// ---------------------------------------------------------------------------

async function generateViaLatentSync(
  seedVideoUrl: string,
  audioUrl: string,
): Promise<LipSyncResult> {
  const endpoint = process.env.MODAL_LATENTSYNC_ENDPOINT_URL;
  if (!endpoint) throw new Error('MODAL_LATENTSYNC_ENDPOINT_URL not configured');

  const startTime = Date.now();

  // Build query params (Modal @fastapi_endpoint reads from query string)
  const params = new URLSearchParams({
    video_url: seedVideoUrl,
    audio_url: audioUrl,
    guidance_scale: '2.0',
    inference_steps: '20',
    seed: '0',
    enable_deepcache: 'true',
  });
  const url = `${endpoint}?${params}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'video/mp4' },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LatentSync error (${response.status}): ${errText}`);
  }

  const durHeader = response.headers.get('X-Duration');
  const costHeader = response.headers.get('X-Cost');
  const inferenceDuration = durHeader ? parseFloat(durHeader) : (Date.now() - startTime) / 1000;
  const estimatedCost = costHeader ? parseFloat(costHeader) : 0.005;

  // Save video bytes to temp file
  await mkdir(TEMP_DIR, { recursive: true });
  const tempVideo = path.join(TEMP_DIR, `latentsync_${Date.now()}.mp4`);
  const videoBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(tempVideo, videoBuffer);

  // Upload to Cloudinary
  const videoUrl = await uploadToCloudinary(tempVideo, 'video', 'v2_videos');

  // Cleanup temp file
  await unlink(tempVideo).catch(() => {});

  const totalDuration = (Date.now() - startTime) / 1000;
  return {
    videoUrl,
    provider: 'modal',
    cost: estimatedCost,
    duration: totalDuration,
  };
}

// ---------------------------------------------------------------------------
// Provider 2 — Modal MuseTalk (good value: ~$0.001/video)
// ---------------------------------------------------------------------------

async function generateViaModal(
  seedVideoUrl: string,
  audioUrl: string,
): Promise<LipSyncResult> {
  const endpoint = process.env.MODAL_ENDPOINT_URL;
  if (!endpoint) throw new Error('MODAL_ENDPOINT_URL not configured');

  const startTime = Date.now();

  // POST to Modal endpoint — query params (FastAPI / Musetalk convention)
  const params = new URLSearchParams({
    video_url: seedVideoUrl,
    audio_url: audioUrl,
    bbox_shift: '8',  // shift face crop down to show more chin/beard
    mode: 'blend',  // fast compositing (~1ms/frame vs ~385ms/frame)
  });
  const url = `${endpoint}?${params}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'video/mp4' },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Modal error (${response.status}): ${errText}`);
  }

  // Read duration and cost from response headers
  const durHeader = response.headers.get('X-Duration');
  const costHeader = response.headers.get('X-Cost');
  const inferenceDuration = durHeader ? parseFloat(durHeader) : (Date.now() - startTime) / 1000;
  const estimatedCost = costHeader ? parseFloat(costHeader) : 0.005;

  // Save video bytes to temp file
  await mkdir(TEMP_DIR, { recursive: true });
  const tempVideo = path.join(TEMP_DIR, `modal_${Date.now()}.mp4`);
  const videoBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(tempVideo, videoBuffer);

  // Upload to Cloudinary
  const videoUrl = await uploadToCloudinary(tempVideo, 'video', 'v2_videos');

  // Cleanup temp file
  await unlink(tempVideo).catch(() => {});

  const totalDuration = (Date.now() - startTime) / 1000;
  return {
    videoUrl,
    provider: 'modal',
    cost: estimatedCost,
    duration: totalDuration,
  };
}

// ---------------------------------------------------------------------------
// Provider 2 — Replicate MuseTalk ($0.19/video)
// ---------------------------------------------------------------------------

const MUSETALK_VERSION = 'douwantech/musetalk';

async function generateViaReplicate(
  seedVideoUrl: string,
  audioUrl: string,
): Promise<LipSyncResult> {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('REPLICATE_API_KEY not configured');

  const startTime = Date.now();

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${MUSETALK_VERSION}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          video_input: seedVideoUrl,
          audio_input: audioUrl,
          bbox_shift: 0,
          fps: 25,
        },
      }),
    },
  );

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Replicate error (${createRes.status}): ${errBody}`);
  }

  const prediction = await createRes.json();
  const getUrl: string | undefined = prediction.urls?.get;
  if (!getUrl) {
    throw new Error(`Unexpected Replicate response: ${JSON.stringify(prediction)}`);
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(5000);

    const pollRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!pollRes.ok) {
      throw new Error(`Replicate poll error (${pollRes.status})`);
    }

    const status = await pollRes.json();

    if (status.status === 'succeeded') {
      const outputUrl: string | undefined =
        typeof status.output === 'string'
          ? status.output
          : Array.isArray(status.output)
            ? status.output[0]
            : status.output?.video || status.output?.output;

      if (!outputUrl) {
        throw new Error(`Replicate no output: ${JSON.stringify(status.output)}`);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      return {
        videoUrl: outputUrl,
        provider: 'replicate',
        cost: 0.19,
        duration: elapsed,
      };
    }

    if (status.status === 'failed') {
      throw new Error(`Replicate failed: ${status.error || 'Unknown error'}`);
    }
  }

  throw new Error('Replicate timeout after ~10 min');
}

// ---------------------------------------------------------------------------
// Provider 3 — sync.so ($2.40/60s-video)
// ---------------------------------------------------------------------------

async function generateViaSyncSo(
  audioUrl: string,
  videoUrl: string,
): Promise<LipSyncResult> {
  const apiKey = process.env.SYNC_API_KEY;
  if (!apiKey) throw new Error('SYNC_API_KEY not configured');

  const startTime = Date.now();

  const res = await fetch('https://api.sync.so/v2/generate', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [
        { type: 'video', url: videoUrl },
        { type: 'audio', url: audioUrl },
      ],
      model: 'lipsync-2',
      options: { sync_mode: 'cut_off' },
    }),
  });

  const body = await res.json();
  if (!res.ok || !body.id) {
    throw new Error(`Sync.so error: ${JSON.stringify(body)}`);
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(5000);

    const statusRes = await fetch(`https://api.sync.so/v2/generate/${body.id}`, {
      headers: { 'x-api-key': apiKey },
    });
    const statusData = await statusRes.json();

    if (statusData.status === 'completed') {
      const elapsed = (Date.now() - startTime) / 1000;
      return {
        videoUrl: statusData.output.url,
        provider: 'sync-so',
        cost: 0.04 * (statusData.output?.duration || 30),
        duration: elapsed,
      };
    }

    if (statusData.status === 'failed') {
      throw new Error(`Sync.so failed: ${statusData.error}`);
    }
  }

  throw new Error('Sync.so timeout after 10 min');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate lip-synced video using best available provider.
 *
 * Priority:
 *   1. Modal LatentSync  (set MODAL_LATENTSYNC_ENDPOINT_URL) — best quality, FREE
 *   2. Modal MuseTalk    (set MODAL_ENDPOINT_URL)            — ~$0.001/video
 *   3. Replicate MuseTalk (set REPLICATE_API_KEY)            — $0.19/video
 *   4. sync.so           (set SYNC_API_KEY)                  — $2.40/60s-video
 *
 * Throws if no provider is configured.
 */
export async function generateLipSync(
  seedVideoUrl: string,
  audioUrl: string,
): Promise<LipSyncResult> {
  // 1. LatentSync (best quality, free on Modal credits)
  if (process.env.MODAL_LATENTSYNC_ENDPOINT_URL) {
    try {
      const result = await generateViaLatentSync(seedVideoUrl, audioUrl);
      console.log(
        `[cloudLipSync] LatentSync OK — ${result.duration.toFixed(1)}s, ` +
          `~$${result.cost.toFixed(4)}`,
      );
      return result;
    } catch (err: any) {
      console.warn(`[cloudLipSync] LatentSync failed (${err.message}), trying Modal MuseTalk...`);
    }
  }

  // 2. Modal MuseTalk (fallback)
  if (process.env.MODAL_ENDPOINT_URL) {
    try {
      const result = await generateViaModal(seedVideoUrl, audioUrl);
      console.log(
        `[cloudLipSync] Modal OK — ${result.duration.toFixed(1)}s, ` +
          `~$${result.cost.toFixed(4)}`,
      );
      return result;
    } catch (err: any) {
      console.warn(`[cloudLipSync] Modal failed (${err.message}), trying Replicate...`);
    }
  }

  // 3. Replicate (2nd fallback)
  if (process.env.REPLICATE_API_KEY) {
    try {
      const result = await generateViaReplicate(seedVideoUrl, audioUrl);
      console.log(
        `[cloudLipSync] Replicate OK — ${result.duration.toFixed(1)}s, ` +
          `~$${result.cost.toFixed(2)}`,
      );
      return result;
    } catch (err: any) {
      console.warn(
        `[cloudLipSync] Replicate failed (${err.message}), trying sync.so...`,
      );
    }
  }

  // 4. Sync.so (last resort)
  if (process.env.SYNC_API_KEY) {
    const result = await generateViaSyncSo(audioUrl, seedVideoUrl);
    console.log(
      `[cloudLipSync] sync.so OK — ${result.duration.toFixed(1)}s, ` +
        `~$${result.cost.toFixed(2)}`,
    );
    return result;
  }

  throw new Error(
    'No lip-sync provider configured. Set MODAL_LATENTSYNC_ENDPOINT_URL, ' +
      'MODAL_ENDPOINT_URL, REPLICATE_API_KEY, or SYNC_API_KEY in .env.local',
  );
}
