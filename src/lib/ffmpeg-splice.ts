/**
 * FFmpeg Video Splicing Module for Outreach Suite
 *
 * Works with system ffmpeg (Oracle/Local) or ffmpeg-static (if available).
 * On Vercel, this module is NOT used — the pipeline uses DashScope-only flow.
 * On Oracle/local, this module handles per-lead segment replacement.
 *
 * Dependencies: fluent-ffmpeg
 * System requirement: ffmpeg must be installed (apt install ffmpeg / brew install ffmpeg)
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Try to use ffmpeg-static if available, otherwise rely on system ffmpeg
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
} catch {
  // ffmpeg-static not available — use system ffmpeg
}

const TEMP_BASE = path.join(os.tmpdir(), 'outreach-splice');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function createTempDir(): Promise<string> {
  const dir = path.join(TEMP_BASE, crypto.randomUUID());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// ----------------------------------------------------------------
// downloadFile — fetch a remote file into a Buffer
// ----------------------------------------------------------------
export async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// ----------------------------------------------------------------
// getVideoDuration — probe video for duration in seconds
// ----------------------------------------------------------------
export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      const duration = metadata.format.duration;
      if (duration == null) return reject(new Error('No duration found'));
      resolve(duration);
    });
  });
}

// ----------------------------------------------------------------
// extractSegment — cut a segment from a video file
// ----------------------------------------------------------------
export function extractSegment(
  inputPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(startSec)
      .duration(durationSec)
      .outputOptions(['-c copy', '-avoid_negative_ts 1'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Extract failed: ${err.message}`)))
      .run();
  });
}

// ----------------------------------------------------------------
// concatVideos — concatenate multiple video files into one
// ----------------------------------------------------------------
export function concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (inputPaths.length === 0) return reject(new Error('No inputs'));
    if (inputPaths.length === 1) {
      return fs.copyFile(inputPaths[0], outputPath).then(() => resolve(outputPath)).catch(reject);
    }

    const command = ffmpeg();
    for (const input of inputPaths) command.input(input);

    command
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Concat failed: ${err.message}`)))
      .mergeToFile(outputPath, path.dirname(outputPath));
  });
}

// ----------------------------------------------------------------
// spliceVideoSegments — replace time ranges in base video with clips
//
// segments: Array of { startSec, endSec, clipPath }
//   - startSec/endSec define the range in the BASE video to replace
//   - clipPath is the personalized clip to insert at that position
//
// Returns: path to the final spliced video
// ----------------------------------------------------------------
export async function spliceVideoSegments(
  baseVideoPath: string,
  segments: Array<{ startSec: number; endSec: number; clipPath: string }>,
  outputPath: string
): Promise<string> {
  const tempDir = await createTempDir();

  try {
    if (segments.length === 0) {
      await fs.copyFile(baseVideoPath, outputPath);
      return outputPath;
    }

    const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
    const baseDuration = await getVideoDuration(baseVideoPath);

    // Build ordered list: base pieces interleaved with clips
    const ordered: Array<{ type: 'base'; start: number; end: number } | { type: 'clip'; path: string }> = [];
    let cursor = 0;

    for (const seg of sorted) {
      // Base piece before this segment
      if (seg.startSec > cursor) {
        ordered.push({ type: 'base', start: cursor, end: seg.startSec });
      }
      // The personalized clip
      ordered.push({ type: 'clip', path: seg.clipPath });
      cursor = seg.endSec;
    }

    // Remaining base after last segment
    if (cursor < baseDuration) {
      ordered.push({ type: 'base', start: cursor, end: baseDuration });
    }

    // Export each item to a temp file
    const partFiles: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const partPath = path.join(tempDir, `part_${String(i).padStart(4, '0')}.mp4`);

      if (item.type === 'base') {
        await extractSegment(baseVideoPath, item.start, item.end - item.start, partPath);
      } else {
        await fs.copyFile(item.path, partPath);
      }
      partFiles.push(partPath);
    }

    // Concatenate all parts
    await concatVideos(partFiles, outputPath);
    return outputPath;
  } finally {
    await cleanupTempDir(tempDir);
  }
}
