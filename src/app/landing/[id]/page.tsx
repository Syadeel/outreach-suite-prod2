'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { Play, Pause, Volume2, VolumeX, Eye, ArrowRight, Laptop, Calendar, CheckSquare, ShieldAlert } from 'lucide-react';

interface LandingPageProps {
  params: {
    id: string;
  };
}

export default function LandingPage({ params }: LandingPageProps) {
  const videoId = params.id;
  const [video, setVideo] = useState<any | null>(null);
  const [lead, setLead] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctaClicked, setCtaClicked] = useState(false);
  const [viewLogged, setViewLogged] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playerMode, setPlayerMode] = useState<'personalized' | 'standard'>('personalized');
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const maxPercentRef = useRef<number>(0);
  const viewIdRef = useRef<string | null>(null);

  const getDomain = (url: string) => {
    if (!url) return '';
    let hostname = url.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
    hostname = hostname.split('/')[0];
    return hostname;
  };

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => console.error('Play failed:', err));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  useEffect(() => {
    fetchPageData();
  }, [videoId]);

  const fetchPageData = async () => {
    try {
      // 1. Fetch Video recording branding details
      const { data: videoRecord } = await supabase
        .from('video_recordings')
        .select('*')
        .eq('id', videoId)
        .single();
      
      if (videoRecord) {
        setVideo(videoRecord);

        // 2. Fetch Lead context from URL parameters if available
        const urlParams = new URLSearchParams(window.location.search);
        const leadId = urlParams.get('leadId');
        
        if (leadId) {
          const { data: leadRecord } = await supabase
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .single();
          if (leadRecord) {
            setLead(leadRecord);
            if (!leadRecord.website) {
              setPlayerMode('standard');
            }
          } else {
            setPlayerMode('standard');
          }
        } else {
          setPlayerMode('standard');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Log initial page view in Supabase (runs once video details are loaded)
  useEffect(() => {
    if (video && !viewLogged) {
      logPageView();
    }
  }, [video]);

  const logPageView = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const leadId = urlParams.get('leadId') || null;

      const { data: viewRecord, error } = await supabase
        .from('video_views')
        .insert({
          video_id: video.id,
          lead_id: leadId,
          ip_address: 'Prospect Browser', // Captured in backend if desired, simplified here
          watch_percentage: 0,
          cta_clicked: false
        })
        .select('id')
        .single();

      if (!error && viewRecord) {
        viewIdRef.current = viewRecord.id;
        setViewLogged(true);

        // Update the corresponding sent email record to mark as "clicked" if leadId is present
        if (leadId) {
          const { data: lastEmail } = await supabase
            .from('sent_emails')
            .select('id')
            .eq('lead_id', leadId)
            .order('sent_at', { ascending: false })
            .limit(1)
            .single();

          if (lastEmail) {
            await supabase
              .from('sent_emails')
              .update({ clicked_at: new Date().toISOString() })
              .eq('id', lastEmail.id);
          }
        }
      }
    } catch (err) {
      console.error('Error logging page view:', err);
    }
  };

  // Monitor Video Playback to track watch percentages
  const handleTimeUpdate = async () => {
    if (!videoRef.current || !viewIdRef.current) return;
    
    const duration = videoRef.current.duration;
    const currentTime = videoRef.current.currentTime;
    
    if (duration > 0) {
      const percentage = Math.round((currentTime / duration) * 100);
      if (percentage > maxPercentRef.current) {
        maxPercentRef.current = percentage;
        
        // Update view records every 10% interval to minimize db hits
        if (percentage % 10 === 0) {
          await supabase
            .from('video_views')
            .update({ watch_percentage: maxPercentRef.current })
            .eq('id', viewIdRef.current);
        }
      }
    }
  };

  const handleCtaClick = async () => {
    setCtaClicked(true);
    if (viewIdRef.current) {
      await supabase
        .from('video_views')
        .update({ cta_clicked: true })
        .eq('id', viewIdRef.current);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm mt-4">Loading personalized pitch page...</p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 p-6">
        <div className="text-center max-w-sm space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Video Pitch Not Found</h2>
          <p className="text-sm text-slate-400">The video recording link may have expired or is incorrect. Please contact the sender.</p>
        </div>
      </div>
    );
  }

  const welcomeName = lead?.first_name ? `Hey ${lead.first_name}!` : 'Hey there!';
  const customColor = video.brand_color || '#4F46E5';
  
  const domain = lead?.website ? getDomain(lead.website) : '';
  const logoUrl = lead?.custom_fields?.logo_url || (domain ? `https://logo.clearbit.com/${domain}` : '');
  const normalizedWebsite = lead?.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-12 px-4 md:px-8 relative overflow-hidden">
      
      {/* Decorative Background Glows */}
      <div className="absolute top-10 right-20 w-72 h-72 rounded-full blur-[100px] pointer-events-none" style={{ backgroundColor: `${customColor}20` }} />
      <div className="absolute bottom-20 left-10 w-96 h-96 rounded-full blur-[120px] pointer-events-none" style={{ backgroundColor: `${customColor}10` }} />

      <div className="max-w-5xl mx-auto w-full space-y-8 relative z-10">
        
        {/* Top Pitch Header */}
        <div className="text-center space-y-4 flex flex-col items-center">
          {logoUrl && (
            <div className="w-16 h-16 rounded-2xl bg-white p-3 shadow-xl border border-slate-800/10 flex items-center justify-center transition-all hover:scale-105">
              <img 
                src={logoUrl} 
                alt={`${lead?.company || 'Company'} Logo`} 
                className="max-w-full max-h-full object-contain rounded"
                onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }}
              />
            </div>
          )}
          <div className="space-y-3">
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">
              {welcomeName}
            </h1>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              I prepared this short, personalized video walk-through for you and the team at{' '}
              <span className="text-white font-semibold">{lead?.company || 'your company'}</span>.
            </p>
          </div>
        </div>

        {/* Dynamic Video & CTA Block */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Personalized Video (Span 7) */}
          <div className="lg:col-span-7 space-y-4">
            {playerMode === 'personalized' && lead?.website ? (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl group flex flex-col">
                
                {/* Browser Mockup Header */}
                <div className="w-full bg-slate-900 border-b border-slate-800/80 px-4 py-2.5 flex items-center select-none z-20">
                  {/* Window Dots */}
                  <div className="flex gap-1.5 mr-4 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  {/* Address Bar */}
                  <div className="flex-1 bg-slate-950/80 border border-slate-800/85 text-[10px] text-slate-400 px-3 py-1 rounded-lg flex items-center justify-between font-mono truncate max-w-sm mx-auto shadow-inner">
                    <span className="truncate">{normalizedWebsite}</span>
                    <span className="text-emerald-400 font-bold text-[8px] tracking-wider uppercase ml-2 shrink-0">Secure</span>
                  </div>
                </div>

                {/* Viewport Container */}
                <div className="relative flex-1 w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                  {/* Scrolling Website Background Container */}
                  <div className="absolute inset-0 w-full h-full overflow-hidden select-none">
                    <div 
                      className="w-full transition-transform ease-linear"
                      style={{
                        backgroundImage: `url(https://image.microlink.io/?url=${encodeURIComponent(normalizedWebsite)}&screenshot=true&embed=screenshot.url)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'top center',
                        height: '400%',
                        transform: isPlaying ? 'translateY(-75%)' : 'translateY(0%)',
                        transitionDuration: isPlaying ? '40s' : '0s'
                      }}
                    />
                    {/* Dark overlay for readability and premium look */}
                    <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] pointer-events-none" />
                  </div>

                  {/* Video Overlay Bubble (Floating Webcam Circle in Center) */}
                  <div className="absolute z-10 w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-white shadow-2xl transition-all duration-300 flex items-center justify-center bg-black cursor-pointer hover:scale-105 active:scale-95">
                    <video
                      ref={videoRef}
                      src={video.video_url}
                      className="w-full h-full object-cover rounded-full"
                      onTimeUpdate={handleTimeUpdate}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onClick={togglePlayback}
                      poster={video.video_url.replace(/\.[^/.]+$/, '.jpg')}
                    />
                    
                    {!isPlaying && (
                      <div 
                        onClick={togglePlayback}
                        className="absolute inset-0 flex items-center justify-center bg-black/45 hover:bg-black/35 transition-all pointer-events-none"
                      >
                        <Play className="w-10 h-10 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Left/Right Overlays */}
                {logoUrl && (
                  <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200/50 flex items-center gap-2 shadow-md">
                    <img src={logoUrl} alt={lead.company} className="w-5 h-5 object-contain rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <span className="text-[10px] font-bold text-slate-800">{lead.company}</span>
                  </div>
                )}

                {/* Controls Overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-between items-center">
                  <div className="flex gap-2">
                    <button
                      onClick={togglePlayback}
                      className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold text-white-force"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-3 bg-slate-900/80 hover:bg-slate-800 text-white rounded-xl shadow-lg backdrop-blur transition-all active:scale-95 text-white-force"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={() => setPlayerMode('standard')}
                    className="px-3.5 py-2.5 bg-slate-900/80 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-lg backdrop-blur transition-all active:scale-95 text-white-force flex items-center gap-1.5"
                  >
                    <Laptop className="w-3.5 h-3.5" /> Full Screen
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
                <video
                  ref={videoRef}
                  src={video.video_url}
                  className="w-full h-auto aspect-video display-block"
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  poster={video.video_url.replace(/\.[^/.]+$/, '.jpg')}
                />
                
                {lead?.website && (
                  <button
                    onClick={() => setPlayerMode('personalized')}
                    className="absolute bottom-4 right-4 z-20 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95 text-white-force"
                  >
                    Personalized Web Mode
                  </button>
                )}
              </div>
            )}
            <h3 className="text-md font-bold text-white px-2">{video.title}</h3>
          </div>

          {/* Right Column: CTA & Meeting Booker (Span 5) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Next Step</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                If our acquisition solutions make sense for you, schedule a quick discovery call below:
              </p>

              {/* Calendly embed integration */}
              {video.calendar_embed_code ? (
                <div 
                  className="w-full h-80 rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950/20"
                  dangerouslySetInnerHTML={{ __html: video.calendar_embed_code }}
                />
              ) : (
                /* Fallback custom CTA button if booking widget code is not configured */
                video.cta_url && (
                  <a
                    href={video.cta_url}
                    onClick={handleCtaClick}
                    target="_blank"
                    rel="noreferrer"
                    style={{ backgroundColor: customColor }}
                    className="w-full py-3.5 text-center text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/10 active:scale-95 flex items-center justify-center gap-2 text-sm hover:brightness-110"
                  >
                    <Calendar className="w-4 h-4" />
                    {video.cta_text || 'Book discovering session'}
                  </a>
                )
              )}

              {ctaClicked && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
                  <CheckSquare className="w-4 h-4" />
                  <span>CTA Redirect Recorded. Thank you!</span>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Footer Branding */}
      <footer className="text-center text-slate-600 text-xs mt-12">
        <p>© {new Date().getFullYear()} Outreach Suite VideoSpark cloned system. Secured personal landing.</p>
      </footer>
    </div>
  );
}
