/**
 * VoiceKit Generate API — dead-simple: upload MP3, get video back.
 * 
 * POST /api/voicekit/generate
 *   FormData:
 *     file   — .mp3 or .wav voice sample (required)
 *     script — optional text to speak (auto-generated if empty)
 * 
 * Returns:
 *   { videoUrl, gifUrl, duration }
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

const VK_ROOT = path.resolve(process.cwd(), '..', 'voicekit');
const VOICE_DIR = path.join(VK_ROOT, 'voice_sample');
const OUTPUT_DIR = path.join(VK_ROOT, 'output');
const TEMPLATE_VIDEO = path.join(VK_ROOT, 'input', 'sendr zoomed.mp4');

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Ensure dirs
    await mkdir(VOICE_DIR, { recursive: true });
    await mkdir(OUTPUT_DIR, { recursive: true });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const script = (formData.get('script') as string || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'Upload a .mp3 or .wav voice sample' }, { status: 400 });
    }

    // Save uploaded voice sample
    const ext = path.extname(file.name) || '.mp3';
    const voiceName = `upload_${Date.now()}${ext}`;
    const voicePath = path.join(VOICE_DIR, voiceName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(voicePath, buffer);

    const finalScript = script || `Hey there! I wanted to reach out and see if you would be open to a quick chat. Let me know what you think!`;

    // Find template video (fallback chain)
    let templatePath = TEMPLATE_VIDEO;
    if (!fs.existsSync(templatePath)) {
      const inputDir = path.join(VK_ROOT, 'input');
      if (fs.existsSync(inputDir)) {
        const files = fs.readdirSync(inputDir).filter(f => f.match(/\.(mp4|mov|avi|mkv)$/i)).sort((a, b) => {
          // Prefer MP4 over other formats
          if (a.endsWith('.mp4') && !b.endsWith('.mp4')) return -1;
          if (!a.endsWith('.mp4') && b.endsWith('.mp4')) return 1;
          return 0;
        });
        if (files.length > 0) templatePath = path.join(inputDir, files[0]);
      }
    }

    // Run VK Python pipeline
    const outputName = `vk_${Date.now()}`;
    const args = [
      path.join(VK_ROOT, 'run.py'),
      '--voice', voicePath,
      '--script', finalScript,
      '--output', path.join(OUTPUT_DIR, outputName),
    ];
    if (fs.existsSync(templatePath)) {
      args.push('--video', templatePath);
    }

    console.log(`Running: python ${args.join(' ')}`);
    const { stdout, stderr } = await execFileAsync('python', args, {
      cwd: VK_ROOT,
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    // Find output video from stdout (last line with .mp4)
    const lines = stdout.split('\n').filter(l => l.trim());
    const videoLine = lines.filter(l => l.includes('.mp4')).pop();
    let videoPath = videoLine?.trim() || '';

    if (!videoPath || !fs.existsSync(videoPath)) {
      // Search output directory
      const outputFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.mp4'));
      if (outputFiles.length > 0) {
        videoPath = path.join(OUTPUT_DIR, outputFiles.sort().reverse()[0]);
      }
    }

    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error(`No output video found\nStdout: ${stdout.slice(0, 500)}\nStderr: ${stderr.slice(0, 500)}`);
    }

    // Upload to Cloudinary via signature
    const sigRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cloudinary/signature`);
    const sigData = await sigRes.json();
    if (!sigData.signature) throw new Error('Cloudinary auth failed');

    const fileBuffer = fs.readFileSync(videoPath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    const uploadForm = new FormData();
    uploadForm.append('file', blob, path.basename(videoPath));
    uploadForm.append('api_key', sigData.apiKey);
    uploadForm.append('timestamp', sigData.timestamp);
    uploadForm.append('signature', sigData.signature);
    uploadForm.append('folder', sigData.folder);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sigData.cloudName}/video/upload`,
      { method: 'POST', body: uploadForm }
    );
    const cloudData = await cloudRes.json();
    if (!cloudData.secure_url) throw new Error(cloudData.error?.message || 'Cloudinary upload failed');

    const videoUrl = cloudData.secure_url;
    const gifUrl = videoUrl
      .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
      .replace(/\.[^/.]+$/, '.gif');

    // Save to Supabase
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    await supabaseAdmin.from('video_recordings').insert({
      title: `VoiceKit ${new Date().toLocaleDateString()}`,
      video_url: videoUrl,
      gif_url: gifUrl,
      cta_text: 'Book a Call',
      cta_url: '',
      brand_color: '#4F46E5',
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`VoiceKit done in ${duration}s: ${videoUrl}`);

    return NextResponse.json({
      videoUrl,
      gifUrl,
      duration: parseFloat(duration),
      localPath: videoPath,
    });
  } catch (err: any) {
    console.error('VoiceKit generate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
