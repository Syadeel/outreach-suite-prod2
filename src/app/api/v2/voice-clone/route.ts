/**
 * V2 Voice Clone API — DashScope CosyVoice voice cloning endpoint.
 *
 * POST /api/v2/voice-clone
 *   { text: string, ref_audio_url: string }
 *
 * Pipeline:
 * 1. Call DashScope CosyVoice API
 * 2. Upload audio to Supabase Storage
 * 3. Return audio URL
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { text, ref_audio_url, language = 'zh' } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const apiKey = process.env.ALIBABA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ALIBABA_API_KEY not configured' }, { status: 500 });
    }

    // ---- Step 1: Create voice from reference audio (CosyVoice v3.5) ----
    let voiceId: string | undefined;

    if (ref_audio_url) {
      console.log(`[voice-clone] Creating voice from reference audio...`);
      const createVoiceRes = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'voice-enrollment',
            input: {
              action: 'create_voice',
              target_model: 'cosyvoice-v3.5-plus',
              prefix: 'os-voice',
              url: ref_audio_url,
              language_hints: [language],
            },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (!createVoiceRes.ok) {
        const errText = await createVoiceRes.text().catch(() => 'unknown');
        throw new Error(`Voice creation failed (${createVoiceRes.status}): ${errText.slice(0, 300)}`);
      }

      const voiceData = await createVoiceRes.json();
      voiceId = voiceData.output?.voice_id;
      if (!voiceId) throw new Error('Voice creation did not return a voice_id');
      console.log(`[voice-clone] Voice created: ${voiceId}`);
    }

    // ---- Step 2: Generate TTS with CosyVoice v3.5-plus ----
    console.log(`[voice-clone] Generating TTS: "${text.slice(0, 60)}..."`);

    const ttsRes = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/audio-generation/generation',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'cosyvoice-v3.5-plus',
          input: {
            text: text,
            voice: voiceId ? { voice_id: voiceId } : undefined,
          },
          parameters: {
            format: 'wav',
            sample_rate: 16000,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => 'unknown');
      throw new Error(`DashScope CosyVoice error (${ttsRes.status}): ${errText.slice(0, 300)}`);
    }

    // Handle both JSON and binary responses
    const contentType = ttsRes.headers.get('content-type') || '';
    let audioBuffer: ArrayBuffer;
    let duration = 0;

    if (contentType.includes('application/json')) {
      const json = await ttsRes.json();
      const base64Audio = json.output?.audio || json.audio;
      if (!base64Audio) throw new Error('No audio in DashScope response');
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      audioBuffer = bytes.buffer;
      duration = json.output?.usage?.duration || json.duration || 0;
    } else {
      audioBuffer = await ttsRes.arrayBuffer();
    }

    if (audioBuffer.byteLength < 1000) {
      throw new Error(`TTS returned tiny buffer: ${audioBuffer.byteLength} bytes`);
    }

    console.log(`[voice-clone] TTS generated: ${(audioBuffer.byteLength / 1024).toFixed(0)} KB`);

    // ---- Step 2: Upload to Supabase Storage ----
    const supabase = getSupabase();
    const fileName = `voice-clone/${crypto.randomUUID()}.wav`;

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/wav',
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('videos').getPublicUrl(fileName);
    const audioUrl = urlData?.publicUrl;
    if (!audioUrl) throw new Error('Failed to get public URL');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[voice-clone] Done in ${elapsed}s: ${audioUrl}`);

    return NextResponse.json({ audioUrl, duration });
  } catch (err: any) {
    console.error('[voice-clone] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Voice clone failed' }, { status: 500 });
  }
}
