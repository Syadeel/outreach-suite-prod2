'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Video, CheckCircle, Copy, ExternalLink, Loader,
  Sparkles, Mic, Play, Volume2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function VoiceKitTab() {
  // Classic mode state
  const [file, setFile] = useState<File | null>(null);
  const [script, setScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ videoUrl: string; gifUrl: string; duration: number } | null>(null);
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // V2 mode state
  const [mode, setMode] = useState<'classic' | 'v2'>('v2');
  const [v2Text, setV2Text] = useState('');
  const [v2Generating, setV2Generating] = useState(false);
  const [v2Status, setV2Status] = useState('');
  const [v2Step, setV2Step] = useState('');
  const [v2Result, setV2Result] = useState<{
    videoUrl: string; audioUrl: string; duration: number;
  } | null>(null);
  const [v2Error, setV2Error] = useState('');

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data } = await supabase
        .from('video_recordings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setVideos(data);
    } catch {}
  };

  // ---- Classic Mode Handler ----
  const handleGenerate = async () => {
    if (!file) { setError('Select a voice sample file first'); return; }
    setGenerating(true);
    setStatus('Saving voice sample...');
    setError('');
    setResult(null);

    try {
      const form = new FormData();
      form.append('file', file);
      if (script.trim()) form.append('script', script.trim());

      setStatus('Running VoiceKit (1-5 min)...');
      const res = await fetch('/api/voicekit/generate', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setResult(data);
      setStatus(`Done! (${data.duration}s)`);
      fetchVideos();
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    } finally {
      setGenerating(false);
    }
  };

  // ---- V2 Mode Handler ----
  const handleV2Generate = async () => {
    if (!v2Text.trim()) { setV2Error('Enter text to generate'); return; }
    setV2Generating(true);
    setV2Error('');
    setV2Result(null);
    setV2Step('Generating voice clone via Qwen3-TTS...');
    setV2Status('Generating voice clone...');

    try {
      // Step 1: Voice clone
      const vcRes = await fetch('/api/v2/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: v2Text }),
      });
      const vcData = await vcRes.json();
      if (!vcRes.ok) throw new Error(vcData.error || 'Voice clone failed');
      setV2Step('Voice clone ready. Running AI lip-sync...');
      setV2Status('Running LatentSync (~5 min)...');

      // Step 2: Spawn LatentSync
      const lsRes = await fetch('/api/v2/latentsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: vcData.audioUrl }),
      });
      const lsData = await lsRes.json();
      if (!lsRes.ok) throw new Error(lsData.error || 'LatentSync failed');

      setV2Result({
        videoUrl: lsData.videoUrl,
        audioUrl: vcData.audioUrl,
        duration: lsData.duration || vcData.duration,
      });
      setV2Status(`Done! (${(lsData.duration || vcData.duration).toFixed(1)}s)`);
      fetchVideos();
    } catch (err: any) {
      setV2Error(err.message);
      setV2Status('');
    } finally {
      setV2Generating(false);
    }
  };

  return (
    <div className="space-y-6 p-1">
      {/* Header with mode toggle */}
      <div className="flex items-center gap-3">
        <Video className="w-7 h-7 text-indigo-400" />
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight text-heading">VoiceKit</h2>
          <p className="text-slate-400 text-sm">Create AI-generated video outreach</p>
        </div>
        {/* Mode toggle */}
        <div className="flex bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
          <button
            onClick={() => setMode('classic')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'classic'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <Mic className="w-3.5 h-3.5 inline mr-1.5" />
            Voice Sample
          </button>
          <button
            onClick={() => setMode('v2')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'v2'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
            AI Avatar
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════ */}
      {/* V2 MODE — AI Avatar                   */}
      {/* ══════════════════════════════════════ */}
      {mode === 'v2' && (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-5">
          {/* Info banner */}
          <div className="flex items-start gap-3 bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-4">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-300">V2 AI Avatar Pipeline</p>
              <p className="text-xs text-emerald-400/60 mt-1">
                Uses your cloned voice (Qwen3-TTS) + AI lip-sync (LatentSync v1.6 on A10G).
                No voice sample needed — your voice is already configured.
              </p>
            </div>
          </div>

          {/* Text Input */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Script
            </label>
            <textarea
              value={v2Text}
              onChange={(e) => { setV2Text(e.target.value); setV2Error(''); }}
              placeholder="Enter the text you want your AI avatar to say..."
              className="w-full px-4 py-3 rounded-xl glass-input text-sm h-28 resize-y"
              disabled={v2Generating}
              maxLength={500}
            />
            <p className="text-[10px] text-slate-500 mt-1.5">{v2Text.length}/500 characters</p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleV2Generate}
            disabled={v2Generating || !v2Text.trim()}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-base font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/10"
          >
            {v2Generating ? (
              <><Loader className="w-5 h-5 animate-spin" /> {v2Status || 'Generating...'}</>
            ) : (
              <><Play className="w-5 h-5" /> Generate AI Avatar Video</>
            )}
          </button>

          {/* Progress */}
          {v2Generating && (
            <div className="space-y-3">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <div className="text-center text-sm text-emerald-400">
                <span className="inline-flex items-center gap-2">
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  {v2Step}
                </span>
              </div>
              <div className="text-center text-[10px] text-slate-500">
                Voice clone ~1 min + AI lip-sync ~5 min on A10G GPU
              </div>
            </div>
          )}

          {/* Error */}
          {v2Error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-400">
              {v2Error}
            </div>
          )}

          {/* Result */}
          {v2Result && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Video generated — {v2Result.duration?.toFixed(1)}s
              </div>
              {v2Result.audioUrl && (
                <div className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  <audio src={v2Result.audioUrl} controls className="flex-1 h-8" />
                </div>
              )}
              <video src={v2Result.videoUrl} controls className="w-full rounded-lg max-h-72" />
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(v2Result.videoUrl)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Video URL
                </button>
                <button
                  onClick={() => window.open(v2Result.videoUrl, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Video
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* CLASSIC MODE — Voice Sample Upload      */}
      {/* ══════════════════════════════════════ */}
      {mode === 'classic' && (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-5">
          <h3 className="text-sm font-bold text-heading">Step 1: Upload Voice Sample</h3>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl p-8 text-center cursor-pointer transition-all"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); setError(''); }
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            {file ? (
              <div>
                <p className="text-sm font-semibold text-emerald-400">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-slate-300">Upload a voice recording</p>
                <p className="text-xs text-slate-500 mt-1">.mp3 or .wav</p>
              </div>
            )}
          </div>

          <h3 className="text-sm font-bold text-heading pt-2">Step 2: Script (Optional)</h3>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Leave blank for auto-generated. Or write your own..."
            className="w-full px-4 py-3 rounded-xl glass-input text-sm h-24 resize-y"
          />

          <h3 className="text-sm font-bold text-heading pt-2">Step 3: Generate</h3>
          <button
            onClick={handleGenerate}
            disabled={!file || generating}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-base font-bold rounded-xl transition-all flex items-center justify-center gap-3"
          >
            {generating ? (
              <><Loader className="w-5 h-5 animate-spin" /> {status}</>
            ) : (
              <><Video className="w-5 h-5" /> Generate Video</>
            )}
          </button>

          {generating && (
            <div className="space-y-3">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <div className="text-center text-sm text-indigo-400">
                <span className="inline-flex items-center gap-2">
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  {status || 'Starting...'}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-400">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Video generated in {result.duration}s
              </div>
              <video src={result.videoUrl} controls className="w-full rounded-lg max-h-64" />
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(result.videoUrl)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy URL
                </button>
                <button
                  onClick={() => window.open(result.videoUrl, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Videos (both modes) */}
      {videos.length > 0 && (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-5 space-y-3">
          <h3 className="text-sm font-bold text-heading">Recent Videos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {videos.map((v: any) => (
              <div key={v.id} className="bg-slate-950/40 rounded-xl p-3 border border-slate-900/60">
                <video src={v.video_url} className="w-full rounded-lg mb-2 max-h-32 object-cover" />
                <p className="text-xs text-slate-400 truncate">{v.title}</p>
                <p className="text-[10px] text-slate-600">
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
