/**
 * VoiceKit Connector — Bridge between Outreach Suite and VoiceKit
 *
 * Two-phase pipeline (to avoid Next.js 30s timeout):
 *   Phase 1: startVkGeneration()  → returns { jobId }
 *   Phase 2: checkVkJob(jobId)    → returns { status, localPath }
 *            collectVkResult()    → uploads to Cloudinary + saves to Supabase
 *
 * Also provides synchronous generateVideoForLead() for CLI/one-shot use.
 */

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VkGenerationResult {
  videoUrl: string;
  gifUrl: string;
  videoPath: string;
  duration: number;
}

export interface VkStartResult {
  jobId: string;
  status: string;
}

export interface VkJobStatus {
  status: string;
  progress: number;
  message: string;
  localPath: string;
  firstName: string;
  company: string;
  error: string;
}

export interface VkGenerateOptions {
  firstName: string;
  company: string;
  leadId?: string;
  script?: string;
  voiceSample: string;
  templateVideo?: string;
  vkRoot?: string;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function getVkApiUrl(): string {
  return process.env.NEXT_PUBLIC_VK_API_URL || 'http://localhost:5000';
}

function getDefaultTemplateVideo(): string {
  if (process.env.VK_TEMPLATE_VIDEO) return process.env.VK_TEMPLATE_VIDEO;
  return path.resolve(process.cwd(), '..', 'voicekit', 'input', 'template.mp4');
}

function getDefaultVoiceSample(): string {
  if (process.env.VK_DEFAULT_VOICE_SAMPLE) return process.env.VK_DEFAULT_VOICE_SAMPLE;
  return path.resolve(process.cwd(), '..', 'voicekit', 'voice_sample', 'default.wav');
}

function getVkRoot(): string {
  if (process.env.VK_ROOT) return process.env.VK_ROOT;
  return path.resolve(process.cwd(), '..', 'voicekit');
}

// ── Phase 1: Start Generation ─────────────────────────────────────────────────

/**
 * Phase 1: Submit a personalized video generation job and return immediately.
 * Does NOT wait for completion.
 */
export async function startVkGeneration(options: VkGenerateOptions): Promise<VkStartResult> {
  const {
    firstName,
    company,
    script = defaultScript(firstName, company),
    voiceSample,
    templateVideo = getDefaultTemplateVideo(),
  } = options;

  const apiUrl = getVkApiUrl();

  // Don't validate files here — let the Flask API handle it
  // If voice sample is empty/missing, the Flask API will return an error
  // and the caller will catch it and degrade gracefully
  
  // Check if Flask API is reachable first (quick ping)
  try {
    const pingRes = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (!pingRes.ok) {
      throw new Error(`VK API not ready (status ${pingRes.status})`);
    }
  } catch (pingErr: any) {
    if (pingErr.name === 'TimeoutError' || pingErr.name === 'AbortError') {
      throw new Error('VK API not reachable — is python app.py running on port 5000?');
    }
    throw pingErr;
  }

  const response = await fetch(`${apiUrl}/api/generate/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script,
      voice_sample: voiceSample || '',
      template_video: templateVideo,
      first_name: firstName,
      company: company,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`VK API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return { jobId: data.job_id, status: data.status };
}

// ── Phase 2: Check / Collect ──────────────────────────────────────────────────

/**
 * Phase 2a: Check the status of a running VK job without waiting.
 */
export async function checkVkJob(jobId: string): Promise<VkJobStatus> {
  const apiUrl = getVkApiUrl();
  const response = await fetch(`${apiUrl}/api/generate/status/${jobId}`);

  if (!response.ok) {
    if (response.status === 404) {
      return {
        status: 'unknown', progress: 0, message: 'Job not found',
        localPath: '', firstName: '', company: '', error: 'Job not found on VK server',
      };
    }
    throw new Error(`VK status check failed (${response.status})`);
  }

  const data = await response.json();
  return {
    status: data.status,
    progress: data.progress,
    message: data.message,
    localPath: data.local_path || '',
    firstName: data.first_name || '',
    company: data.company || '',
    error: data.error || '',
  };
}

/**
 * Phase 2b: Given a completed job's local video path, upload to Cloudinary and
 * save metadata to Supabase. Returns the video_recordings ID.
 */
export async function collectVkResult(
  localPath: string,
  firstName: string,
  company: string,
  leadId?: string
): Promise<string> {
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error(`VK output video not found: ${localPath}`);
  }

  // Upload to Cloudinary
  const { videoUrl, gifUrl } = await uploadToCloudinary(localPath);

  // Save metadata to Supabase
  const { error, data } = await supabase
    .from('video_recordings')
    .insert({
      title: `VK for ${firstName} @ ${company}`,
      video_url: videoUrl,
      gif_url: gifUrl,
      cta_text: 'Book a 15-Min Call',
      cta_url: '',
      brand_color: '#4F46E5',
      lead_id: leadId || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Supabase save failed: ${error.message}`);
  return data.id;
}

// ── Deprecated: Synchronous (blocking) generation ─────────────────────────────

/**
 * Generate a personalized video synchronously (blocks until complete).
 * @deprecated Use startVkGeneration() + checkVkJob() + collectVkResult() instead
 *             to avoid function timeouts.
 */
export async function generateVideoForLead(
  options: VkGenerateOptions
): Promise<VkGenerationResult> {
  // Start the job
  const { jobId } = await startVkGeneration(options);

  // Poll until done (up to 10 min)
  const startTime = Date.now();
  const maxWait = 600_000;
  const pollInterval = 5_000;

  let localPath = '';
  let firstName = options.firstName;
  let company = options.company;

  while (true) {
    if (Date.now() - startTime > maxWait) {
      throw new Error('VK generation timed out after 10 minutes');
    }

    await sleep(pollInterval);
    const status = await checkVkJob(jobId);

    if (status.status === 'error') {
      throw new Error(`VK generation failed: ${status.error || status.message}`);
    }

    if (status.status === 'done') {
      localPath = status.localPath;
      firstName = status.firstName || firstName;
      company = status.company || company;
      break;
    }
  }

  // Collect the result
  const videoId = await collectVkResult(localPath, firstName, company, options.leadId);

  // Fetch the record to return URLs
  const { data: record } = await supabase
    .from('video_recordings')
    .select('*')
    .eq('id', videoId)
    .single();

  const duration = (Date.now() - startTime) / 1000;
  return {
    videoUrl: record?.video_url || '',
    gifUrl: record?.gif_url || '',
    videoPath: localPath,
    duration,
  };
}

// ── CLI Fallback (kept for CLI-only environments) ─────────────────────────────

/**
 * Generate via VK CLI subprocess (used when HTTP API is unavailable).
 */
export async function generateViaCli(
  vkRoot: string,
  params: {
    script: string; voiceSample: string; templateVideo: string;
    firstName: string; company: string; leadId?: string;
  }
): Promise<VkGenerationResult> {
  const runPy = path.join(vkRoot, 'run.py');

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    execFile(
      'python',
      [
        runPy,
        '--script', params.script,
        '--voice-sample', params.voiceSample,
        '--template', params.templateVideo,
        '--output', path.join(vkRoot, 'output', 'os_generated'),
      ],
      { cwd: vkRoot, timeout: 600_000 },
      async (error, stdout, stderr) => {
        if (error) {
          console.error('VK CLI error:', error, stderr);
          return reject(new Error(`VK CLI failed: ${error.message}`));
        }

        const lines = stdout.trim().split('\n');
        const videoLine = lines.filter(l => l.includes('.mp4')).pop();
        const videoPath = videoLine?.trim() || '';

        if (!videoPath || !fs.existsSync(videoPath)) {
          return reject(new Error('VK CLI produced no output video'));
        }

        const duration = (Date.now() - startTime) / 1000;

        try {
          const videoId = await collectVkResult(videoPath, params.firstName, params.company, params.leadId);
          const { data: record } = await supabase
            .from('video_recordings')
            .select('*')
            .eq('id', videoId)
            .single();

          resolve({
            videoUrl: record?.video_url || '',
            gifUrl: record?.gif_url || '',
            videoPath,
            duration,
          });
        } catch (uploadErr) {
          reject(uploadErr);
        }
      }
    );
  });
}

// ── Cloudinary ────────────────────────────────────────────────────────────────

async function uploadToCloudinary(localPath: string): Promise<{ videoUrl: string; gifUrl: string }> {
  const sigRes = await fetch('http://localhost:3000/api/cloudinary/signature');
  const sigData = await sigRes.json();
  if (!sigData.signature) throw new Error(sigData.error || 'Cloudinary auth failed');

  const fileBuffer = fs.readFileSync(localPath);
  const blob = new Blob([fileBuffer], { type: 'video/mp4' });
  const formData = new FormData();
  formData.append('file', blob, path.basename(localPath));
  formData.append('api_key', sigData.apiKey);
  formData.append('timestamp', sigData.timestamp);
  formData.append('signature', sigData.signature);
  formData.append('folder', sigData.folder);

  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${sigData.cloudName}/video/upload`,
    { method: 'POST', body: formData }
  );
  const cloudData = await cloudRes.json();
  if (!cloudData.secure_url) throw new Error(cloudData.error?.message || 'Cloudinary upload failed');

  const videoUrl = cloudData.secure_url;
  const gifUrl = videoUrl
    .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
    .replace(/\.[^/.]+$/, '.gif');

  return { videoUrl, gifUrl };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultScript(firstName: string, company: string): string {
  return `Hey ${firstName}, I wanted to reach out about ${company}. We have something I think you will find really useful for scaling your customer acquisition. Let me know if you want to learn more!`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
