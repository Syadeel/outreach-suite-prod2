/**
 * V2 Voice Clone API — Qwen3-TTS voice cloning endpoint.
 *
 * POST /api/v2/voice-clone
 *   { text: string, language?: string }
 *
 * Pipeline:
 * 1. Call Qwen3-TTS (Modal) with voice reference
 * 2. Upload audio to Cloudinary
 * 3. Return audio URL
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const QWEN3_TTS_URL =
  process.env.QWEN3_TTS_URL ||
  'https://adelshah020--qwen3-tts-generate.modal.run';
const VOICE_REF_URL =
  'https://res.cloudinary.com/dacq1vyxp/video/upload/v1781112795/v2_voice_ref/voice_ref_optimized_30s.wav';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { text, language = 'English' } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // ---- Step 1: Call Qwen3-TTS ----
    console.log(`[V2 voice-clone] Generating TTS for: "${text.slice(0, 50)}..."`);

    const ttsRes = await fetch(QWEN3_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language,
        ref_audio_url: VOICE_REF_URL,
        x_vector_only: true,
        max_new_tokens: 2048,
      }),
      signal: AbortSignal.timeout(300_000), // 5 min
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => 'unknown');
      throw new Error(`Qwen3-TTS error (${ttsRes.status}): ${errText.slice(0, 300)}`);
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    if (audioBuffer.length < 1000) {
      throw new Error(`TTS returned tiny buffer: ${audioBuffer.length} bytes`);
    }

    console.log(`[V2 voice-clone] TTS generated: ${(audioBuffer.length / 1024).toFixed(0)} KB`);

    // ---- Step 2: Upload to Cloudinary ----
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'v2_tts';
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET || '',
    );

    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([audioBuffer]), 'audio.wav');
    uploadForm.append('api_key', process.env.CLOUDINARY_API_KEY || '');
    uploadForm.append('timestamp', String(timestamp));
    uploadForm.append('signature', signature);
    uploadForm.append('folder', folder);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
      { method: 'POST', body: uploadForm },
    );

    if (!cloudRes.ok) {
      const errText = await cloudRes.text().catch(() => 'unknown');
      throw new Error(`Cloudinary error (${cloudRes.status}): ${errText.slice(0, 300)}`);
    }

    const cloudData = await cloudRes.json();
    const audioUrl = cloudData.secure_url;
    const duration = cloudData.duration || 0;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[V2 voice-clone] Done in ${elapsed}s: ${audioUrl} (${duration}s)`);

    return NextResponse.json({
      audioUrl,
      duration: parseFloat(String(duration)),
      elapsed: parseFloat(elapsed),
    });
  } catch (err: any) {
    console.error('[V2 voice-clone] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Voice clone failed' }, { status: 500 });
  }
}
