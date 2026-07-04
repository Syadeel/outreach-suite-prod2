/**
 * modal-client.ts
 *
 * Shared Modal API client — HTTP POST to Modal endpoints.
 * Supports LatentSync, MuseTalk, Qwen3-TTS, and Voice Clone.
 * All endpoints use Modal's @fastapi_endpoint convention.
 *
 * Fallback: LatentSync → MuseTalk (automatic).
 */

const MODAL_USER = 'adelshah020';

export const MODAL_ENDPOINTS = {
  latentSync: `https://${MODAL_USER}--latentsync-v5-latentsyncinference-generate.modal.run`,
  museTalk: `https://${MODAL_USER}--musetalk-v7-musetalkinference-generate.modal.run`,
  qwen3Tts: `https://${MODAL_USER}--qwen3-tts-generate.modal.run`,
  voiceClone: `https://${MODAL_USER}--voice-clone-generate.modal.run`,
} as const;

export type ModalEndpoint = keyof typeof MODAL_ENDPOINTS;

export interface ModalResponse {
  success: boolean;
  output_url?: string;
  error?: string;
  duration?: number;
}

/**
 * Generic POST to a Modal endpoint with retry logic.
 * Modal endpoints accept JSON body and return JSON.
 */
async function callModal<T>(
  endpoint: string,
  payload: T,
  options?: { retries?: number; timeoutMs?: number }
): Promise<ModalResponse> {
  const { retries = 3, timeoutMs = 120_000 } = options ?? {};

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(`Modal HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      }

      const data = await response.json();
      return {
        success: true,
        output_url: data.output_url || data.video_url || data.url,
        duration: data.duration,
      };
    } catch (error) {
      if (attempt === retries) {
        return { success: false, error: (error as Error).message };
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

// --------------- LatentSync ---------------

/**
 * LatentSync: lip-sync audio onto a video (best quality, FREE on Modal $30/mo credits).
 * @param audioUrl  URL of the audio clip
 * @param videoUrl  URL of the video (face image or short video)
 */
export async function latentSyncLipSync(
  audioUrl: string,
  videoUrl: string,
  options?: { fps?: number; batch_size?: number }
): Promise<ModalResponse> {
  return callModal(MODAL_ENDPOINTS.latentSync, {
    audio_url: audioUrl,
    video_url: videoUrl,
    ...options,
  });
}

// --------------- MuseTalk ---------------

/**
 * MuseTalk: fallback lip-sync (~$0.001/video on Modal).
 */
export async function museTalkLipSync(
  audioUrl: string,
  videoUrl: string
): Promise<ModalResponse> {
  return callModal(MODAL_ENDPOINTS.museTalk, {
    audio_url: audioUrl,
    video_url: videoUrl,
  });
}

// --------------- Qwen3-TTS ---------------

/**
 * Qwen3-TTS: text-to-speech (alternative to DashScope).
 */
export async function qwen3Tts(
  text: string,
  voice?: string
): Promise<ModalResponse> {
  return callModal(MODAL_ENDPOINTS.qwen3Tts, { text, voice });
}

// --------------- Voice Clone ---------------

/**
 * Voice Clone: clone a voice from reference audio.
 */
export async function voiceClone(
  text: string,
  referenceAudioUrl: string
): Promise<ModalResponse> {
  return callModal(MODAL_ENDPOINTS.voiceClone, {
    text,
    reference_audio_url: referenceAudioUrl,
  });
}

// --------------- Combined / Fallback ---------------

/**
 * Best lip-sync: tries LatentSync first, falls back to MuseTalk.
 * Both are FREE on Modal $30/mo credits.
 */
export async function bestLipSync(
  audioUrl: string,
  videoUrl: string
): Promise<ModalResponse> {
  // Try LatentSync first (best quality)
  const result = await latentSyncLipSync(audioUrl, videoUrl);
  if (result.success) return result;

  console.warn(`[modal] LatentSync failed (${result.error}), trying MuseTalk...`);

  // Fallback to MuseTalk
  const fallback = await museTalkLipSync(audioUrl, videoUrl);
  if (fallback.success) return fallback;

  return {
    success: false,
    error: `Both LatentSync and MuseTalk failed. LatentSync: ${result.error}; MuseTalk: ${fallback.error}`,
  };
}
