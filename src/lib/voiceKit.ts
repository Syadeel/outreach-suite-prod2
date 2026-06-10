import { execFile } from 'child_process';
import path from 'path';
import { supabase } from './supabase';

/**
 * Generate a lip‑sync video for a lead using the local VoiceKit installation.
 *
 * @param lead An object containing at least `id`, `first_name`, `company`, and `script` (optional).
 * @returns The publicly accessible URL of the generated video (via Cloudinary).
 */
export async function generateVideoForLead(lead: any): Promise<string> {
  // Build a simple script using lead's name and company
  const script = `Hey ${lead.first_name || ''}, I wanted to reach out about ${lead.company || ''}...`;

  // Path to the VoiceKit `run.py` entry point
  const runPy = path.resolve(__dirname, '..', '..', '..', '..', 'voicekit', 'run.py');

  return new Promise<string>((resolve, reject) => {
    execFile('python', [runPy, '--script', script], { cwd: path.dirname(runPy) }, async (error, stdout, stderr) => {
      if (error) {
        console.error('VoiceKit execution error:', error, stderr);
        return reject(error);
      }
      // Assume the CLI prints the URL of the generated video on the last line
      const lines = stdout.trim().split('\n');
      const url = lines[lines.length - 1];

      // Store URL in DB for later retrieval
      const { error: dbErr } = await supabase.from('video_recordings').insert({
        title: `Lead ${lead.id} video`,
        video_url: url,
        gif_url: url.replace('.mp4', '.gif'), // simplistic conversion hint
        brand_logo_url: '',
        brand_color: '#4F46E5',
        cta_text: '',
        cta_url: ''
      });
      if (dbErr) {
        console.error('Failed to save video URL:', dbErr);
        return reject(dbErr);
      }
      resolve(url);
    });
  });
}
