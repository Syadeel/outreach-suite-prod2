import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Upload, Plus, Users, Trash2, Filter } from 'lucide-react';

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

export default function LeadsTab() {
  const [leads, setLeads] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('all');

  // Manual Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');

  // CSV State
  const [csvLoading, setCsvLoading] = useState(false);

  useEffect(() => {
    fetchLeads();
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

    const domain = getDomainFromEmailOrWebsite(email, website);
    const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : '';

    try {
      const { error } = await supabase.from('leads').insert({
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        company: company.trim(),
        website: website.trim(),
        stage: 'new',
        custom_fields: { logo_url: logoUrl }
      });

      if (!error) {
        setEmail('');
        setFirstName('');
        setLastName('');
        setCompany('');
        setWebsite('');
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
    await supabase.from('leads').delete().eq('id', id);
    fetchLeads();
  };

  // Fast, dependency-free JS CSV Parser
  const parseCSV = (text: string) => {
    const lines = text.split(/\r\n|\n/);
    const result = [];
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

  const [csvProgress, setCsvProgress] = useState('');

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

        // 1. Find dynamic header mappings matching synonmys
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

            // Decide main email address
            let mainEmail = rawCompanyEmail || fallbackEmail || rawPersonalEmail || '';
            mainEmail = mainEmail.toLowerCase().trim();

            if (!mainEmail || !mainEmail.includes('@')) {
              return null;
            }

            const websiteVal = (domainKey ? lead[domainKey]?.trim() : '') || '';
            const domain = getDomainFromEmailOrWebsite(mainEmail, websiteVal);
            
            // Handle name parts splitting
            let firstName = '';
            let lastName = '';
            const rawFirstName = firstNameKey ? lead[firstNameKey]?.trim() : '';
            const rawLastName = lastNameKey ? lead[lastNameKey]?.trim() : '';
            const rawFullName = nameKey ? lead[nameKey]?.trim() : '';

            if (rawFirstName || rawLastName) {
              firstName = rawFirstName || '';
              lastName = rawLastName || '';
            } else if (rawFullName) {
              const parts = rawFullName.split(/\s+/);
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
            }

            const companyVal = (companyKey ? lead[companyKey]?.trim() : '') || '';
            const titleVal = (titleKey ? lead[titleKey]?.trim() : '') || '';

            // --- RUN ENRICHMENT & VALIDATION CHECKS ---
            const emailDomain = mainEmail.split('@')[1] || '';
            const isPersonalEmail = PERSONAL_EMAIL_DOMAINS.has(emailDomain);
            const isGenericEmail = /^(info|sales|support|admin|contact|jobs|billing|team|hello|marketing)@/i.test(mainEmail);

            let outreachStatus = 'good';
            let outreachNotes = '';

            if (isPersonalEmail) {
              outreachStatus = 'warning: personal email';
              outreachNotes = 'Personal email domain detected. Confirm compliance before sending cold pitches.';
            } else if (isGenericEmail) {
              outreachStatus = 'warning: generic email';
              outreachNotes = 'Generic business mailbox detected (e.g. info@, sales@).';
            } else {
              outreachStatus = 'good';
              outreachNotes = 'Verified business email outreach candidate.';
            }

            const lowercaseTitle = titleVal.toLowerCase();
            const isDecisionMaker = /ceo|founder|director|vp|vice president|head of|manager|owner|partner|chief|president|cmo|cto|coo/i.test(lowercaseTitle);

            let enrichmentStatus = 'verified';
            if (!companyVal && !domain) {
              enrichmentStatus = 'warning: missing company data';
            }

            const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : '';

            return {
              email: mainEmail,
              first_name: firstName,
              last_name: lastName,
              company: companyVal || domain?.split('.')[0] || 'Unknown Company',
              website: websiteVal || (domain ? `https://${domain}` : ''),
              stage: 'new',
              custom_fields: {
                logo_url: logoUrl,
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

        // Optimized batch sizes (1,000 rows at once) for high performance on 20k+ files
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
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.email.toLowerCase().includes(search.toLowerCase()) ||
      (lead.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (lead.company || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesStage = stageFilter === 'all' || lead.stage === stageFilter;
    
    return matchesSearch && matchesStage;
  });

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-400" />
            Leads & CRM
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Import, manage, and filter your prospect database.
          </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
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
          <h3 className="text-md font-semibold text-white mb-4">New Lead Details</h3>
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
                className="w-full px-3 py-2 rounded-lg glass-input text-sm"
              />
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
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800/60">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading your lead list...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No leads found matching your search.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-900/35">
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">Prospect</th>
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">Company</th>
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">Website</th>
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">Outreach Quality</th>
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">Stage</th>
                  <th className="p-4 text-xs font-semibold uppercase text-slate-400 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredLeads.map((lead) => {
                  const status = lead.custom_fields?.outreach_status || 'good';
                  const title = lead.custom_fields?.title || '';
                  const notes = lead.custom_fields?.outreach_notes || '';
                  
                  return (
                    <tr key={lead.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-white">
                          {lead.first_name} {lead.last_name || ''}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{lead.email}</div>
                        {title && (
                          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">{title}</div>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-300">
                        <div className="flex items-center gap-2">
                          {lead.custom_fields?.logo_url ? (
                            <img 
                              src={lead.custom_fields.logo_url} 
                              alt={`${lead.company} logo`} 
                              className="w-6 h-6 object-contain rounded bg-white p-0.5 border border-slate-200/50 shadow-sm"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : null}
                          <span>{lead.company || '—'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-emerald-400">
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="p-4">
                        {status === 'good' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20" title={notes || 'Verified corporate email address'}>
                            ✓ Verified B2B
                          </span>
                        )}
                        {status === 'warning: personal email' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20" title={notes || 'Personal email domain'}>
                            ⚠ Personal Email
                          </span>
                        )}
                        {status === 'warning: generic email' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/20" title={notes || 'Generic mailbox'}>
                            ✉ Generic Business
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStageBadgeColor(lead.stage)}`}>
                          {lead.stage}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
