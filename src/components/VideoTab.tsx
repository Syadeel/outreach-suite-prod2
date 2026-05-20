import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Video, Monitor, Camera, Play, Square, Upload, RefreshCw, Copy, CheckCircle } from 'lucide-react';
import { getEmailGifUrl } from '../lib/cloudinary';

export default function VideoTab() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingMode, setRecordingMode] = useState<'camera' | 'screen'>('camera');
  
  // Recorder states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);

  // Settings for branding
  const [title, setTitle] = useState('');
  const [ctaText, setCtaText] = useState('Book a 15-Min Call');
  const [ctaUrl, setCtaUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#4F46E5');
  const [calendarCode, setCalendarCode] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopAllStreams();
    }
  };

  useEffect(() => {
    fetchRecordings();
    return () => stopAllStreams();
  }, []);

  const fetchRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('video_recordings')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setRecordings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stopAllStreams = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Start Stream Preview
  const startPreview = async () => {
    stopAllStreams();
    try {
      let stream: MediaStream;
      if (recordingMode === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }
      
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play();
      }
    } catch (err) {
      console.error('Error starting media stream:', err);
      alert('Could not open camera or screen capture. Please grant permissions.');
    }
  };

  useEffect(() => {
    startPreview();
  }, [recordingMode]);

  // Start Recording
  const startRecording = () => {
    if (!streamRef.current) return;
    setRecordedChunks([]);
    setPreviewUrl(null);
    setMediaBlob(null);

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    const recorder = new MediaRecorder(streamRef.current, options);
    
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        setRecordedChunks((prev) => [...prev, event.data]);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      setMediaBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.muted = false;
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start(10); // Capture data chunks every 10ms
    setIsRecording(true);
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopAllStreams();
    }
  };

  // Upload to Cloudinary
  const handleUpload = async () => {
    if (!mediaBlob || !title) {
      alert('Please record a video and enter a title.');
      return;
    }

    setUploading(true);

    try {
      // 1. Get signed signature from backend API
      const sigRes = await fetch('/api/cloudinary/signature');
      const sigData = await sigRes.json();

      if (!sigData.signature) {
        throw new Error('Failed to fetch Cloudinary signed credentials');
      }

      // 2. Prepare FormData for direct upload
      const formData = new FormData();
      formData.append('file', mediaBlob);
      formData.append('api_key', sigData.apiKey);
      formData.append('timestamp', sigData.timestamp);
      formData.append('signature', sigData.signature);
      formData.append('folder', sigData.folder);
      formData.append('resource_type', 'video');

      // 3. Post direct to Cloudinary API
      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/video/upload`,
        { method: 'POST', body: formData }
      );
      const cloudData = await cloudRes.json();

      if (!cloudData.secure_url) {
        throw new Error('Failed to upload video to Cloudinary');
      }

      const videoUrl = cloudData.secure_url;
      // Transform extension to GIF dynamically using our rule
      const gifUrl = videoUrl
        .replace('/video/upload/', '/video/upload/so_0,eo_3,w_300,h_169,c_fill,f_gif/')
        .replace(/\.[^/.]+$/, '.gif');

      // 4. Save metadata to Supabase DB
      const { error } = await supabase.from('video_recordings').insert({
        title,
        video_url: videoUrl,
        gif_url: gifUrl,
        cta_text: ctaText,
        cta_url: ctaUrl,
        brand_color: brandColor,
        calendar_embed_code: calendarCode,
      });

      if (error) throw error;

      alert('Video saved successfully!');
      setTitle('');
      setCtaUrl('');
      setCalendarCode('');
      setPreviewUrl(null);
      setMediaBlob(null);
      fetchRecordings();
      startPreview();
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const copyEmailEmbedCode = (video: any) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const landingUrl = `${appUrl}/landing/${video.id}`;
    const gifUrl = video.gif_url;
    
    const htmlCode = `
<div style="margin: 20px 0; font-family: sans-serif;">
  <a href="${landingUrl}?leadId={{lead_id}}" target="_blank" style="text-decoration: none; display: inline-block;">
    <img src="${gifUrl}" alt="Personalized video" width="300" style="border-radius: 8px; border: 1px solid #e2e8f0; display: block;" />
    <div style="margin-top: 8px; color: #4F46E5; font-size: 14px; font-weight: bold;">
      ▶ Play Video ({{first_name}})
    </div>
  </a>
</div>
    `.trim();

    navigator.clipboard.writeText(htmlCode);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Video className="w-7 h-7 text-emerald-400" />
          VideoSpark Personalization Recorder
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Record personalized videos and upload them directly to Cloudinary. Generates instant GIF email embeds and conversion-optimized landing pages.
        </p>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Recorder Engine (Span 7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800/60 overflow-hidden relative">
            
            {/* Recorder Viewport */}
            <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden relative border border-slate-800 flex items-center justify-center">
              {previewUrl ? (
                <video src={previewUrl} controls className="w-full h-full object-cover" />
              ) : (
                <video ref={videoPreviewRef} playsInline className="w-full h-full object-cover transform -scale-x-100" />
              )}
              
              {/* Pulse recording badge */}
              {isRecording && (
                <div className="absolute inset-0 bg-emerald-600/25 border-2 border-emerald-500/25 rounded-2xl flex items-center justify-center shadow-md">
                  <span className="w-2.5 h-2.5 rounded-full bg-white record-pulse" />
                  RECORDING
                </div>
              )}
            </div>

            {/* Selection Options & Control Bar */}
            <div className="flex flex-wrap justify-between items-center mt-4 gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setRecordingMode('camera')}
                  className={`flex items-center gap-2 py-2 px-3.5 rounded-xl border text-xs font-semibold transition-all ${
                    recordingMode === 'camera'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                  disabled={isRecording}
                >
                  <Camera className="w-4 h-4" /> Camera
                </button>
                <button
                  onClick={() => setRecordingMode('screen')}
                  className={`flex items-center gap-2 py-2 px-3.5 rounded-xl border text-xs font-semibold transition-all ${
                    recordingMode === 'screen'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                  disabled={isRecording}
                >
                  <Monitor className="w-4 h-4" /> Screen Capture
                </button>
              </div>

              <div className="flex gap-2">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-red-600/10 active:scale-95"
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-95"
                  >
                    <Play className="w-4 h-4" /> Record
                  </button>
                )}

                {previewUrl && (
                  <button
                    onClick={() => {
                      setPreviewUrl(null);
                      setMediaBlob(null);
                      startPreview();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-850 text-slate-400 hover:bg-slate-850 rounded-xl text-xs"
                  >
                    Re-Record
                  </button>
                )}
              </div>
            </div>

            {/* Custom Pre-recorded Video File Upload (Sendr.ai flow) */}
            <div className="mt-4 p-3.5 rounded-xl border border-slate-800/60 bg-slate-900/10 hover:bg-slate-900/20 transition-all flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-white">Upload Pre-recorded Video</h4>
                  <p className="text-[10px] text-slate-500">Already recorded a pitch? Select it to generate landing pages.</p>
                </div>
              </div>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
                id="pitch-file-uploader"
              />
              <label
                htmlFor="pitch-file-uploader"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-xs font-semibold rounded-xl cursor-pointer transition-all active:scale-95 text-white-force"
              >
                Select MP4/WebM
              </label>
            </div>

          </div>
        </div>

        {/* Right Column: Branding Setup (Span 5) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/60 space-y-4 h-full">
            <h3 className="text-md font-semibold text-white">Video & Landing Page Settings</h3>
            
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Video Title *</label>
              <input
                type="text"
                placeholder="e.g. Personalized Pitch for {{company}}"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">CTA Button Text</label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brand Color Accent</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-12 h-11 p-1 rounded-xl glass-input cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">CTA Action Link</label>
              <input
                type="url"
                placeholder="https://yourdomain.com/pitch"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Calendly Embed Code (Optional)</label>
              <textarea
                placeholder="Paste your Calendly inline embed script code here..."
                value={calendarCode}
                onChange={(e) => setCalendarCode(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-xs h-20 resize-none"
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !previewUrl}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-all shadow-md active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Uploading to Cloudinary...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> Save Pitch & Generate Landing Page
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Saved Recordings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Your Saved Pitches</h3>

        {loading ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-slate-400">Loading library...</div>
        ) : recordings.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-slate-400 border border-dashed border-slate-800">
            No pitches recorded yet. Record your first video above!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((recording) => (
              <div key={recording.id} className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden flex flex-col justify-between group">
                <div className="relative aspect-video bg-slate-900 overflow-hidden border-b border-slate-800">
                  <video src={recording.video_url} className="w-full h-full object-cover" preload="metadata" />
                  <div className="absolute top-2 right-2 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded border border-slate-700">
                    GIF Ready
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <h4 className="font-semibold text-white text-sm truncate">{recording.title}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Recorded: {new Date(recording.created_at).toLocaleDateString()}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <a
                      href={`/landing/${recording.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2 text-center bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Preview Landing
                    </a>
                    
                    <button
                      onClick={() => copyEmailEmbedCode(recording)}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        copiedId === recording.id 
                          ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/10 animate-pulse text-white' 
                          : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/10 text-white'
                      }`}
                    >
                      {copiedId === recording.id ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" /> Copied HTML
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Email GIF
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
