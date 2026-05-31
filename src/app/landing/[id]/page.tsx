'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Play, Volume2, VolumeX } from 'lucide-react';

export default function LandingPage({ params }: { params: { id: string } }) {
  const [lead, setLead] = useState<any>(null);
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [watchPct, setWatchPct] = useState(0);
  const [bgScrollPos, setBgScrollPos] = useState(0);
  const [websiteScreenshot, setWebsiteScreenshot] = useState('');

  const personVideoRef = useRef<HTMLVideoElement>(null);
  const bgContainerRef = useRef<HTMLDivElement>(null);
  const watchStarted = useRef(false);
  const scrollInterval = useRef<any>(null);

  const getLeadId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('leadId');
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const leadId = getLeadId();
        const { data: vData } = await supabase
          .from('video_recordings').select('*').eq('id', params.id).single();
        if (vData) {
          setVideo(vData);
          // Show CTA/calendly immediately if fields exist
          if (vData.cta_url || vData.calendar_embed_code) setShowCTA(true);
        }
        if (leadId) {
          const { data: lData } = await supabase
            .from('leads').select('*').eq('id', leadId).single();
          if (lData) {
            setLead(lData);
            // Fetch website screenshot
            if (lData.website) {
              const ws = lData.website.startsWith('http') ? lData.website : `https://${lData.website}`;
              try {
                const microlinkRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(ws)}&screenshot=true&meta=false`);
                const microlinkData = await microlinkRes.json();
                if (microlinkData?.data?.screenshot?.url) {
                  setWebsiteScreenshot(microlinkData.data.screenshot.url);
                }
              } catch {}
            }
          }
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [params.id, getLeadId]);

  useEffect(() => {
    const el = personVideoRef.current;
    if (!el || !video) return;
    const onPlay = () => { watchStarted.current = true; };
    const onTime = () => {
      const pct = el.duration ? Math.round((el.currentTime / el.duration) * 100) : 0;
      setWatchPct(pct);
      if (pct >= 10) setShowCTA(true); // Show CTA early after 10% watch
    };
    const onEnd = () => { setEnded(true); setPlaying(false); setShowCTA(true); if (scrollInterval.current) clearInterval(scrollInterval.current); };
    el.addEventListener('play', onPlay);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [video]);

  // Scroll the website screenshot downward when playing
  useEffect(() => {
    if (playing) {
      scrollInterval.current = setInterval(() => {
        setBgScrollPos(prev => Math.min(prev + 0.8, 100));
      }, 50);
    } else {
      if (scrollInterval.current) clearInterval(scrollInterval.current);
    }
    return () => { if (scrollInterval.current) clearInterval(scrollInterval.current); };
  }, [playing]);

  const handlePlay = () => {
    const el = personVideoRef.current;
    if (!el || playing) return;
    el.play();
    setPlaying(true);
    setEnded(false);
  };

  const prospectName = lead?.first_name || lead?.email?.split('@')[0] || 'there';
  const brandColor = video?.brand_color || '#4F46E5';
  const targetWebsite = lead?.website || '';

  // Editable text fields from video_recordings data (set via upload form)
  const headingText = video?.title?.split('|||')[1] || `Hey ${prospectName}`;
  const badgeText = video?.title?.split('|||')[0] || 'Personalized Video';
  const bodyText = video?.cta_description || `I made this personalized walkthrough for you${lead?.company ? ` at ${lead.company}` : ''}. Watch how we can help scale your outreach with our acquisition solutions.`;
  const brandTitle = video?.brand_title || 'Capital Acquisition';
  const brandSubtitle = video?.brand_subtitle || 'Outreach Suite';

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!video) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-slate-500">Video not found.</p></div>;

  // Circle sizes
  const circleSizeIdle = 110;
  const circleSizePlaying = 70;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f0f9ff 100%)' }}>
      <div className="max-w-6xl mx-auto min-h-screen flex flex-col md:flex-row items-center gap-6 md:gap-10 p-6 md:p-12">

        {/* ===== LEFT COLUMN: TEXT + CTA ===== */}
        <div className="flex-1 w-full max-w-lg space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold border border-indigo-100">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            {badgeText}
          </div>

          {/* Heading */}
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
            {headingText}
          </h1>

          {lead?.company && (
            <p className="text-lg text-slate-500 font-medium">
              A walkthrough for {lead.company}
            </p>
          )}

          {/* Body */}
          <p className="text-base text-slate-600 leading-relaxed">
            {bodyText}
          </p>

          {/* Brand */}
          <div className="flex items-center gap-3 pt-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: brandColor }}>
              {brandTitle.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{brandTitle}</p>
              <p className="text-xs text-slate-500">{brandSubtitle}</p>
            </div>
          </div>

          {/* CTA #1 — Below text */}
          {(showCTA || ended) && video?.cta_url && (
            <button
              onClick={() => window.open(video.cta_url, '_blank')}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg animate-fadeIn"
              style={{ backgroundColor: brandColor }}
            >
              {video.cta_text || 'Book a Call'} →
            </button>
          )}
        </div>

        {/* ===== RIGHT COLUMN: VIDEO (16:9) + CALENDLY ===== */}
        <div className="flex-1 w-full max-w-lg flex flex-col gap-4">

          {/* 16:9 Video Box — stays on right, doesn't move */}
          <div
            className="relative rounded-2xl overflow-hidden bg-black shadow-2xl w-full"
            style={{ aspectRatio: '16/9' }}
          >
            {/* LAYER 1: Prospect website screenshot (scrolls downward) */}
            <div
              ref={bgContainerRef}
              className="absolute inset-0 overflow-hidden"
            >
              {websiteScreenshot ? (
                <div
                  className="w-full bg-cover bg-top"
                  style={{
                    height: '200%',
                    backgroundImage: `url(${websiteScreenshot})`,
                    backgroundSize: '100% auto',
                    backgroundPosition: `50% ${bgScrollPos}%`,
                    transition: 'none',
                    filter: 'brightness(0.55) saturate(0.8)',
                  }}
                />
              ) : targetWebsite ? (
                <div
                  className="w-full"
                  style={{
                    height: '200%',
                    transform: `translateY(-${bgScrollPos / 2}%)`,
                  }}
                >
                  <iframe
                    src={targetWebsite.startsWith('http') ? targetWebsite : `https://${targetWebsite}`}
                    className="w-full h-[50%] border-0 pointer-events-none"
                    style={{ filter: 'brightness(0.55) saturate(0.8)' }}
                    sandbox="allow-same-origin"
                    loading="lazy"
                    title="Website"
                  />
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900" />
              )}
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
            </div>

            {/* LAYER 2: Person video (circular, stays inside 16:9 frame) */}
            <div
              className="absolute inset-0 z-10 w-full h-full cursor-pointer"
              onClick={playing ? undefined : handlePlay}
            >
              <div
                className="w-full h-full relative"
                style={{
                  display: 'flex',
                  alignItems: playing ? 'flex-end' : 'center',
                  justifyContent: playing ? 'flex-start' : 'center',
                  padding: playing ? '12px' : '0',
                  transition: 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  className="rounded-full overflow-hidden border-[3px] border-white/70 shadow-xl"
                  style={{
                    width: playing ? `${circleSizePlaying}px` : `${circleSizeIdle}px`,
                    height: playing ? `${circleSizePlaying}px` : `${circleSizeIdle}px`,
                    flexShrink: 0,
                    transition: 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <video
                    ref={personVideoRef}
                    src={video.video_url}
                    className="w-full h-full object-cover"
                    muted={muted}
                    playsInline
                    preload="auto"
                  />
                </div>
              </div>
            </div>

            {/* Play overlay */}
            {!playing && !ended && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/15 hover:bg-black/10 transition-all cursor-pointer"
                onClick={handlePlay}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:scale-110 transition-transform">
                    <Play className="w-7 h-7 text-indigo-600 ml-1" />
                  </div>
                  <span className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    Click to watch
                  </span>
                </div>
              </div>
            )}

            {/* Replay */}
            {ended && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 cursor-pointer"
                onClick={() => { const el = personVideoRef.current; if (el) { el.currentTime = 0; el.play(); setPlaying(true); setEnded(false); setBgScrollPos(0); } }}>
                <div className="flex flex-col items-center gap-1">
                  <Play className="w-8 h-8 text-white" />
                  <span className="text-white text-xs">Watch again</span>
                </div>
              </div>
            )}

            {/* Mute */}
            <button
              onClick={(e) => { e.stopPropagation(); if (personVideoRef.current) { personVideoRef.current.muted = !personVideoRef.current.muted; setMuted(personVideoRef.current.muted); } }}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:text-white"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Progress bar */}
            {playing && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
                <div className="h-full transition-all duration-300" style={{ width: `${watchPct}%`, backgroundColor: brandColor }} />
              </div>
            )}

            {/* Scrolling indicator */}
            {playing && !ended && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/50 text-[10px] animate-pulse">
                ↓ scrolling
              </div>
            )}
          </div>

          {/* CTA #2 — Below video */}
          {(showCTA || ended) && video?.cta_url && (
            <button
              onClick={() => window.open(video.cta_url, '_blank')}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg animate-fadeIn"
              style={{ backgroundColor: brandColor }}
            >
              {video.cta_text || 'Book a Call'} →
            </button>
          )}

          {/* Calendly — Below video section */}
          {(showCTA || ended) && video?.calendar_embed_code && (
            <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-fadeIn">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brandColor }} />
                <span className="text-xs font-semibold text-slate-700">Schedule a time to chat</span>
              </div>
              <div className="calend-embed" dangerouslySetInnerHTML={{ __html: video.calendar_embed_code }} />
            </div>
          )}

          {/* CTA #3 — Below calendly */}
          {(showCTA || ended) && video?.cta_url && (
            <button
              onClick={() => window.open(video.cta_url, '_blank')}
              className="w-full py-3 rounded-xl text-white font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow animate-fadeIn"
              style={{ backgroundColor: brandColor }}
            >
              {video.cta_text || 'Book a Call'} →
            </button>
          )}

          <p className="text-xs text-slate-400 text-center">Powered by Capital Acquisition</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .calend-embed iframe { width: 100% !important; min-height: 280px; }
        .calend-embed .calendly-inline-widget { min-width: auto !important; height: 280px !important; }
      `}</style>
    </div>
  );
}
