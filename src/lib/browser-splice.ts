/**
 * browser-splice.ts
 *
 * Client-side video splicing using ffmpeg.wasm (WebAssembly).
 * Downloads base video + short clips, splices them at correct timestamps,
 * returns a Blob URL for the personalized video.
 *
 * Zero server cost — all processing happens in the browser.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading = false;

export interface ClipInfo {
  startTime: number;   // seconds — where to insert in base video
  endTime: number;     // seconds — where the clip ends
  clipUrl: string;     // URL of the short lip-synced video clip
}

export interface SpliceResult {
  videoBlobUrl: string;
  duration: number;
}

interface BaseSegment {
  kind: 'base';
  start: number;
  end: number;
}

interface ClipSegment {
  kind: 'clip';
  index: number;
}

type Segment = BaseSegment | ClipSegment;

/**
 * Initialize ffmpeg.wasm (lazy, singleton).
 * Uses CDN to avoid bundling the ~30MB WASM binary.
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    while (ffmpegLoading) await new Promise((r) => setTimeout(r, 100));
    return ffmpegInstance!;
  }

  ffmpegLoading = true;
  try {
    const ff = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd';

    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ff;
    return ff;
  } finally {
    ffmpegLoading = false;
  }
}

/**
 * Download a file from URL and return as Uint8Array.
 */
async function downloadFile(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Convert ffmpeg.wasm FileData to a Blob-compatible format.
 * readFile returns Uint8Array which may have SharedArrayBuffer backing.
 */
function toBlobParts(data: unknown): BlobPart[] {
  // ffmpeg readFile returns Uint8Array or string
  if (data instanceof Uint8Array) {
    // Copy to ensure we have a regular ArrayBuffer (not SharedArrayBuffer)
    return [new Uint8Array(data)];
  }
  if (typeof data === 'string') {
    return [data];
  }
  // Fallback
  return [new Uint8Array(data as ArrayBuffer)];
}

/**
 * Splice multiple clips into the base video at given timestamps.
 *
 * Strategy:
 * 1. Write base video and all clips to ffmpeg's virtual filesystem
 * 2. Extract base segments between clips
 * 3. Concatenate: [base_before_0] + [clip_0] + [base_between] + [clip_1] + ... + [base_after]
 * 4. Output as a single MP4
 */
export async function spliceClips(
  baseVideoUrl: string,
  clips: ClipInfo[],
  totalDuration: number
): Promise<SpliceResult> {
  const ff = await getFFmpeg();

  // Sort clips by start time
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);

  // Write base video
  const baseData = await downloadFile(baseVideoUrl);
  await ff.writeFile('base.mp4', baseData);

  // If no clips, just return the base video
  if (sorted.length === 0) {
    const outData = await ff.readFile('base.mp4');
    const blob = new Blob(toBlobParts(outData), { type: 'video/mp4' });
    return { videoBlobUrl: URL.createObjectURL(blob), duration: totalDuration };
  }

  // Download and write all clips
  const clipFileNames: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const clipData = await downloadFile(sorted[i].clipUrl);
    const clipName = `clip_${i}.mp4`;
    await ff.writeFile(clipName, clipData);
    clipFileNames.push(clipName);
  }

  // Build segments: base parts + clips interleaved
  const segments: Segment[] = [];
  let prevEnd = 0;

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];

    // Base segment before this clip
    if (clip.startTime > prevEnd + 0.05) {
      segments.push({ kind: 'base', start: prevEnd, end: clip.startTime });
    }

    // The clip itself
    segments.push({ kind: 'clip', index: i });
    prevEnd = clip.endTime;
  }

  // Remaining base after last clip
  if (prevEnd < totalDuration - 0.05) {
    segments.push({ kind: 'base', start: prevEnd, end: totalDuration });
  }

  // If no segments were created, just copy base
  if (segments.length === 0) {
    const outData = await ff.readFile('base.mp4');
    const blob = new Blob(toBlobParts(outData), { type: 'video/mp4' });
    return { videoBlobUrl: URL.createObjectURL(blob), duration: totalDuration };
  }

  // Extract base segments and rename clip files for concat
  const concatList: string[] = [];
  let segIdx = 0;

  for (const seg of segments) {
    if (seg.kind === 'base') {
      const segName = `seg_${segIdx}.mp4`;
      await ff.exec([
        '-i', 'base.mp4',
        '-ss', String(seg.start),
        '-to', String(seg.end),
        '-c:v', 'libx264', '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-avoid_negative_ts', 'make_zero',
        segName,
      ]);
      concatList.push(segName);
    } else {
      // Clip already written; rename to segment name for consistency
      const segName = `seg_${segIdx}.mp4`;
      await ff.exec(['-i', clipFileNames[seg.index], '-c', 'copy', segName]);
      concatList.push(segName);
    }
    segIdx++;
  }

  // Write concat list file
  const concatFile = 'concat.txt';
  const concatContent = concatList.map((f) => `file '${f}'`).join('\n');
  await ff.writeFile(concatFile, new TextEncoder().encode(concatContent));

  // Concat all segments
  await ff.exec([
    '-f', 'concat', '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'output.mp4',
  ]);

  // Read output
  const outData = await ff.readFile('output.mp4');
  const blob = new Blob(toBlobParts(outData), { type: 'video/mp4' });

  // Cleanup virtual FS
  try {
    for (const f of [...concatList, concatFile, 'base.mp4', 'output.mp4', ...clipFileNames]) {
      await ff.deleteFile(f).catch(() => {});
    }
  } catch {}

  return { videoBlobUrl: URL.createObjectURL(blob), duration: totalDuration };
}

/**
 * Quick check: is ffmpeg.wasm supported in this browser?
 */
export function isFFmpegSupported(): boolean {
  return typeof WebAssembly !== 'undefined';
}
