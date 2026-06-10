import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit3, Trash2, Mail, Save, X, Sparkles, Check, AlertCircle, FileText, Globe, Palette, Calendar, Link } from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at?: string;
}

interface LandingTemplate {
  id: string;
  name: string;
  brand_title: string;
  badge_text: string;
  video_title: string;
  cta_text: string;
  cta_url: string;
  brand_color: string;
  calendar_embed_code: string;
  cta_description: string;
  website_url: string;
  created_at?: string;
}

export default function TemplatesTab() {
  const [activeType, setActiveType] = useState<'email' | 'landing'>('email');
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [landingTemplates, setLandingTemplates] = useState<LandingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Form Editor Open State
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Email template form states
  const [emailName, setEmailName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Landing template form states
  const [landingName, setLandingName] = useState('');
  const [brandTitle, setBrandTitle] = useState('Capital Acquisition Systems');
  const [badgeText, setBadgeText] = useState('Personalized Video Walkthrough');
  const [videoTitle, setVideoTitle] = useState('Hey {{first_name}}!');
  const [ctaText, setCtaText] = useState('Book a 15-Min Call');
  const [ctaUrl, setCtaUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#10b981');
  const [calendarCode, setCalendarCode] = useState('');
  const [ctaDescription, setCtaDescription] = useState('If our acquisition solutions make sense for you, schedule a quick discovery call below:');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase client not initialized');
      
      // Fetch email templates
      const { data: emailData, error: emailErr } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (emailErr) throw emailErr;
      setEmailTemplates(emailData || []);

      // Fetch landing page templates (if table exists)
      try {
        const { data: landingData, error: landingErr } = await supabase
          .from('landing_page_templates')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (!landingErr) {
          setLandingTemplates(landingData || []);
        } else {
          // Table doesn't exist yet, load from localStorage
          loadLandingFromLocalStorage();
        }
      } catch {
        loadLandingFromLocalStorage();
      }

      setIsUsingFallback(false);
    } catch (err: any) {
      console.warn('Supabase fetch failed, falling back to localStorage:', err.message);
      setIsUsingFallback(true);
      loadEmailFromLocalStorage();
      loadLandingFromLocalStorage();
    } finally {
      setLoading(false);
    }
  };

  const loadEmailFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem('os_email_templates');
      if (stored) {
        setEmailTemplates(JSON.parse(stored));
      } else {
        const defaults: EmailTemplate[] = [
          {
            id: 'default-e1',
            name: 'Cold Pitch: Acquisition Systems',
            subject: 'Quick question regarding {{company}}’s growth',
            body: 'Hey {{first_name}},\n\nI was looking at {{website}} and noticed how your team handles user acquisition.\n\nHere at Capital Acquisition Systems, we build bespoke engines to add qualified opportunities directly to your sales pipeline on performance basis.\n\nLet me know if you would be open to a quick 10-minute chat next week to discuss this.\n\nBest,\nGhost'
          },
          {
            id: 'default-e2',
            name: 'Quick Follow-Up',
            subject: 'Re: Quick question regarding {{company}}’s growth',
            body: 'Hey {{first_name}},\n\nJust wanted to bump this to the top of your inbox. Did you get a chance to watch the video walkthrough I prepared for {{company}}?\n\nLet me know if you have any questions.\n\nThanks,\nGhost'
          }
        ];
        localStorage.setItem('os_email_templates', JSON.stringify(defaults));
        setEmailTemplates(defaults);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadLandingFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem('os_landing_page_templates');
      if (stored) {
        setLandingTemplates(JSON.parse(stored));
      } else {
        const defaults: LandingTemplate[] = [
          {
            id: 'default-l1',
            name: 'Acquisition System Pitch branding',
            brand_title: 'Capital Acquisition Systems',
            badge_text: 'Personalized Video Walkthrough',
            video_title: 'Hey {{first_name}}! Quick pitch for {{company}}',
            cta_text: 'Book a 15-Min Call',
            cta_url: 'https://calendly.com/outreach',
            brand_color: '#10b981',
            calendar_embed_code: '',
            cta_description: 'If our acquisition solutions make sense for you, schedule a quick discovery call below:',
            website_url: ''
          }
        ];
        localStorage.setItem('os_landing_page_templates', JSON.stringify(defaults));
        setLandingTemplates(defaults);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setMessage(null);
    
    if (activeType === 'email') {
      setEmailName('');
      setEmailSubject('');
      setEmailBody('');
    } else {
      setLandingName('');
      setBrandTitle('Capital Acquisition Systems');
      setBadgeText('Personalized Video Walkthrough');
      setVideoTitle('Hey {{first_name}}!');
      setCtaText('Book a 15-Min Call');
      setCtaUrl('');
      setBrandColor('#10b981');
      setCalendarCode('');
      setCtaDescription('If our acquisition solutions make sense for you, schedule a quick discovery call below:');
      setWebsiteUrl('');
    }
    
    setShowEditor(true);
  };

  const handleOpenEdit = (template: any) => {
    setEditingId(template.id);
    setMessage(null);
    
    if (activeType === 'email') {
      setEmailName(template.name);
      setEmailSubject(template.subject);
      setEmailBody(template.body);
    } else {
      const lt = template as LandingTemplate;
      setLandingName(lt.name);
      setBrandTitle(lt.brand_title);
      setBadgeText(lt.badge_text);
      setVideoTitle(lt.video_title);
      setCtaText(lt.cta_text);
      setCtaUrl(lt.cta_url);
      setBrandColor(lt.brand_color || '#10b981');
      setCalendarCode(lt.calendar_embed_code);
      setCtaDescription(lt.cta_description);
      setWebsiteUrl(lt.website_url);
    }
    
    setShowEditor(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (activeType === 'email') {
        if (!emailName.trim() || !emailSubject.trim() || !emailBody.trim()) throw new Error('All fields are required');
        const emailData = {
          name: emailName.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim(),
        };

        if (isUsingFallback || !supabase) {
          const updated = [...emailTemplates];
          if (editingId) {
            const index = updated.findIndex(t => t.id === editingId);
            if (index !== -1) updated[index] = { id: editingId, ...emailData };
          } else {
            updated.unshift({ id: 'local-' + Date.now(), ...emailData, created_at: new Date().toISOString() });
          }
          localStorage.setItem('os_email_templates', JSON.stringify(updated));
          setEmailTemplates(updated);
          setMessage({ type: 'success', text: 'Email template saved locally.' });
          setTimeout(() => setShowEditor(false), 800);
        } else {
          if (editingId) {
            const { error } = await supabase.from('email_templates').update(emailData).eq('id', editingId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('email_templates').insert([emailData]);
            if (error) throw error;
          }
          setMessage({ type: 'success', text: 'Email template saved.' });
          fetchTemplates();
          setTimeout(() => setShowEditor(false), 800);
        }
      } else {
        // Save Landing Page Template
        if (!landingName.trim() || !brandTitle.trim() || !videoTitle.trim()) throw new Error('Template Name, Brand Title, and Video Title are required');
        
        const landingData = {
          name: landingName.trim(),
          brand_title: brandTitle.trim(),
          badge_text: badgeText.trim(),
          video_title: videoTitle.trim(),
          cta_text: ctaText.trim(),
          cta_url: ctaUrl.trim(),
          brand_color: brandColor.trim(),
          calendar_embed_code: calendarCode.trim(),
          cta_description: ctaDescription.trim(),
          website_url: websiteUrl.trim()
        };

        let lpSavedOnDB = false;
        if (!isUsingFallback && supabase) {
          try {
            if (editingId) {
              const { error } = await supabase.from('landing_page_templates').update(landingData).eq('id', editingId);
              if (!error) lpSavedOnDB = true;
            } else {
              const { error } = await supabase.from('landing_page_templates').insert([landingData]);
              if (!error) lpSavedOnDB = true;
            }
          } catch {
            lpSavedOnDB = false;
          }
        }

        if (lpSavedOnDB) {
          setMessage({ type: 'success', text: 'Landing template saved.' });
          fetchTemplates();
          setTimeout(() => setShowEditor(false), 800);
        } else {
          // Save to localStorage
          const updated = [...landingTemplates];
          if (editingId) {
            const index = updated.findIndex(t => t.id === editingId);
            if (index !== -1) updated[index] = { id: editingId, ...landingData };
          } else {
            updated.unshift({ id: 'local-lp-' + Date.now(), ...landingData, created_at: new Date().toISOString() });
          }
          localStorage.setItem('os_landing_page_templates', JSON.stringify(updated));
          setLandingTemplates(updated);
          setMessage({ type: 'success', text: 'Landing template saved locally.' });
          setTimeout(() => setShowEditor(false), 800);
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Failed to save template.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      if (activeType === 'email') {
        if (isUsingFallback || !supabase) {
          const updated = emailTemplates.filter(t => t.id !== id);
          localStorage.setItem('os_email_templates', JSON.stringify(updated));
          setEmailTemplates(updated);
        } else {
          const { error } = await supabase.from('email_templates').delete().eq('id', id);
          if (error) throw error;
          fetchTemplates();
        }
      } else {
        // Delete Landing Page template
        let deletedOnDB = false;
        if (!isUsingFallback && supabase) {
          try {
            const { error } = await supabase.from('landing_page_templates').delete().eq('id', id);
            if (!error) deletedOnDB = true;
          } catch {
            deletedOnDB = false;
          }
        }

        if (deletedOnDB) {
          fetchTemplates();
        } else {
          const updated = landingTemplates.filter(t => t.id !== id);
          localStorage.setItem('os_landing_page_templates', JSON.stringify(updated));
          setLandingTemplates(updated);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete template: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Switcher & Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-heading flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-500" />
            Workspace Template Hub
          </h1>
          <p className="text-zinc-400 text-xs mt-1">
            Build pre-saved templates for your automated email sequences and custom landing page overrides.
          </p>
        </div>

        {/* Tab switch buttons */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-900 shrink-0">
          <button
            onClick={() => { setActiveType('email'); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeType === 'email'
                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" /> Email Templates
          </button>
          <button
            onClick={() => { setActiveType('landing'); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeType === 'landing'
                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" /> Landing Templates
          </button>
        </div>
      </div>

      {isUsingFallback && (
        <div className="flex items-center gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-amber-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Local storage fallback is active. Custom templates are saved on this browser local context.</span>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-950/20 p-4 rounded-2xl border border-slate-900/60">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-3" />
          <input
            type="text"
            placeholder={activeType === 'email' ? 'Search email templates...' : 'Search landing page templates...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 rounded-xl glass-input text-xs text-heading"
          />
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 text-xs glow-button text-white-force shrink-0"
        >
          <Plus className="w-4 h-4" /> Create {activeType === 'email' ? 'Email' : 'Landing'} Template
        </button>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-md font-bold text-heading flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                {editingId ? 'Edit' : 'Create'} {activeType === 'email' ? 'Email Template' : 'Landing Page Template'}
              </h2>
              <button onClick={() => setShowEditor(false)} className="text-slate-400 hover:text-heading p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {activeType === 'email' ? (
                /* 📧 Email Templates Form */
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Template Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cold Pitch Step 1"
                      value={emailName}
                      onChange={(e) => setEmailName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Subject Line</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Quick question regarding {{company}}"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Body Copy</label>
                      <span className="text-[9px] text-zinc-500 font-semibold">Supports tags: {'{{first_name}}'}, {'{{company}}'}</span>
                    </div>
                    <textarea
                      required
                      placeholder="Hey {{first_name}},&#10;&#10;I was looking at {{company}}..."
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl glass-input text-xs h-56 resize-none font-sans text-slate-200"
                    />
                  </div>
                </>
              ) : (
                /* 🖥️ Landing Page Templates Form */
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Template Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. General Agency Setup"
                      value={landingName}
                      onChange={(e) => setLandingName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Brand Logo Title</label>
                      <input
                        type="text"
                        value={brandTitle}
                        onChange={(e) => setBrandTitle(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Badge Pill Text</label>
                      <input
                        type="text"
                        value={badgeText}
                        onChange={(e) => setBadgeText(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Video/Pitch Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Proposal for {{company}} ["
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">CTA Button Text</label>
                      <input
                        type="text"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Brand Accent Color</label>
                      <div className="flex gap-1.5">
                        <input
                          type="color"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="w-10 h-10 p-0.5 rounded-xl glass-input cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="w-full px-2 py-2 rounded-xl glass-input text-[11px] font-mono text-heading"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">CTA Link URL</label>
                    <input
                      type="url"
                      placeholder="https://calendly.com/..."
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">CTA Description copy</label>
                    <textarea
                      placeholder="Enter pitch subtext description..."
                      value={ctaDescription}
                      onChange={(e) => setCtaDescription(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs h-16 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Website URL Override (screenshot bg)</label>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Calendly Embed Code (optional widget)</label>
                      <input
                        type="text"
                        placeholder="<!-- Calendly widget embed HTML -->"
                        value={calendarCode}
                        onChange={(e) => setCalendarCode(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-xs text-heading"
                      />
                    </div>
                  </div>
                </div>
              )}

              {message && (
                <div className={`flex items-start gap-2.5 p-3 rounded-xl text-xs font-semibold ${
                  message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                }`}>
                  {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800/60 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-heading rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-2 text-xs text-white-force glow-button"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates List Rendering */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : activeType === 'email' ? (
        /* Email templates view */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {emailTemplates
            .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.subject.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((template) => (
              <div 
                key={template.id} 
                className="group relative bg-slate-950/40 hover:bg-slate-950/80 border border-slate-900 hover:border-slate-800/80 rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="text-xs font-bold text-heading tracking-wide truncate max-w-[80%]">
                      {template.name}
                    </h3>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEdit(template)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg border border-slate-800/80 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800/80 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Subject</span>
                    <p className="text-zinc-300 text-xs font-medium truncate mt-0.5">{template.subject}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Body Preview</span>
                    <p className="text-zinc-400 text-[11px] leading-relaxed line-clamp-3 mt-0.5 whitespace-pre-line">{template.body}</p>
                  </div>
                </div>
                <div className="border-t border-slate-900/60 pt-3 mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Variables: {template.body.includes('{{first_name}}') ? '{{first_name}} ' : ''}{template.body.includes('{{company}}') ? '{{company}}' : ''}</span>
                  <span>{template.created_at ? new Date(template.created_at).toLocaleDateString() : 'Local Template'}</span>
                </div>
              </div>
            ))}
        </div>
      ) : (
        /* Landing page templates view */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {landingTemplates
            .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.brand_title.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((template) => (
              <div 
                key={template.id} 
                className="group relative bg-slate-950/40 hover:bg-slate-950/80 border border-slate-900 hover:border-slate-800/80 rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: template.brand_color || '#10b981' }} />
                      <h3 className="text-xs font-bold text-heading tracking-wide truncate max-w-[150px]">
                        {template.name}
                      </h3>
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEdit(template)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg border border-slate-800/80 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800/80 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/30 p-2.5 rounded-xl border border-slate-900/60">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Brand Title</span>
                      <span className="text-slate-300 font-semibold truncate block">{template.brand_title}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Badge Pill</span>
                      <span className="text-slate-300 truncate block">{template.badge_text}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Pitch Title</span>
                    <p className="text-zinc-300 text-xs font-semibold truncate mt-0.5">{template.video_title}</p>
                  </div>

                  <div className="flex gap-4 text-[10px] text-slate-500 border-t border-slate-900/50 pt-2.5">
                    <span className="flex items-center gap-1"><Link className="w-3 h-3 text-emerald-400" /> CTA: {template.cta_text || 'None'}</span>
                    {template.website_url && <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-indigo-400" /> Website override active</span>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
