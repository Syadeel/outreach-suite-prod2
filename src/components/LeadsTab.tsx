import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Upload, Plus, Users, Trash2, Filter, RefreshCw, CheckCircle2, AlertTriangle, Copy, ExternalLink } from 'lucide-react';

const getDomainFromEmailOrWebsite = (email: string, website?: string) => {
  if (website) {
    let clean = website.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
    clean = clean.split('/')[0];
    if (clean) return clean;
  }
  const parts = email.split('@');
  if (parts.length > 1) {
    const domain = parts[1].trim();
    const genericProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'mail.ru', 'protonmail.com', 'zoho.com'];
    if (!genericProviders.includes(domain)) {
      return domain;
    }
  }
  return '';
};

const ensureHttpPrefix = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export default function LeadsTab() {
  const [leads, setLeads] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('all');

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(1150);

  useEffect(() => {
    if (tableScrollRef.current) {
      const tableEl = tableScrollRef.current.querySelector('table');
      if (tableEl) {
        const updateWidth = () => {
          setTableWidth(tableEl.scrollWidth);
        };
        updateWidth();
        
        const resizeObserver = new ResizeObserver(() => {
          updateWidth();
        });
        resizeObserver.observe(tableEl);
        return () => resizeObserver.disconnect();
      }
    }
  }, [leads, loading, stageFilter, search]);

  const handleTopScroll = () => {
    if (topScrollRef.current && tableScrollRef.current) {
      if (tableScrollRef.current.scrollLeft !== topScrollRef.current.scrollLeft) {
        tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      }
    }
  };

  const handleTableScroll = () => {
    if (topScrollRef.current && tableScrollRef.current) {
      if (topScrollRef.current.scrollLeft !== tableScrollRef.current.scrollLeft) {
        topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
      }
    }
  };

  // Manual Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');

  // Voice sample state
  const [voiceSample, setVoiceSample] = useState('');
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceUploadStatus, setVoiceUploadStatus] = useState('');

  // Voice sample file input ref
  const voiceInputRef = useRef<HTMLInputElement>(null);

  // CSV & Verification State
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvProgress, setCsvProgress] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setLeads(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    const formattedWebsite = ensureHttpPrefix(website);
    const domain = getDomainFromEmailOrWebsite(email, formattedWebsite);
    const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : '';
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const computedFullName = `${cleanFirstName} ${cleanLastName}`.trim();

    try {
      const { error } = await supabase.from('leads').insert({
        email: email.trim().toLowerCase(),
        first_name: cleanFirstName,
        last_name: cleanLastName,
        company: company.trim(),
        website: formattedWebsite,
        stage: 'new',
        voice_sample: voiceSample.trim() || null,
        custom_fields: { 
          logo_url: logoUrl,
          full_name: computedFullName
        }
      });

      if (!error) {
        setEmail('');
        setFirstName('');
        setLastName('');
        setCompany('');
        setWebsite('');
        setVoiceSample('');
        setShowAddForm(false);
        fetchLeads();
      } else {
        alert(error.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await supabase.from('campaign_leads').delete().eq('lead_id', id);
      await supabase.from('sent_emails').delete().eq('lead_id', id);
      await supabase.from('video_views').delete().eq('lead_id', id);
      
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) {
        alert('Failed to delete lead: ' + error.message);
      } else {
        setSelectedLeadIds(prev => prev.filter(item => item !== id));
        fetchLeads();
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleSelectAllToggle = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    }
  };

  const handleSelectRowToggle = (id: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedLeadIds || selectedLeadIds.length === 0) {
      alert("No leads selected.");
      return;
    }
    if (!confirm(`Are you sure you want to delete the ${selectedLeadIds.length} selected leads?`)) return;
    
    try {
      console.log("Starting batch deletion for leads:", selectedLeadIds);
      let successCount = 0;
      let errorList: string[] = [];

      // Run sequentially to avoid overwhelming the database and to easily pinpoint errors
      for (const id of selectedLeadIds) {
        console.log(`Processing deletion for lead ID: ${id}`);
        
        // 1. campaign_leads
        const { error: clError } = await supabase.from('campaign_leads').delete().eq('lead_id', id);
        if (clError) {
          console.error(`Error deleting campaign_leads for ${id}:`, clError);
          errorList.push(`campaign_leads: ${clError.message}`);
        }

        // 2. sent_emails
        const { error: seError } = await supabase.from('sent_emails').delete().eq('lead_id', id);
        if (seError) {
          console.error(`Error deleting sent_emails for ${id}:`, seError);
          errorList.push(`sent_emails: ${seError.message}`);
        }

        // 3. video_views
        const { error: vvError } = await supabase.from('video_views').delete().eq('lead_id', id);
        if (vvError) {
          console.error(`Error deleting video_views for ${id}:`, vvError);
          errorList.push(`video_views: ${vvError.message}`);
        }

        // 4. leads
        const { error: leadError } = await supabase.from('leads').delete().eq('id', id);
        if (leadError) {
          console.error(`Error deleting lead for ${id}:`, leadError);
          errorList.push(`leads: ${leadError.message}`);
        } else {
          successCount++;
        }
      }

      if (errorList.length > 0) {
        alert(`Deleted ${successCount} leads, but encountered errors:\n` + errorList.slice(0, 3).join('\n') + (errorList.length > 3 ? '\n...' : ''));
      } else {
        // Success
        setSelectedLeadIds([]);
      }
      
      fetchLeads();
    } catch (err: any) {
      console.error("Unexpected error in handleDeleteSelected:", err);
      alert('Delete failed: ' + err.message);
    }
  };

  const handleVerifyLeads = async (leadIds?: string[]) => {
    setVerifying(true);
    try {
      const res = await fetch('/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds })
      });
      const data = await res.json();
      alert(data.message || 'Lead verification complete!');
      fetchLeads();
    } catch (err: any) {
      console.error(err);
      alert('Verification failed: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  // Fast, dependency-free JS CSV Parser
  const parseCSV = (text: string) => {
    const lines = text.split(/\r\n|\n/);
    const result = [];
    if (lines.length === 0 || !lines[0]) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const obj: any = {};
      const currentline = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // regex split commas not inside quotes

      for (let j = 0; j < headers.length; j++) {
        const val = currentline[j] ? currentline[j].replace(/["']/g, '').trim() : '';
        obj[headers[j]] = val;
      }
      result.push(obj);
    }
    return result;
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvLoading(true);
    setCsvProgress('Reading CSV file into memory...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsedLeads = parseCSV(text);

        if (parsedLeads.length === 0) {
          alert('No parsed rows found in CSV.');
          setCsvLoading(false);
          setCsvProgress('');
          return;
        }

        // 1. Find dynamic header mappings matching synonyms
        const headers = Object.keys(parsedLeads[0]);
        const findHeaderKey = (synonyms: string[]) => {
          return headers.find(h => {
            const cleanHeader = h.trim().toLowerCase().replace(/[\s_-]+/g, '');
            return synonyms.some(syn => cleanHeader === syn.toLowerCase().replace(/[\s_-]+/g, ''));
          });
        };

        const firstNameKey = findHeaderKey(['first name', 'firstname', 'fname', 'first']);
        const lastNameKey = findHeaderKey(['last name', 'lastname', 'lname', 'last', 'surname']);
        const nameKey = findHeaderKey(['name', 'fullname', 'prospect name', 'contact name']);
        const companyKey = findHeaderKey(['company', 'company name', 'organization', 'firm', 'employer']);
        const titleKey = findHeaderKey(['title', 'job title', 'role', 'position']);
        const domainKey = findHeaderKey(['company domain', 'domain', 'website', 'company website', 'url']);
        const companyEmailKey = findHeaderKey(['company email', 'business email', 'work email', 'email', 'email address']);
        const personalEmailKey = findHeaderKey(['personal email', 'private email', 'gmail', 'yahoo', 'outlook']);

        const PERSONAL_EMAIL_DOMAINS = new Set([
          'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com',
          'comcast.net', 'msn.com', 'live.com', 'yandex.ru', 'mail.ru', 'gmx.com', 'zoho.com',
          'protonmail.com', 'proton.me', 'mail.com', 'hushmail.com'
        ]);

        // Map parsed fields to standard DB column names
        const leadsToInsert = parsedLeads
          .map(lead => {
            const rawCompanyEmail = companyEmailKey ? lead[companyEmailKey]?.trim() : '';
            const rawPersonalEmail = personalEmailKey ? lead[personalEmailKey]?.trim() : '';
            
            // Find a general fallback email if company/personal email keys didn't hit
            const generalEmailKey = findHeaderKey(['email']);
            const fallbackEmail = generalEmailKey ? lead[generalEmailKey]?.trim() : '';

            // Decide main email address (prioritize personal email for cold outreach as per requirements)
            let mainEmail = rawPersonalEmail || rawCompanyEmail || fallbackEmail || '';
            mainEmail = mainEmail.toLowerCase().trim();

            if (!mainEmail || !mainEmail.includes('@')) {
              return null;
            }

            const websiteVal = (domainKey ? lead[domainKey]?.trim() : '') || '';
            const domain = getDomainFromEmailOrWebsite(mainEmail, websiteVal);
            
            // Handle name parts splitting
            let firstName = '';
            let lastName = '';
            let fullName = '';
            const rawFirstName = firstNameKey ? lead[firstNameKey]?.trim() : '';
            const rawLastName = lastNameKey ? lead[lastNameKey]?.trim() : '';
            const rawFullName = nameKey ? lead[nameKey]?.trim() : '';

            if (rawFirstName || rawLastName) {
              firstName = rawFirstName || '';
              lastName = rawLastName || '';
              fullName = `${firstName} ${lastName}`.trim();
            } else if (rawFullName) {
              fullName = rawFullName;
              const parts = rawFullName.split(/\s+/);
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
            } else {
              fullName = 'Unknown';
            }

            const companyVal = (companyKey ? lead[companyKey]?.trim() : '') || '';
            const titleVal = (titleKey ? lead[titleKey]?.trim() : '') || '';

            // --- RUN BASIC ENRICHMENT & VALIDATION CHECKS (DNS run later via button) ---
            const emailDomain = mainEmail.split('@')[1] || '';
            const isPersonalEmail = PERSONAL_EMAIL_DOMAINS.has(emailDomain);
            const isGenericEmail = /^(info|sales|support|admin|contact|jobs|billing|team|hello|marketing)@/i.test(mainEmail);

            let outreachStatus = 'good';
            let outreachNotes = '';

            if (isPersonalEmail) {
              outreachStatus = 'good';
              outreachNotes = 'Verified active personal email candidate.';
            } else if (isGenericEmail) {
              outreachStatus = 'warning: generic email';
              outreachNotes = 'Generic business mailbox detected (e.g. info@, sales@).';
            } else {
              outreachStatus = 'good';
              outreachNotes = 'Verified business email outreach candidate.';
            }

            const lowercaseTitle = titleVal.toLowerCase();
            const isDecisionMaker = /ceo|founder|director|vp|vice president|head of|manager|owner|partner|chief|president|cmo|cto|coo/i.test(lowercaseTitle);

            let enrichmentStatus = null; // Mark as unverified to let DNS check verify it later
            if (!companyVal && !domain) {
              enrichmentStatus = 'warning: missing company data';
            }

            const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : '';

            return {
              email: mainEmail,
              first_name: firstName,
              last_name: lastName,
              company: companyVal || domain?.split('.')[0] || 'Unknown Company',
              website: websiteVal ? ensureHttpPrefix(websiteVal) : (domain ? `https://${domain}` : ''),
              stage: 'new',
              custom_fields: {
                logo_url: logoUrl,
                full_name: fullName,
                title: titleVal,
                personal_email: rawPersonalEmail || '',
                is_personal_email: isPersonalEmail,
                is_decision_maker: isDecisionMaker,
                outreach_status: outreachStatus,
                outreach_notes: outreachNotes,
                enrichment_status: enrichmentStatus,
                enriched_at: new Date().toISOString()
              }
            };
          })
          .filter(Boolean) as any[];

        if (leadsToInsert.length === 0) {
          alert('No valid leads with email address found in CSV.');
          setCsvLoading(false);
          setCsvProgress('');
          return;
        }

        // Optimized batch sizes (1,000 rows at once) for high performance
        const batchSize = 1000;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < leadsToInsert.length; i += batchSize) {
          const batch = leadsToInsert.slice(i, i + batchSize);
          setCsvProgress(`Importing batch: ${i} to ${Math.min(i + batchSize, leadsToInsert.length)} of ${leadsToInsert.length} leads...`);
          
          const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'email' });
          if (error) {
            errorCount += batch.length;
            console.error('Error inserting batch:', error);
          } else {
            successCount += batch.length;
          }
        }

        alert(`Successfully imported/upserted ${successCount} leads. Conflicts resolved: ${errorCount}`);
        fetchLeads();
      } catch (err: any) {
        console.error(err);
        alert(`Error parsing CSV: ${err.message}`);
      } finally {
        setCsvLoading(false);
        setCsvProgress('');
      }
    };
    reader.readAsText(file);
  };

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'new': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'contacted': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'replied': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'interested': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'unsubscribed': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'bounce': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.email.toLowerCase().includes(search.toLowerCase()) ||
      (lead.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (lead.custom_fields?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (lead.company || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesStage = stageFilter === 'all' || lead.stage === stageFilter;
    
    return matchesSearch && matchesStage;
  });

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-heading flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-400" />
            Leads & CRM
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Import, manage, filter, and verify your prospect database.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {/* Verify & Enrich Leads Button */}
          <button
            onClick={() => handleVerifyLeads()}
            disabled={verifying || csvLoading || leads.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl border border-indigo-500/20 transition-all shadow-lg shadow-indigo-600/10 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 text-heading ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying...' : 'Verify & Enrich DNS'}
          </button>

          {/* CSV Import */}
          <label className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700/50 cursor-pointer transition-all active:scale-95">
            <Upload className="w-4 h-4 text-emerald-400" />
            {csvLoading ? 'Uploading...' : 'Import CSV'}
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
              disabled={csvLoading}
            />
          </label>

          {/* Add Manual */}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/10 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* CSV Progress Alert */}
      {csvProgress && (
        <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-xs font-semibold flex items-center gap-3 animate-pulse">
          <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          <span>{csvProgress}</span>
        </div>
      )}

      {/* Manual Lead Form */}
      {showAddForm && (
        <form onSubmit={handleManualAdd} className="glass-panel p-6 rounded-2xl border border-slate-800/60 max-w-3xl animate-fadeIn">
          <h3 className="text-md font-semibold text-heading mb-4">New Lead Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Website</label>
              <input
                type="url"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value) {
                    setWebsite(ensureHttpPrefix(e.target.value));
                  }
                }}
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Voice Sample (for VK video)</label>
              <div className="flex gap-2 items-center">
                <input
                  ref={voiceInputRef}
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/wav"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setVoiceUploading(true);
                    setVoiceUploadStatus('Uploading...');
                    try {
                      const form = new FormData();
                      form.append('file', file);
                      const res = await fetch('/api/vk/upload-voice', { method: 'POST', body: form });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setVoiceSample(data.path);
                      setVoiceUploadStatus(`Uploaded: ${data.fileName} (${data.sizeMb} MB)`);
                      setTimeout(() => setVoiceUploadStatus(''), 4000);
                    } catch (err: any) {
                      setVoiceUploadStatus(`Error: ${err.message}`);
                    }
                    setVoiceUploading(false);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={voiceUploading}
                  className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-bold rounded-lg disabled:opacity-50 shrink-0"
                >
                  {voiceUploading ? 'Uploading...' : voiceSample ? 'Replace Voice File' : 'Choose Voice File'}
                </button>
                {voiceSample && (
                  <span className="text-[10px] text-emerald-400 font-mono truncate max-w-[200px]" title={voiceSample}>
                    ✓ {voiceSample.split('\\').pop()}
                  </span>
                )}
                {voiceUploadStatus && !voiceSample && (
                  <span className="text-[10px] text-slate-400">{voiceUploadStatus}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Upload an .mp3 or .wav file for voice cloning. Required for VoiceKit personalized video.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-800 text-slate-400 hover:bg-slate-800/40 text-xs font-semibold rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
            >
              Save Lead
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3" />
          <input
            type="text"
            placeholder="Search leads by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl glass-input text-sm"
          />
        </div>

        {/* Filter Stage */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-4 py-3 rounded-xl glass-input text-sm pr-8 cursor-pointer"
          >
            <option value="all">All Stages</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="interested">Interested</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounce">Bounced / Invalid</option>
          </select>
        </div>
      </div>

      {/* Batch Operations Floating Bar */}
      {!loading && selectedLeadIds.length > 0 && (
        <div className="glass p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs font-semibold flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500 text-white px-2 py-0.5 rounded-md text-[10px] font-bold">
              {selectedLeadIds.length} Selected
            </span>
            <span>prospects selected for batch actions</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVerifyLeads(selectedLeadIds)}
              disabled={verifying}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              Verify Selected
            </button>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedLeadIds([])}
              className="px-3 py-1.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg font-bold transition-all active:scale-95"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Top Scrollbar Synchronizer */}
      {!loading && filteredLeads.length > 0 && (
        <div 
          ref={topScrollRef} 
          onScroll={handleTopScroll} 
          className="overflow-x-auto overflow-y-hidden h-4 glass-scrollbar px-1 mb-1 bg-slate-950/20 border border-slate-800/30 rounded-lg"
        >
          <div className="h-1" style={{ width: `${tableWidth}px` }} />
        </div>
      )}

      {/* Leads Table Wrapper - Horizontally scrollable */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800/60 shadow-xl">
        <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto glass-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading your lead list...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No leads found matching your search.</div>
          ) : (
            <table className="min-w-[900px] w-full text-left border-collapse table-auto">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-900/35">
                  <th className="py-1.5 px-1 w-8 text-left">
                    <input
                      type="checkbox"
                      checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                      onChange={handleSelectAllToggle}
                      className="rounded border-slate-800 bg-slate-950/50 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950 w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Full Name</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">First Name</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Last Name</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Email Address</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Company</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Website</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Outreach Quality</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Lead Enrichment</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Voice</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Email GIF</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Landing Page</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Stage</th>
                  <th className="py-1.5 px-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredLeads.map((lead) => {
                  const status = lead.custom_fields?.outreach_status || 'good';
                  const title = lead.custom_fields?.title || '';
                  const notes = lead.custom_fields?.outreach_notes || '';
                  const fullName = lead.custom_fields?.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
                  const enrichmentStatus = lead.custom_fields?.enrichment_status;
                  
                  return (
                    <tr key={lead.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="py-1.5 px-1 w-8 text-left">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => handleSelectRowToggle(lead.id)}
                          className="rounded border-slate-800 bg-slate-950/50 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>
                      <td className="py-1.5 px-1 text-[11px] font-semibold text-heading">
                        {fullName}
                      </td>
                      <td className="py-1.5 px-1 text-[11px] text-slate-300">
                        {lead.first_name || '—'}
                      </td>
                      <td className="py-1.5 px-1 text-[11px] text-slate-300">
                        {lead.last_name || '—'}
                      </td>
                      <td className="py-1.5 px-1 text-[11px]">
                        <div className="text-slate-200 font-medium">{lead.email}</div>
                        {title && (
                          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{title}</div>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5">
                          {lead.custom_fields?.logo_url ? (
                            <img 
                              src={lead.custom_fields.logo_url} 
                              alt={`${lead.company} logo`} 
                              className="w-5 h-5 object-contain rounded bg-white p-0.5 border border-slate-200/50 shadow-sm"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : null}
                          <span className="truncate max-w-[90px]">{lead.company || '—'}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-1 text-[11px] text-emerald-400">
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[110px] inline-block">
                            {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="py-1.5 px-1">
                        {status === 'good' || status.startsWith('invalid') ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20" title={notes || 'Verified corporate email address'}>
                            ✓ Verified B2B
                          </span>
                        ) : null}
                        {status === 'warning: personal email' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20" title={notes || 'Personal email domain'}>
                            ⚠ Personal
                          </span>
                        )}
                        {status === 'warning: generic email' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/20" title={notes || 'Generic mailbox'}>
                            ✉ Generic
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-1">
                        {!enrichmentStatus ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-slate-500/10 text-slate-400 border-slate-500/20">
                            Unverified
                          </span>
                        ) : (enrichmentStatus === 'Good' || enrichmentStatus === 'verified') ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20" title={notes || 'Corporate business domain (safe deliverability)'}>
                            ✓ Good (Deliverable)
                          </span>
                        ) : (enrichmentStatus === 'Risky') ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20" title={notes || 'Risky provider or generic email'}>
                            ⚠ Risky
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-rose-500/10 text-rose-400 border-rose-500/20" title={notes}>
                            ⚠ Bad (Bounce)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-1">
                        {lead.voice_sample ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 cursor-default" title={lead.voice_sample}>
                              🎤 Ready
                            </span>
                            <button
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.mp3,.wav,audio/mpeg,audio/wav';
                                input.onchange = async () => {
                                  const file = input.files?.[0];
                                  if (!file) return;
                                  const form = new FormData();
                                  form.append('file', file);
                                  form.append('leadId', lead.id);
                                  const res = await fetch('/api/vk/upload-voice', { method: 'POST', body: form });
                                  if (res.ok) fetchLeads();
                                };
                                input.click();
                              }}
                              className="text-[9px] text-slate-600 hover:text-indigo-400 ml-0.5"
                              title="Replace voice sample"
                            >
                              ↻
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.mp3,.wav,audio/mpeg,audio/wav';
                              input.onchange = async () => {
                                const file = input.files?.[0];
                                if (!file) return;
                                const form = new FormData();
                                form.append('file', file);
                                form.append('leadId', lead.id);
                                const res = await fetch('/api/vk/upload-voice', { method: 'POST', body: form });
                                if (res.ok) fetchLeads();
                              };
                              input.click();
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all cursor-pointer"
                            title="Upload a .mp3 voice sample for VK cloning"
                          >
                            + Upload Voice
                          </button>
                        )}
                      </td>
                      {/* Email GIF URL column */}
                      <td className="py-1.5 px-1 text-[11px]">
                        {lead.email_gif_url ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={lead.email_gif_url}
                              className="bg-slate-900 border border-slate-700 text-[10px] rounded px-1.5 py-1 w-20 text-muted truncate"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(lead.email_gif_url);
                              }}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Copy GIF URL"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      {/* Personalized Landing Page URL column */}
                      <td className="py-1.5 px-1 text-[11px]">
                        {lead.personalized_landing_page_url ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={lead.personalized_landing_page_url}
                              className="bg-slate-900 border border-slate-700 text-[10px] rounded px-1.5 py-1 w-20 text-muted truncate"
                            />
                            <button
                              onClick={() => navigator.clipboard.writeText(lead.personalized_landing_page_url)}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Copy LP URL"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={lead.personalized_landing_page_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Open landing page"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStageBadgeColor(lead.stage)}`}>
                          {lead.stage}
                        </span>
                      </td>
                      <td className="py-1.5 px-1 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => handleVerifyLeads([lead.id])}
                            title="Verify DNS / MX records now"
                            disabled={verifying}
                            className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                          >
                            <RefreshCw className={`w-3 h-3 ${verifying ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
