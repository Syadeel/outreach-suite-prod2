'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX,
  ArrowRight, Calendar, Quote, ChevronDown,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Lead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  website: string | null;
  stage: string;
}

interface Video {
  id: string;
  title: string;
  video_url: string;
  gif_url?: string;
  brand_logo_url?: string;
  brand_color: string;
  cta_text: string | null;
  cta_url: string | null;
  cta_description?: string;
  calendar_embed_code: string | null;
  brand_title?: string | null;
  brand_subtitle?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Tiny helpers                                                       */
/* ------------------------------------------------------------------ */
function extractBadges(title: string): { badge: string; heading: string } {
  const parts = title.split('|||');
  if (parts.length >= 2) return { badge: parts[0].trim(), heading: parts[1].trim() };
  return { badge: 'Personalized Video', heading: title };
}

function initials(str: string) {
  return str.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function LandingPage({ params }: { params: { id: string } }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  // video player state
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [watchPct, setWatchPct] = useState(0);
  const [hoveringVideo, setHoveringVideo] = useState(false);

  // website screenshot
  const [websiteScreenshot, setWebsiteScreenshot] = useState('');
  const [bgScrollPos, setBgScrollPos] = useState(0);

  // UI
  const [ctaVisible, setCtaVisible] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const watchStarted = useRef(false);
  const scrollRaf = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const getLeadId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('leadId');
  }, []);

  /* ---------- fetch data ---------- */
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        // video
        const { data: v } = await supabase
          .from('video_recordings').select('*').eq('id', params.id).single();
        if (cancelled) return;
        if (v) {
          setVideo(v as Video);
          if (v.cta_url || v.calendar_embed_code) setCtaVisible(true);
        }

