/**
 * VK Jobs API — returns the current VK job store contents.
 * Used by the VideoTab VK Job Logs widget.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Use process.cwd() which always points to the project root regardless of __dirname
const STORE_FILE = path.resolve(
  process.cwd(),
  '..', 'voicekit', 'logs', 'vk_jobs_store.json'
);

export async function GET() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return NextResponse.json({ jobs: [] });
    }

    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const entries = JSON.parse(raw);

    // Sort newest first, limit to 50
    const sorted = (entries || [])
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50);

    return NextResponse.json({ jobs: sorted });
  } catch (err: any) {
    return NextResponse.json({ jobs: [], error: err.message });
  }
}
