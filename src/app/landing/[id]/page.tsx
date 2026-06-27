'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX,
  ArrowRight, Calendar, Quote, ChevronDown,
} from 'lucide-react';
import CalendlyWidget from '@/components/CalendlyWidget';
import { resolveTemplate, type LandingTemplate, type LeadData } from '@/lib/landingTemplates';
import styles from './page.module.css';

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
  website_screenshot_url: string | null;
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
  landing_page_template_id?: string | null;
  website_url?: string | null;
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
  const [template, setTemplate] = useState<LandingTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if a section is hidden
  const isSectionHidden = useCallback((section: string) => {
    if (!template?.hidden_sections) return false
    return template.hidden_sections.includes(section)
  }, [template])

  // Resolve template fields with lead data
  const resolvedTemplate = useMemo(() => {
    if (!template) return null
    return resolveTemplate(template, lead as unknown as LeadData)
  }, [template, lead])

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
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isPreview, setIsPreview] = useState(false);

  // Check if preview mode on mount
  useEffect(() => {
    if (window.location.search.includes('preview=true')) setIsPreview(true);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const watchStarted = useRef(false);
  const scrollRaf = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const getLeadId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('leadId');
  }, []);

  const getTemplateId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('templateId');
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

          // Check if a specific templateId is requested in URL
          const requestedTemplateId = getTemplateId();
          let loadedTemplate: LandingTemplate | null = null;
          
          if (requestedTemplateId) {
            const { data: t } = await supabase
              .from('landing_page_templates')
              .select('*')
              .eq('id', requestedTemplateId)
              .single()
            if (!cancelled && t) {
              loadedTemplate = t as LandingTemplate
              setTemplate(loadedTemplate)
            }
          }
          
          // If no template loaded, try video's template, then default
          if (!loadedTemplate) {
            if (v.landing_page_template_id) {
              const { data: t } = await supabase
                .from('landing_page_templates')
                .select('*')
                .eq('id', v.landing_page_template_id)
                .single()
              if (!cancelled && t) {
                loadedTemplate = t as LandingTemplate
                setTemplate(loadedTemplate)
              }
            }
          }
          
          // If still no template, load the default one
          if (!loadedTemplate) {
            const { data: t } = await supabase
              .from('landing_page_templates')
              .select('*')
              .eq('is_default', true)
              .single()
            if (!cancelled && t) {
              loadedTemplate = t as LandingTemplate
              setTemplate(loadedTemplate)
            }
          }

          // Set ctaVisible based on video OR template
          const hasCalendar = v.calendar_embed_code || loadedTemplate?.calendar_embed_code || v.cta_url || loadedTemplate?.cta_url;
          if (hasCalendar) setCtaVisible(true);
          else setCtaVisible(true); // Always show calendar/CTA for landing pages
        }

        // lead
        const leadId = getLeadId();
        if (leadId) {
          const { data: l } = await supabase
            .from('leads').select('*').eq('id', leadId).single();
          if (cancelled) return;
          if (l) {
            setLead(l as Lead);
            // Use stored screenshot URL if available, otherwise generate
            const storedScreenshot = (l as Lead).website_screenshot_url;
            if (storedScreenshot) {
              setWebsiteScreenshot(storedScreenshot);
            } else if ((l as Lead).website) {
              const url = (l as Lead).website!.startsWith('http')
                ? (l as Lead).website!
                : `https://${(l as Lead).website}`;
              try {
                const r = await fetch(
                  `${window.location.origin}/api/screenshot/generate`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                    signal: AbortSignal.timeout(30000),
                  }
                );
                if (r.ok) {
                  const data = await r.json();
                  if (data.screenshotUrl) {
                    setWebsiteScreenshot(data.screenshotUrl);
                  }
                }
              } catch { /* screenshot failed — show gradient fallback */ }
            }
          }
        }
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [params.id, getLeadId, getTemplateId]);

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

  /* ---------- smooth scroll loop (top → bottom) — always running ---------- */
  useEffect(() => {
    let frameId: number;
    const startTime = Date.now();
    const cycleDuration = 15000; // 15 seconds per full scroll
    
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed % cycleDuration) / cycleDuration;
      // easeInOutQuad for natural feel
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setBgScrollPos(eased * 100);
      frameId = requestAnimationFrame(tick);
    };
    
    frameId = requestAnimationFrame(tick);
    
    return () => cancelAnimationFrame(frameId);
  }, []);

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

  /* ---------- template helper ---------- */
  const tpl = (field: string, fallback: string = '') => {
    if (resolvedTemplate && resolvedTemplate[field]) return resolvedTemplate[field]
    return fallback
  }

  /* ---------- derived ---------- */
  const prospectName = lead?.first_name || lead?.email?.split('@')[0] || 'there';
  const brandColor = tpl('brand_color', video?.brand_color || '#4F46E5');
  const targetWebsite = lead?.website || '';
  const { badge: badgeText, heading: titleHeading } = useMemo(
    () => extractBadges(video?.title || ''), [video?.title]
  );
  const headingText = tpl('hero_heading') || `Hey ${prospectName}`;
  const bodyText = tpl('hero_body') || `I put together this personalized video for you${lead?.company ? ` and the team at ${lead.company}` : ''}. I think you'll find the first 30 seconds especially relevant.`;

  /* ---------- brand ---------- */
  const brandTitle = tpl('brand_title') || 'Capital Acquisition';
  const brandSubtitle = video?.brand_subtitle || 'Outreach Suite';

  /* ================================================================ */
  /*  LOADING                                                          */
  /* ================================================================ */
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner}>
          <div className={styles.loadingSpinnerOuter} />
          <div className={styles.loadingSpinnerInner} />
        </div>
        <p className={styles.loadingText}>Preparing your page…</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className={styles.error}>
        <p className={styles.errorText}>Page not found.</p>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className={`${styles.page} landing-page ${isPreview && viewMode === 'mobile' ? styles.previewMobile : ''}`}>

      {/* ---- VIEW MODE TOGGLE (only in preview mode) ---- */}
      {isPreview && (
        <div className={styles.viewToggle}>
          <button className={`${styles.viewToggleBtn} ${viewMode === 'desktop' ? styles.viewToggleActive : ''}`} onClick={() => setViewMode('desktop')}>Desktop</button>
          <button className={`${styles.viewToggleBtn} ${viewMode === 'mobile' ? styles.viewToggleActive : ''}`} onClick={() => setViewMode('mobile')}>Mobile</button>
        </div>
      )}

      {/* ---- NAV BAR ---- */}
      <nav className={styles.nav} style={{ background: tpl('nav_bg_color') || undefined, color: tpl('nav_text_color') || undefined }}>
        <div className={styles.navContent}>
          <div className={styles.navBrand}>
            <img src="https://wxxjiehgcjrmkbatkvsu.supabase.co/storage/v1/object/public/images/images/images_1782500392085.png" alt={brandTitle} width={32} height={32} className={styles.navLogo} style={{ borderRadius: '4px', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).src = '/ca-logo.svg' }} />
            <span className={styles.navBrandName}>{brandTitle}</span>
          </div>
          {ctaVisible && (
            <a
              href="#schedule"
              className={styles.navCta}
              style={{ background: tpl('cta_bg_color') || `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}
            >
              <Calendar className={styles.navCtaIcon} />
              {tpl('cta_text', video.cta_text || 'Book a Call')}
            </a>
          )}
        </div>
      </nav>

      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      {!isSectionHidden('hero') && (
      <section className={styles.hero} style={{ background: tpl('hero_bg_color') || undefined, color: tpl('hero_text_color') || undefined }}>
        {/* glow blobs */}
        <div className={styles.heroGlow1} style={{ background: brandColor }} />
        <div className={styles.heroGlow2} />

        <div className={styles.heroContent}>
          <div className={styles.heroGrid}>

            {/* ---------------------------------------------------------- */}
            {/*  LEFT : COPY                                                 */}
            {/* ---------------------------------------------------------- */}
            <div className={styles.heroCopy}>

              {/* h1 */}
              <h1 className={styles.heroHeading}>
                {headingText}
              </h1>

              {/* sub */}
              {(tpl('hero_subheading') || lead?.company) && (
                <p className={styles.heroSubheading}>
                  {tpl('hero_subheading', lead?.company ? `Tailored for ${lead.company}` : '')}
                </p>
              )}

              {/* body */}
              <p className={styles.heroBody}>
                {bodyText}
              </p>

              {/* CTA — on mobile, after copy */}
              {ctaVisible && (tpl('cta_url') || video.cta_url) && (
                <a
                  href="#schedule"
                  className={styles.mobileCta}
                  style={{ background: tpl('cta_bg_color') || `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`, boxShadow: `0 20px 60px ${brandColor}33` }}
                >
                  {tpl('cta_text', video.cta_text || 'Book a Call')}
                  <ArrowRight className={styles.mobileCtaIcon} />
                </a>
              )}

            </div>

            {/* ---------------------------------------------------------- */}
            {/*  RIGHT : VIDEO HERO                                          */}
            {/* ---------------------------------------------------------- */}
            <div className={styles.videoHero} onMouseEnter={() => setHoveringVideo(true)} onMouseLeave={() => setHoveringVideo(false)}>

              <div className={styles.videoContainer}>

                {/* === BACKGROUND : scrolling website screenshot === */}
                <div className={styles.videoBg}>
                  {websiteScreenshot ? (
                    <img
                      src={websiteScreenshot}
                      className={styles.videoBgScreenshot}
                      alt=""
                      loading="eager"
                    />
                  ) : targetWebsite ? (
                    <iframe
                      src={targetWebsite.startsWith('http') ? targetWebsite : `https://${targetWebsite}`}
                      className={styles.videoBgIframe}
                      sandbox="allow-same-origin allow-scripts"
                      loading="eager"
                      title="Prospect website"
                    />
                  ) : (
                    <div className={styles.videoBgGradient} />
                  )}
                  {/* overlays */}
                  <div className={styles.videoBgOverlay1} />
                  <div className={styles.videoBgOverlay2} />
                </div>

                {/* === PERSON VIDEO CIRCLE === */}
                <div className={styles.videoCircle}>
                  <div
                    className={styles.videoCircleInner}
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
                      className={styles.videoCircleVideo}
                      muted={muted}
                      playsInline
                      preload="auto"
                      crossOrigin="anonymous"
                    />
                  </div>
                </div>

                {/* === CENTER PLAY BUTTON (idle) === */}
                {!playing && !ended && (
                  <div className={styles.playButton} onClick={handlePlay}>
                    <div className={styles.playButtonContent}>
                      <div className={styles.playButtonGlow} style={{ background: brandColor }} />
                      <div className={styles.playButtonCircle}>
                        <Play className={styles.playButtonIcon} />
                      </div>
                      <span className={styles.playButtonText}>Click to watch</span>
                    </div>
                  </div>
                )}

                {/* === REPLAY OVERLAY === */}
                {ended && (
                  <div className={styles.replayOverlay} onClick={handleReplay}>
                    <div className={styles.replayContent}>
                      <div className={styles.replayButton}>
                        <RotateCcw className={styles.replayIcon} />
                      </div>
                      <span className={styles.replayText}>Watch again</span>
                    </div>
                  </div>
                )}

                {/* === PAUSE ON HOVER (while playing) === */}
                {playing && hoveringVideo && !ended && (
                  <div className={styles.pauseOverlay} onClick={handlePause}>
                    <Pause className={styles.pauseIcon} />
                  </div>
                )}

                {/* === CONTROLS BAR === */}
                {/* Mute */}
                {(playing || ended) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); const el = videoRef.current; if (el) { el.muted = !el.muted; setMuted(el.muted); } }}
                    className={styles.muteButton}
                  >
                    {muted ? <VolumeX className={styles.muteIcon} /> : <Volume2 className={styles.muteIcon} />}
                  </button>
                )}

                {/* Progress */}
                {playing && !ended && (
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${watchPct}%`, background: `linear-gradient(90deg, ${brandColor}, ${brandColor}cc)` }} />
                  </div>
                )}

                {/* Scrolling label — removed */}
              </div>

              {/* CTA below video (desktop) */}
              {ctaVisible && (tpl('cta_url') || video.cta_url) && (
                <div className={styles.desktopCta}>
                  <a
                    href="#schedule"
                    className={styles.desktopCtaButton}
                    style={{ background: tpl('cta_bg_color') || `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`, boxShadow: `0 12px 40px ${brandColor}22` }}
                  >
                    {tpl('cta_text', video.cta_text || 'Book a Call')}
                    <ArrowRight className={styles.desktopCtaIcon} />
                  </a>
                  <div className={styles.desktopCtaDivider} />
                  <button
                    onClick={handleReplay}
                    className={styles.replayButtonSmall}
                  >
                    <RotateCcw className={styles.replayButtonSmallIcon} />
                   </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/*  SOCIAL PROOF BAR                                                 */}
      {/* ================================================================ */}
      {!isSectionHidden('social_proof') && (
      <section className={styles.socialProof} style={{ background: tpl('social_proof_bg_color') || undefined, color: tpl('social_proof_text_color') || undefined }}>
        <div className={styles.socialProofContent}>
          <p className={styles.socialProofHeading}>{tpl('social_proof_heading', 'Trusted by growth teams everywhere')}</p>
          <div className={styles.socialProofLogos}>
            {(tpl('social_proof_logos') ? tpl('social_proof_logos').split(',') : ['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX']).map((name: string) => (
              <span key={name} className={styles.socialProofLogo}>{name}</span>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/*  WHY THIS MATTERS                                                  */}
      {/* ================================================================ */}
      {!isSectionHidden('why_matters') && (
      <section className={styles.whyMatters} style={{ background: tpl('why_matters_bg_color') || undefined, color: tpl('why_matters_text_color') || undefined }}>
        <div className={styles.whyMattersGlow} style={{ background: brandColor }} />
        <div className={styles.whyMattersContent}>
          <div className={styles.whyMattersInner}>
            <div className={styles.whyMattersBadge}>
              <Quote className={styles.whyMattersBadgeIcon} />
              Why this matters
            </div>
            <h2 className={styles.whyMattersHeading}>
              {tpl('why_matters_heading', `This isn't a generic pitch${lead?.company ? `, ${prospectName}` : ''}.`)}<br />
              <span className={styles.whyMattersSubheading}>{tpl('why_matters_subheading', lead?.company ? `It was built specifically for what you're building at ${lead.company}` : 'It was built specifically for your business.')}</span>
            </h2>
            <p className={styles.whyMattersBody}>
              {tpl('why_matters_body', 'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.')}
            </p>
          </div>
        </div>
      </section>
      )}

      {/* ================================================================ */}
      {/*  CALENDAR SECTION                                                  */}
      {/* ================================================================ */}
      <section className={styles.calendarSection} id="schedule">
        <div className={styles.calendarContent}>
          <div className={styles.calendarInner}>
            <div className={styles.calendarEmbed}>
              <div className={styles.calendarEmbedHeader}>
                <div className={styles.calendarEmbedDot} style={{ background: brandColor }} />
                <span className={styles.calendarEmbedTitle}>
                  Schedule a time to chat
                </span>
              </div>
              <div className={styles.calendarEmbedContent}>
                <CalendlyWidget 
                  embedCode={tpl('calendar_embed_code') || video.calendar_embed_code || '<div class="calendly-inline-widget" data-url="https://calendly.com/thecapitalacquisition-info/30min?hide_gdpr_banner=1" style="min-width:320px;height:700px;"></div><script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>'} 
                  ctaUrl={tpl('cta_url') || video.cta_url || 'https://calendly.com/thecapitalacquisition-info/30min'}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  FOOTER                                                            */}
      {/* ================================================================ */}
      {!isSectionHidden('footer') && (
      <footer className={styles.footer} style={{ background: tpl('footer_bg_color') || undefined, color: tpl('footer_text_color') || undefined }}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <img src="https://wxxjiehgcjrmkbatkvsu.supabase.co/storage/v1/object/public/images/images/images_1782500392085.png" alt={brandTitle} width={20} height={20} className={styles.footerLogo} style={{ borderRadius: '4px', objectFit: 'contain', opacity: 0.6 }} onError={(e) => { (e.target as HTMLImageElement).src = '/ca-logo.svg' }} />
            <span className={styles.footerText}>{tpl('footer_text', `© ${new Date().getFullYear()} ${brandTitle}. All rights reserved.`)}</span>
          </div>
          <span className={styles.footerPoweredBy}>{tpl('footer_powered_by', `Powered by ${brandTitle}`)}</span>
        </div>
      </footer>
      )}

      {/* ================================================================ */}
      {/*  GLOBAL STYLES                                                    */}
      {/* ================================================================ */}
      <style jsx global>{`
        /* — scrollbar — */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        body.light .landing-page ::-webkit-scrollbar-thumb {
          background: rgba(15,23,42,0.15);
        }

        /* — selection — */
        ::selection { background: ${brandColor}44; color: white; }

        /* — custom CSS from template — */
        ${tpl('custom_css', '')}
      `}</style>
    </div>
  );
}
