/**
 * VK Upload Voice API — accepts an MP3/WAV file upload and saves it to
 * the VoiceKit voice_sample directory for voice cloning.
 *
 * POST /api/vk/upload-voice
 *   FormData:
 *     file    — .mp3 or .wav audio file
 *     leadId  — Supabase lead ID (optional, to auto-link the sample)
 *
 * Returns:
 *   { path: "F:\\...\\voice_sample\\lead_123.wav", fileName: "lead_123.wav" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const VOICE_SAMPLE_DIR = path.resolve(
  process.cwd(), '..', 'voicekit', 'voice_sample'
);

export async function POST(req: NextRequest) {
  try {
    // Ensure directory exists
    await mkdir(VOICE_SAMPLE_DIR, { recursive: true });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const leadId = formData.get('leadId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp3'];
    const ext = path.extname(file.name).toLowerCase();
    if (!['.mp3', '.wav'].includes(ext)) {
      return NextResponse.json({ error: 'Only .mp3 and .wav files are accepted' }, { status: 400 });
    }

    // Generate a unique filename: lead_{id}_{timestamp}.ext or just {timestamp}.ext
    const timestamp = Date.now();
    const safeName = leadId
      ? `lead_${leadId}_${timestamp}${ext}`
      : `upload_${timestamp}${ext}`;
    const savePath = path.join(VOICE_SAMPLE_DIR, safeName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(savePath, buffer);

    // If leadId was provided, update the lead's voice_sample field
    if (leadId) {
      await supabaseAdmin
        .from('leads')
        .update({ voice_sample: savePath })
        .eq('id', leadId);
    }

    console.log(`Voice sample saved: ${savePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    return NextResponse.json({
      path: savePath,
      fileName: safeName,
      sizeMb: parseFloat((buffer.length / 1024 / 1024).toFixed(1)),
    });
  } catch (err: any) {
    console.error('Voice upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
