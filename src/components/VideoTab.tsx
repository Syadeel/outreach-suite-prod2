'use client';

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Video, Upload, Copy, CheckCircle, Link as LinkIcon, Trash2, ExternalLink, Settings, Eye, RefreshCw, Wand2 } from 'lucide-react';

const ensureHttpPrefix = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export default function VideoTab() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload form
  const [title, setTitle] = useState('');
  const [ctaText, setCtaText] = useState('Book a 15-Min Call');
  const [ctaUrl, setCtaUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#4F46E5');
  const [calendarCode, setCalendarCode] = useState('');
  const [brandTitle, setBrandTitle] = useState('Capital Acquisition');
  const [badgeText, setBadgeText] = useState('Personalized Video Walkthrough');
  const [ctaDescription, setCtaDescription] = useState('If our acquisition solutions make sense for you, schedule a quick discovery call below:');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // LP templates
  const [lpTemplates, setLpTemplates] = useState<any[]>([]);
  const [selectedLpTemplateId, setSelectedLpTemplateId] = useState('');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedGifId, setCopiedGifId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecordings();
    fetchLpTemplates();
    fetchLeads();
  }, []);

  const fetchLpTemplates = async () => {
    try {
      let list: any[] = [];
      const stored = localStorage.getItem('os_landing_page_templates');
      if (stored) list = JSON.parse(stored);
      if (list.length === 0 && supabase) {
        const { data } = await supabase.from('landing_page_templates').select('*').order('created_at', { ascending: false });
        if (data) list = data;
      }
      setLpTemplates(list);
    } catch (e) { console.error(e); }
  };

  const handleLoadLpTemplate = (templateId: string) => {
    setSelectedLpTemplateId(templateId);
    if (!templateId) return;
    const selected = lpTemplates.find(t => t.id === templateId);
    if (selected) {
      setTitle(selected.video_title || '');
      setBrandTitle(selected.brand_title || 'Capital Acquisition');
      setBadgeText(selected.badge_text || 'Personalized Video Walkthrough');
      setCtaText(selected.cta_text || 'Book a 15-Min Call');
      setCtaUrl(selected.cta_url || '');
      setBrandColor(selected.brand_color || '#4F46E5');
      setCalendarCode(selected.calendar_embed_code || '');
      setCtaDescription(selected.cta_description || '');
      setWebsiteUrl(selected.website_url || '');
    }
  };

  const fetchRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('video_recordings')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setRecordings(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchLeads = async () => {
    try {
      const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (data) setLeads(data);
    } catch (err) { console.error(err); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!mediaBlob || !title) {
      alert('Please select a video file and enter a title.');
      return;
    }
    setUploading(true);
    try {
      // 1. Get signed signature from backend
      const sigRes = await fetch('/api/cloudinary/signature');
      const sigData = await sigRes.json();
      if (!sigData.signature) throw new Error(sigData.error || 'Failed to get Cloudinary credentials');

      // 2. Direct upload to Cloudinary
      const formData = new FormData();
      formData.append('file', mediaBlob);
      formData.append('api_key', sigData.apiKey);
      formData.append('timestamp', sigData.timestamp);
      formData.append('signature', sigData.signature);
      formData.append('folder', sigData.folder);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/video/upload`,
        { method: 'POST', body: formData }
      );
      const cloudData = await cloudRes.json();
      if (!cloudData.secure_url) throw new Error(cloudData.error?.message || 'Upload failed');

      const videoUrl = cloudData.secure_url;
      const gifUrl = videoUrl
        .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
        .replace(/\.[^/.]+$/, '.gif');

      // 3. Save metadata
      const { error } = await supabase.from('video_recordings').insert({
        title: title.trim(),
        video_url: videoUrl,
        gif_url: gifUrl,
        cta_text: ctaText,
        cta_url: ctaUrl ? ensureHttpPrefix(ctaUrl) : '',
        brand_color: brandColor,
        calendar_embed_code: calendarCode,
      });
      if (error) throw error;

      alert('Video uploaded successfully!');
      resetForm();
      fetchRecordings();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setCtaUrl('');
    setCalendarCode('');
    setPreviewUrl(null);
    setMediaBlob(null);
    setShowUploader(false);
  };

  const copyEmbedCode = async (video: any, lead?: any) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const landingUrl = `${appUrl}/landing/${video.id}?leadId=${lead?.id || '{{lead_id}}'}`;
    // Direct Cloudinary GIF — no redirect, works in Gmail
    const gifUrl = video.video_url
      ? video.video_url
          .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
          .replace(/\.[^/.]+$/, '.gif')
      : `${appUrl}/api/cloudinary/personalized-gif?videoId=${video.id}&website=${encodeURIComponent(lead?.website || '{{website}}')}`;

    const htmlCode = `
<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="margin:24px 0;font-family:Helvetica,Arial,sans-serif">
  <tr>
    <td align="center">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
        <tr>
          <td style="border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <a href="${landingUrl}" target="_blank" style="text-decoration:none;display:block;">
              <img src="${gifUrl}" alt="Personalized video for ${lead?.first_name || 'you'}" width="320" style="display:block;border:0;outline:none;max-width:100%;" />
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background:linear-gradient(180deg,transparent,rgba(0,0,0,0.8));">
                <tr>
                  <td align="center" style="padding:12px 16px;">
                    <div style="font-size:28px;line-height:1.2;">▶</div>
                    <div style="font-size:14px;font-weight:700;color:#ffffff;">Watch personalized video →</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">A walkthrough for ${lead?.first_name || 'you'} @ ${lead?.company || 'your company'}</div>
                  </td>
                </tr>
              </table>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([htmlCode], { type: 'text/plain' }),
          'text/html': new Blob([htmlCode], { type: 'text/html' })
        })
      ]);
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = htmlCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const copyLandingLink = (video: any, lead?: any) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const url = `${appUrl}/landing/${video.id}?leadId=${lead?.id || '{{lead_id}}'}`;
    navigator.clipboard.writeText(url);
    setCopiedId(url);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const calculateTotalViews = (video: any) => {
    if (!video.views) return 0;
    return video.views.reduce((sum: number, v: any) => sum + (v.watch_percentage > 50 ? 1 : 0), 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-heading flex items-center gap-2">
            <Video className="w-5 h-5 text-indigo-400" />
            Video Library
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Upload pre-recorded videos for personalized landing pages</p>
        </div>
        <button
          onClick={() => setShowUploader(!showUploader)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all"
        >
          <Upload className="w-4 h-4" />
          {showUploader ? 'Close' : 'Upload Video'}
        </button>
      </div>

      {/* Upload Panel */}
      {showUploader && (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-5">
          <h3 className="text-sm font-bold text-heading flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-amber-400" />
            Upload a Pre-Recorded Video
          </h3>

          {/* Template loader */}
          {lpTemplates.length > 0 && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Load from Landing Page Template</label>
              <select
                value={selectedLpTemplateId}
                onChange={(e) => handleLoadLpTemplate(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading"
              >
                <option value="">— Select template —</option>
                {lpTemplates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.brand_title || t.video_title || t.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* File picker */}
          <div
            className="border-2 border-dashed border-slate-700/60 rounded-xl p-8 text-center hover:border-indigo-500/40 transition-colors cursor-pointer bg-slate-900/30"
            onClick={() => document.getElementById('video-file-input')?.click()}
          >
            <input
              id="video-file-input"
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mkv"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewUrl ? (
              <div className="space-y-3">
                <video src={previewUrl} controls className="max-h-48 rounded-lg mx-auto" />
                <p className="text-xs text-emerald-400">Video loaded. Ready to upload.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-400">Click to select an MP4 or WebM file</p>
                <p className="text-xs text-slate-600">Pre-recorded walkthroughs, demo videos, or personal messages (MP4 / WebM / MOV / MKV)</p>
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Video Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Personalized walkthrough for {{first_name}}"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Brand Title</label>
              <input value={brandTitle} onChange={(e) => setBrandTitle(e.target.value)} placeholder="Capital Acquisition"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Badge Text</label>
              <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Personalized Video"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">CTA Text</label>
              <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Book a Call"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">CTA URL</label>
              <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://calendly.com/..."
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Brand Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer bg-transparent border border-slate-700" />
                <span className="text-xs text-slate-500">{brandColor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">CTA Description</label>
              <input value={ctaDescription} onChange={(e) => setCtaDescription(e.target.value)}
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Website URL Preview</label>
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="stripe.com"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Calendar Embed Code (HTML)</label>
              <textarea value={calendarCode} onChange={(e) => setCalendarCode(e.target.value)} rows={2}
                placeholder="<div class='calendly-inline-widget'...></div>"
                className="w-full glass-input rounded-lg px-3 py-2 text-xs text-heading font-mono" />
            </div>
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || !mediaBlob || !title}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading to Cloudinary...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload to Cloudinary</>
            )}
          </button>
        </div>
      )}

      {/* Video Library */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
        <div className="p-4 border-b border-slate-800/60 flex justify-between items-center">
          <h3 className="text-sm font-bold text-heading">Saved Videos</h3>
          <button onClick={fetchRecordings} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800/40 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading...</div>
        ) : recordings.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Video className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-sm">No videos uploaded yet</p>
            <p className="text-xs mt-1 text-slate-600">Upload your first pre-recorded video above</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {recordings.map((video) => (
              <div key={video.id} className="p-4 hover:bg-slate-800/20 transition-colors">
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-32 h-20 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative group">
                    <video src={video.video_url} className="w-full h-full object-cover" />
                    <a href={`/landing/${video.id}`} target="_blank"
                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-5 h-5 text-heading" />
                    </a>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-heading truncate">{video.title?.split('|||')[0] || 'Untitled'}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Uploaded {new Date(video.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {calculateTotalViews(video)} views
                      </span>
                      {video.cta_text && (
                        <span className="text-[10px] text-indigo-400">{video.cta_text}</span>
                      )}
                    </div>

                  {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => copyLandingLink(video)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/60 hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-400 text-[10px] font-medium transition-all"
                      >
                        {copiedId === video.id ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <LinkIcon className="w-3 h-3" />}
                        {copiedId === video.id ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        onClick={() => {
                          const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                          window.open(`${appUrl}/landing/${video.id}`, '_blank');
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/60 hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400 text-[10px] font-medium transition-all"
                      >
                        <ExternalLink className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this video? This cannot be undone.')) return;
                          await supabase.from('video_recordings').delete().eq('id', video.id);
                          fetchRecordings();
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/60 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 text-[10px] font-medium transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Embed codes / Copy for Gmail */}
                  <div className="shrink-0 flex flex-col gap-1.5">
                    <button
                      onClick={() => copyEmbedCode(video)}
                      className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 text-[10px] font-semibold rounded-lg transition-all"
                      title="Copy email embed code (HTML)"
                    >
                      {copiedId === video.id ? 'Copied!' : 'Copy HTML for Email'}
                    </button>
                    <button
                      onClick={() => {
                        const appUrlLocal = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                        const gifUrl = video.video_url
                          ? video.video_url
                              .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
                              .replace(/\.[^/.]+$/, '.gif')
                          : `${appUrlLocal}/api/cloudinary/personalized-gif?videoId=${video.id}&website={{website}}`;
                        navigator.clipboard.writeText(gifUrl);
                        setCopiedGifId(video.id);
                        setTimeout(() => setCopiedGifId(null), 1500);
                      }}
                      className="px-3 py-1.5 bg-slate-800/60 text-slate-400 hover:text-sky-400 border border-slate-700/60 text-[10px] font-medium rounded-lg transition-all"
                    >
                      {copiedGifId === video.id ? 'Copied!' : 'Copy GIF URL'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leads + Embed Matrix */}
      {leads.length > 0 && recordings.length > 0 && (
        <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800/60">
            <h3 className="text-sm font-bold text-heading">Per-Lead Embed Codes</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Copy personalized landing page links for each lead</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Lead</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Landing Page Link</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Copy HTML for Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {leads.slice(0, 50).map((lead) => {
                  const video = recordings[0];
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                  const landingUrl = `${appUrl}/landing/${video.id}?leadId=${lead.id}`;
                  return (
                    <tr key={lead.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-heading">{lead.first_name} {lead.last_name}</td>
                      <td className="px-4 py-3 text-slate-400">{lead.company}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input type="text" readOnly value={landingUrl}
                            className="bg-slate-900 border border-slate-700 text-[10px] rounded px-2 py-1 w-44 text-slate-400" />
                          <button onClick={() => copyLandingLink(video, lead)}
                            className="text-slate-500 hover:text-emerald-400">
                            {copiedId === landingUrl ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => copyEmbedCode(video, lead)}
                          className="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg transition-all"
                        >
                          Copy HTML
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
