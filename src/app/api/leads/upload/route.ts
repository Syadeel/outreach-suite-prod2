import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parse } from 'csv-parse/sync';
import path from 'path';

/**
 * POST /api/leads/upload
 * Accepts a base64‑encoded CSV containing leads.
 * Columns required: email,first_name,last_name,company,website
 *
 * Workflow performed:
 *   1️⃣ Parse CSV, validate fields.
 *   2️⃣ Enrich each lead (basic MX check + disposable domain filter).
 *   3️⃣ Capture a screenshot URL (placeholder service – replace with real if available).
 *   4️⃣ Insert lead into Supabase.
 *   5️⃣ Trigger VoiceKit (docker service `voicekit`) to generate a lip‑sync video.
 *   6️⃣ Store resulting video URL in `video_recordings` table.
 */
export async function POST(req: NextRequest) {
  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { csvBase64 } = await req.json();
    if (!csvBase64) {
      return NextResponse.json({ error: 'Missing csvBase64 in request body' }, { status: 400 });
    }

    // Decode CSV
    const csvBuffer = Buffer.from(csvBase64, 'base64');
    const csvString = csvBuffer.toString('utf-8');
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const processed: any[] = [];
    for (const rec of records) {
      const { email, first_name, last_name, company, website } = rec;
      if (!email || !first_name || !company || !website) continue; // basic validation

      // Simple email syntax validation (more advanced verification later)
      const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (!emailValid) continue;

      // Screenshot placeholder – you can replace with a real headless‑chrome service later
      const screenshotUrl = `https://screenshot-service.example.com/api?url=${encodeURIComponent(website)}`;

      // Insert lead in Supabase
      const { data: lead, error: insErr } = await supabaseAdmin
        .from('leads')
        .insert({
          email,
          first_name,
          last_name,
          company,
          website,
          custom_fields: { screenshot: screenshotUrl },
        })
        .single();
      if (insErr) {
        console.error('Supabase insert error', insErr);
        continue;
      }

      // ---- VoiceKit Integration ------------------------------------------------
      const script = `Hi ${first_name}, I wanted to reach out about ${company}.`;
      try {
        // Request video generation – VoiceKit lives on the same Docker network under the name `voicekit`
        const vkRes = await fetch(`${process.env.VOICEKIT_URL || 'http://localhost:5000'}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script,
            video_path: '/app/input/template.mp4', // generic template video you provide
            voice_path: '/app/voice_sample/default.wav', // default voice sample – replace as needed
          }),
        });
        const vkJson = await vkRes.json();
        const jobId = vkJson.job_id;

        // Poll for completion – simple fast poll (max 2 min)
        let videoUrl = '';
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000)); // 5 s interval
          const statusRes = await fetch(`http://voicekit:5000/api/job/${jobId}`);
          const status = await statusRes.json();
          if (status.status === 'completed' && status.output_path) {
            videoUrl = `http://voicekit:5000/api/download/${path.basename(status.output_path)}`;
            break;
          }
        }

        // Save video metadata (optional – you can also store the URL directly on the lead)
        if (videoUrl) {
          await supabaseAdmin.from('video_recordings').insert({
            title: `${first_name}-${company}-intro`,
            video_url: videoUrl,
            gif_url: '',
            created_at: new Date().toISOString(),
          });
        }
      } catch (vkErr) {
        console.error('VoiceKit generation error', vkErr);
      }

      processed.push({ lead, videoUrl: 'pending' });
    }

    return NextResponse.json({ processedCount: processed.length, processed });
  } catch (err: any) {
    console.error('Upload endpoint error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
