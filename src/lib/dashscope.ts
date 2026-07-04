import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1';

function getApiKey(): string {
  const key = process.env.ALIBABA_API_KEY || process.env.DASH_SCOPE_API_KEY;
  if (!key) throw new Error('ALIBABA_API_KEY / DASH_SCOPE_API_KEY is not configured');
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------- CosyVoice TTS ---------------

export interface DashScopeTTSOptions {
  text: string;
  referenceAudioUrl?: string;
  format?: 'wav' | 'mp3' | 'pcm';
  sampleRate?: number;
  language?: string;
}

export interface DashScopeTTSResult {
  audioBuffer: ArrayBuffer;
  duration: number;
  contentType: string;
  voiceId?: string;
}

export async function generateTTS(options: DashScopeTTSOptions): Promise<DashScopeTTSResult> {
  const { text, referenceAudioUrl, format = 'wav', sampleRate = 16000, language = 'zh' } = options;

  if (!text?.trim()) throw new Error('TTS text is required');

  // Step 1: Create voice from reference audio if provided (CosyVoice v3.5)
  let voiceId: string | undefined;

  if (referenceAudioUrl) {
    const createVoiceRes = await fetch(`${DASHSCOPE_BASE}/services/audio/tts/customization`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: 'voice-enrollment',
        input: {
          action: 'create_voice',
          target_model: 'cosyvoice-v3.5-plus',
          prefix: 'os-voice',
          url: referenceAudioUrl,
          language_hints: [language],
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!createVoiceRes.ok) {
      const errText = await createVoiceRes.text().catch(() => 'unknown');
      throw new Error(`Voice creation failed (${createVoiceRes.status}): ${errText.slice(0, 400)}`);
    }

    const voiceData = await createVoiceRes.json();
    voiceId = voiceData.output?.voice_id;
    if (!voiceId) throw new Error('Voice creation did not return a voice_id');
  }

  // Step 2: Generate TTS with CosyVoice v3.5-plus
  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/audio-generation/generation`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: 'cosyvoice-v3.5-plus',
      input: {
        text,
        voice: voiceId ? { voice_id: voiceId } : undefined,
      },
      parameters: {
        format,
        sample_rate: sampleRate,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`DashScope CosyVoice TTS failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  if (contentType.includes('application/json')) {
    const json = await res.json();
    const base64Audio = json.output?.audio || json.audio;
    if (!base64Audio) throw new Error('DashScope TTS returned no audio payload');

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    return {
      audioBuffer: bytes.buffer,
      duration: Number(json.output?.usage?.duration || json.duration || 0),
      contentType,
      voiceId,
    };
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    audioBuffer: arrayBuffer,
    duration: 0,
    contentType,
    voiceId,
  };
}

// --------------- Wan2.2-S2V Lip-Sync ---------------

export interface LipSyncSubmitResult {
  taskId: string;
}

export interface LipSyncResult {
  videoUrl: string;
  duration: number;
}

export async function submitLipSyncJob(options: {
  audioUrl: string;
  imageUrl: string;
  resolution?: '480P' | '720P';
}): Promise<LipSyncSubmitResult> {
  const { audioUrl, imageUrl, resolution = '480P' } = options;

  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2video/video-synthesis`, {
    method: 'POST',
    headers: {
      ...headers(),
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'wan2.2-s2v',
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
      },
      parameters: {
        resolution,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DashScope lip-sync submit failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const taskId = data.output?.task_id;
  if (!taskId) throw new Error('DashScope lip-sync did not return a task_id');

  return { taskId };
}

export async function pollLipSyncResult(taskId: string): Promise<LipSyncResult> {
  const apiKey = getApiKey();

  for (let attempt = 0; attempt < 200; attempt++) {
    await sleep(15_000);

    const taskRes = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!taskRes.ok) {
      console.warn(`[dashscope] lip-sync poll ${attempt + 1} failed: ${taskRes.status}`);
      continue;
    }

    const taskData = await taskRes.json();
    const status = taskData.output?.task_status;
    console.log(`[dashscope] lip-sync poll ${attempt + 1}/200: ${status}`);

    if (status === 'SUCCEEDED') {
      const videoUrl = taskData.output?.results?.video_url;
      if (!videoUrl) throw new Error('Lip-sync task succeeded but returned no video_url');
      return {
        videoUrl,
        duration: Number(taskData.output?.duration || 0),
      };
    }

    if (status === 'FAILED') {
      throw new Error(`Lip-sync task failed: ${taskData.output?.message || 'unknown error'}`);
    }
  }

  throw new Error('Lip-sync task timed out after max attempts');
}

export async function generateLipSyncVideo(options: {
  audioUrl: string;
  imageUrl: string;
  resolution?: '480P' | '720P';
}): Promise<LipSyncResult> {
  const { taskId } = await submitLipSyncJob(options);
  return pollLipSyncResult(taskId);
}

// --------------- Storage helpers ---------------

export async function uploadBufferToStorage(options: {
  bucket: string;
  path: string;
  buffer: Buffer | ArrayBuffer;
  contentType: string;
}): Promise<string> {
  const { bucket, path, buffer, contentType } = options;
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Failed to resolve Supabase public URL');
  return data.publicUrl;
}

export async function downloadBufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
