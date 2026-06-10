/**
 * VK Job Store — file-based persistent storage for VK generation jobs.
 *
 * Both VK Flask API and Outreach Suite run on the same Windows machine.
 * This module stores VK job state in a JSON file so the two-phase pipeline
 * survives server restarts.
 *
 * Production note: For multi-server deployment, replace this with a database table.
 */

import fs from 'fs';
import path from 'path';

const STORE_DIR = path.resolve(process.cwd(), '..', 'voicekit', 'logs');
const STORE_FILE = path.join(STORE_DIR, 'vk_jobs_store.json');

export interface VkJobEntry {
  /** Campaign Lead ID from Supabase */
  campaignLeadId: string;
  /** VK API job ID */
  jobId: string;
  /** Campaign step index this job is for */
  stepIndex: number;
  /** Current phase */
  phase: 'generating' | 'uploading' | 'done' | 'failed';
  /** Retry count (incremented on failure) */
  retryCount: number;
  /** Supabase video_recordings ID (set when video is ready) */
  videoId?: string;
  /** Error message if failed */
  error?: string;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

// In-memory cache (faster than reading file every time)
// null = not yet loaded; [] = empty store; [...] = loaded entries
let _cache: VkJobEntry[] | null = null;

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readStore(): VkJobEntry[] {
  ensureStoreDir();
  if (_cache !== null) return _cache;
  if (!fs.existsSync(STORE_FILE)) {
    _cache = [];
    return _cache;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    _cache = JSON.parse(raw) || [];
  } catch {
    _cache = [];
  }
  return _cache as VkJobEntry[];
}

function writeStore(entries: VkJobEntry[]): void {
  ensureStoreDir();
  _cache = entries;
  fs.writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Get a VK job entry by campaign lead ID and step index.
 */
export function getVkJob(campaignLeadId: string, stepIndex: number): VkJobEntry | undefined {
  const entries = readStore();
  return entries.find(
    (e) => e.campaignLeadId === campaignLeadId && e.stepIndex === stepIndex
  );
}

/**
 * Create or update a VK job entry.
 */
export function upsertVkJob(
  campaignLeadId: string,
  stepIndex: number,
  partial: Partial<VkJobEntry>
): VkJobEntry {
  const entries = readStore();
  const existing = entries.findIndex(
    (e) => e.campaignLeadId === campaignLeadId && e.stepIndex === stepIndex
  );

  const now = new Date().toISOString();
  const entry: VkJobEntry = {
    campaignLeadId,
    stepIndex,
    jobId: partial.jobId || '',
    phase: partial.phase || 'generating',
    retryCount: partial.retryCount ?? 0,
    videoId: partial.videoId,
    error: partial.error,
    createdAt: partial.createdAt || now,
    updatedAt: now,
  };

  if (existing >= 0) {
    entries[existing] = { ...entries[existing], ...entry, updatedAt: now };
  } else {
    entries.push({ ...entry, createdAt: now });
  }

  writeStore(entries);
  return existing >= 0 ? entries[existing] : entry;
}

/**
 * Remove VK job entries older than the given TTL (default 24 hours).
 */
export function cleanupVkJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const entries = readStore();
  const cutoff = Date.now() - maxAgeMs;
  const before = entries.length;
  _cache = entries.filter((e) => new Date(e.createdAt).getTime() > cutoff);
  writeStore(_cache);
  return before - _cache.length;
}