        // lead
        const leadId = getLeadId();
        if (leadId) {
          const { data: l } = await supabase
            .from('leads').select('*').eq('id', leadId).single();
          if (cancelled) return;
          if (l) {
            setLead(l as Lead);
            // website screenshot
            if ((l as Lead).website) {
              const url = (l as Lead).website!.startsWith('http')
                ? (l as Lead).website!
                : `https://${(l as Lead).website}`;
              try {
                const r = await fetch(
                  `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&fullPage=true&timeout=15000`
                );
                const j = await r.json();
                if (j?.data?.screenshot?.url) {
                  setWebsiteScreenshot(j.data.screenshot.url);
                }
              } catch { /* screenshot failed — graceful fallback */ }
            }
          }
        }
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [params.id, getLeadId]);

  /* ---------- video event handlers ---------- */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    const onPlay = () => { watchStarted.current = true; playStartRef.current = Date.now(); };
    const onTime = () => {
      if (!el.duration) return;
      const pct = Math.round((el.currentTime / el.duration) * 100);
      setWatchPct(pct);
      if (pct >= 8) setCtaVisible(true);
    };
    const onEnd = () => {
      setEnded(true); setPlaying(false); setCtaVisible(true);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [video]);

  /* ---------- smooth scroll loop (top → bottom) ---------- */
  useEffect(() => {
    if (!playing || ended) {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      return;
    }
    const el = videoRef.current;
    if (!el || !el.duration) return;

    const totalDuration = el.duration * 1000; // ms
    const tick = () => {
      const elapsed = Date.now() - playStartRef.current;
      const progress = Math.min(elapsed / totalDuration, 1);
      // easeInOutQuad for natural feel
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setBgScrollPos(eased * 100);
      if (progress < 1) {
        scrollRaf.current = requestAnimationFrame(tick);
      }
    };
    scrollRaf.current = requestAnimationFrame(tick);
    return () => { if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current); };
  }, [playing, ended]);

  const handlePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (ended) {
      el.currentTime = 0; setBgScrollPos(0); setEnded(false);
    }
    el.play();
    setPlaying(true);
  };

  const handlePause = () => {
    videoRef.current?.pause();
    setPlaying(false);
  };

  const handleReplay = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0; setBgScrollPos(0); setEnded(false);
    el.play(); setPlaying(true);
  };

  /* ---------- derived ---------- */
  const prospectName = lead?.first_name || lead?.email?.split('@')[0] || 'there';
  const brandColor = video?.brand_color || '#4F46E5';
  const targetWebsite = lead?.website || '';
  const { badge: badgeText, heading: titleHeading } = useMemo(
    () => extractBadges(video?.title || ''), [video?.title]
  );
  const headingText = titleHeading || `Hey ${prospectName} 👋`;
  const bodyText = video?.cta_description
    || `I put together this personalized video for you${lead?.company ? ` and the team at ${lead.company}` : ''}. I think you'll find the first 30 seconds especially relevant.`;

  /* ---------- brand ---------- */
  const brandTitle = video?.brand_title || 'Capital Acquisition';
  const brandSubtitle = video?.brand_subtitle || 'Outreach Suite';

  /* ================================================================ */
  /*  LOADING                                                          */
  /* ================================================================ */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
        </div>
        <p className="text-white/40 text-sm tracking-wide">Preparing your page…</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-white/40 text-lg">Page not found.</p>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white antialiased">

      {/* ---- NAV BAR ---- */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {video.brand_logo_url ? (
              <img src={video.brand_logo_url} alt="" className="h-7 w-auto rounded-lg" />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs text-white" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)` }}>
                {initials(brandTitle)}
              </div>
            )}
            <span className="text-sm font-semibold text-white/90 tracking-tight">{brandTitle}</span>
          </div>
          {ctaVisible && video.cta_url && (
            <a
              href={video.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full text-white transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}
            >
              <Calendar className="w-3.5 h-3.5" />
              Book a Call
            </a>
          )}
        </div>
      </nav>

      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section className="relative pt-14 overflow-hidden">
        {/* glow blobs */}
        <div className="pointer-events-none absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-20 blur-[120px]" style={{ background: brandColor }} />
        <div className="pointer-events-none absolute top-[200px] right-[-200px] w-[400px] h-[400px] rounded-full opacity-10 blur-[100px] bg-indigo-500" />

        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-8 md:pt-24 md:pb-12">

          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">

            {/* ---------------------------------------------------------- */}
            {/*  LEFT : COPY                                                 */}
            {/* ---------------------------------------------------------- */}
            <div className="space-y-7 order-2 lg:order-1">

              {/* badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border" style={{ borderColor: `${brandColor}44`, color: brandColor, background: `${brandColor}11` }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: brandColor }} />
                {badgeText}
              </div>

              {/* h1 */}
              <h1 className="text-3.5xl sm:text-4xl md:text-5xl font-extrabold leading-[1.1] tracking-tight text-white">
                {headingText}
              </h1>

              {/* sub */}
              {lead?.company && (
                <p className="text-lg md:text-xl text-white/50 font-medium">
                  Tailored for {lead.company}
                </p>
              )}

              {/* body */}
              <p className="text-[15px] md:text-base text-white/45 leading-relaxed max-w-md">
                {bodyText}
              </p>

              {/* signature / avatar row */}
              <div className="flex items-center gap-4 pt-2">
                <div className="flex -space-x-2">
                  <div className="w-9 h-9 rounded-full ring-2 ring-[#0a0a0f] flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${brandColor}, #7c3aed)` }}>
                    {initials(brandTitle)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/80">{brandTitle}</p>
                  <p className="text-xs text-white/35">{brandSubtitle}</p>
                </div>
              </div>

              {/* CTA — on mobile, after copy */}
              {ctaVisible && video.cta_url && (
                <a
                  href={video.cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex lg:hidden items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-2xl text-white font-bold text-base transition-all hover:scale-[1.03] active:scale-[0.97] shadow-2xl"
                  style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`, boxShadow: `0 20px 60px ${brandColor}33` }}
                >
                  {video.cta_text || 'Book a Call'}
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>

            {/* ---------------------------------------------------------- */}
            {/*  RIGHT : VIDEO HERO                                          */}
            {/* ---------------------------------------------------------- */}
            <div className="order-1 lg:order-2" onMouseEnter={() => setHoveringVideo(true)} onMouseLeave={() => setHoveringVideo(false)}>

              <div className="relative rounded-3xl overflow-hidden bg-[#111118] ring-1 ring-white/[0.08] shadow-2xl shadow-black/40" style={{ aspectRatio: '16/10' }}>

                {/* === BACKGROUND : scrolling website screenshot === */}
                <div className="absolute inset-0 overflow-hidden">
                  {websiteScreenshot ? (
                    <div
                      className="absolute inset-x-0 top-0"
                      style={{
                        height: '300%',
                        backgroundImage: `url(${websiteScreenshot})`,
                        backgroundSize: '100% auto',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: `center ${bgScrollPos}%`,
                        filter: 'brightness(0.45) saturate(0.7)',
                        willChange: 'background-position',
                      }}
                    />
                  ) : targetWebsite ? (
                    <iframe
                      src={targetWebsite.startsWith('http') ? targetWebsite : `https://${targetWebsite}`}
                      className="absolute inset-0 w-[300%] h-[300%] border-0 pointer-events-none origin-top-left scale-[0.333]"
                      style={{ filter: 'brightness(0.45) saturate(0.7)', transform: `translateY(-${bgScrollPos}%)`, transition: 'transform 0.3s linear' }}
                      sandbox="allow-same-origin allow-scripts"
                      loading="eager"
                      title="Prospect website"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1a1040] via-[#0d0d1a] to-[#0a0a0f]" />
                  )}
                  {/* overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111118] via-transparent to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#111118]/50 via-transparent to-transparent" />
                </div>

                {/* === PERSON VIDEO CIRCLE === */}
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div
                    className="rounded-full overflow-hidden ring-[3px] ring-white/20 shadow-2xl pointer-events-auto cursor-pointer transition-all duration-700 ease-out"
                    style={{
                      width: playing ? 64 : 130,
                      height: playing ? 64 : 130,
                      marginTop: playing ? 'auto' : 0,
                      marginBottom: playing ? 16 : 0,
                      marginLeft: playing ? 16 : 0,
                      marginRight: playing ? 'auto' : 0,
                      alignSelf: playing ? 'flex-end' : 'center',
                      justifySelf: playing ? 'flex-start' : 'center',
                    }}
                    onClick={playing ? handlePause : handlePlay}
                  >
                    <video
                      ref={videoRef}
                      src={video.video_url}
                      className="w-full h-full object-cover"
                      muted={muted}
                      playsInline
                      preload="auto"
                      style={{ pointerEvents: 'none' }}
                    />
                  </div>
                </div>

                {/* === CENTER PLAY BUTTON (idle) === */}
                {!playing && !ended && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer" onClick={handlePlay}>
                    <div className="group flex flex-col items-center gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-xl opacity-50 transition-opacity group-hover:opacity-80" style={{ background: brandColor }} />
                        <div className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center bg-white/95 backdrop-blur-sm shadow-2xl transition-transform group-hover:scale-110">
                          <Play className="w-7 h-7 text-gray-900 ml-1" />
                        </div>
                      </div>
                      <span className="text-white/70 text-xs font-semibold tracking-wide bg-black/40 backdrop-blur-sm px-4 py-1.5 rounded-full">
                        Click to watch
                      </span>
                    </div>
                  </div>
                )}

                {/* === REPLAY OVERLAY === */}
                {ended && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer transition-all" onClick={handleReplay}>
                    <div className="flex flex-col items-center gap-3 group">
                      <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <RotateCcw className="w-7 h-7 text-white" />
                      </div>
                      <span className="text-white/80 text-sm font-medium">Watch again</span>
                    </div>
                  </div>
                )}

                {/* === PAUSE ON HOVER (while playing) === */}
                {playing && hoveringVideo && !ended && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 cursor-pointer" onClick={handlePause}>
                    <Pause className="w-10 h-10 text-white/70" />
                  </div>
                )}

                {/* === CONTROLS BAR === */}
                {/* Mute */}
                {(playing || ended) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); const el = videoRef.current; if (el) { el.muted = !el.muted; setMuted(el.muted); } }}
                    className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all"
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                )}

                {/* Progress */}
                {playing && !ended && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-30">
                    <div className="h-full transition-all duration-300 ease-linear" style={{ width: `${watchPct}%`, background: `linear-gradient(90deg, ${brandColor}, ${brandColor}cc)` }} />
                  </div>
                )}

                {/* Scrolling label */}
                {playing && !ended && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 text-[10px] text-white/40 font-medium animate-pulse">
                    <ChevronDown className="w-3 h-3 rotate-90" />
                    Scrolling through website
                    <ChevronDown className="w-3 h-3 rotate-90" />
                  </div>
                )}
              </div>

              {/* CTA below video (desktop) */}
              {ctaVisible && video.cta_url && (
                <div className="hidden lg:flex mt-6 gap-3">
                  <a
                    href={video.cta_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`, boxShadow: `0 12px 40px ${brandColor}22` }}
                  >
                    {video.cta_text || 'Book a Call'}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <div className="w-px bg-white/[0.06]" />
                  <button
                    onClick={handleReplay}
                    className="px-4 py-3.5 rounded-xl border border-white/[0.08] text-white/50 hover:text-white/80 text-sm font-medium transition-all hover:border-white/15"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  SOCIAL PROOF BAR                                                 */}
      {/* ================================================================ */}
      <section className="relative border-y border-white/[0.05] bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-semibold mb-5">Trusted by growth teams everywhere</p>
          <div className="flex items-center justify-center gap-8 md:gap-14 flex-wrap opacity-30">
            {['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'].map(name => (
              <span key={name} className="text-sm md:text-base font-bold text-white tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  WHY THIS MATTERS                                                  */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-10 blur-[100px]" style={{ background: brandColor }} />
        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-semibold text-white/40 uppercase tracking-widest">
              <Quote className="w-3 h-3" />
              Why this matters
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              This isn't a generic pitch{lead?.company ? `, ${prospectName}` : ''}.<br />
              <span className="text-white/40">It was built specifically for {lead?.company ? `what you're building at ${lead.company}` : 'your business'}.</span>
            </h2>
            <p className="text-white/35 text-sm leading-relaxed max-w-lg mx-auto">
              We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  CALENDAR SECTION                                                  */}
      {/* ================================================================ */}
      {ctaVisible && (video.calendar_embed_code || video.cta_url) && (
        <section className="relative border-t border-white/[0.05]" id="schedule">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-3xl mx-auto">

              {/* video summary card */}
              <div className="mb-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 flex flex-col sm:flex-row items-start gap-5">
                {/* mini video thumbnail */}
                <div className="w-16 h-16 rounded-xl overflow-hidden ring-1 ring-white/[0.08] flex-shrink-0 relative cursor-pointer" onClick={handlePlay}>
                  <video src={video.video_url} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/25">{badgeText}</p>
                  <p className="text-base font-bold text-white/90">{headingText}</p>
                  <p className="text-sm text-white/35">
                    {watchPct > 0
                      ? `You watched ${watchPct}% — ready to take the next step?`
                      : 'Watch the full 60-second walkthrough first.'}
                  </p>
                </div>
              </div>

              {/* calendar embed */}
              {video.calendar_embed_code && (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/[0.05] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: brandColor }} />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/50">Schedule a time to chat</span>
                  </div>
                  <div
                    className="p-4 md:p-6"
                    dangerouslySetInnerHTML={{ __html: video.calendar_embed_code }}
                    style={{ colorScheme: 'dark' } as React.CSSProperties}
                  />
                </div>
              )}

              {/* fallback CTA button */}
              {video.cta_url && !video.calendar_embed_code && (
                <a
                  href={video.cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-white font-bold text-base transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl"
                  style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`, boxShadow: `0 20px 60px ${brandColor}33` }}
                >
                  {video.cta_text || 'Book a Call'}
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}

            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/*  FOOTER                                                            */}
      {/* ================================================================ */}
      <footer className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {video.brand_logo_url ? (
              <img src={video.brand_logo_url} alt="" className="h-5 w-auto rounded opacity-40" />
            ) : (
              <div className="h-5 w-5 rounded flex items-center justify-center text-[7px] font-bold text-white/40" style={{ background: brandColor }}>
                {initials(brandTitle)}
              </div>
            )}
            <span className="text-xs text-white/25">© {new Date().getFullYear()} {brandTitle}. All rights reserved.</span>
          </div>
          <span className="text-[10px] text-white/15 tracking-wide uppercase">Powered by {brandTitle}</span>
        </div>
      </footer>

      {/* ================================================================ */}
      {/*  GLOBAL STYLES                                                    */}
      {/* ================================================================ */}
      <style jsx global>{`
        /* — scrollbar — */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }

        /* — selection — */
        ::selection { background: ${brandColor}44; color: white; }

        /* — calendly overrides for dark mode — */
        .calend-embed iframe,
        .calendly-inline-widget,
        .calendly-overlay iframe {
          width: 100% !important;
          min-height: 420px !important;
          border: none !important;
          border-radius: 12px !important;
          filter: invert(1) hue-rotate(180deg);
        }

        /* — animate pulse for badge dot — */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* — smooth scroll — */
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}
