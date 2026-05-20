import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Plus, Trash, Play, Pause, Users, Edit3, X, ChevronRight, Check } from 'lucide-react';

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals / Editors
  const [showBuilder, setShowBuilder] = useState(false);
  const [showLeadLinker, setShowLeadLinker] = useState<string | null>(null);
  
  // New Campaign Form State
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<any[]>([
    { subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }
  ]);

  // Lead selection tracking
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [linkerSearch, setLinkerSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get campaigns
      const { data: campaignData } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      if (campaignData) setCampaigns(campaignData);

      // Get video recordings
      const { data: videoData } = await supabase.from('video_recordings').select('*').order('created_at', { ascending: false });
      if (videoData) setVideos(videoData);

      // Get available leads
      const { data: leadData } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (leadData) setLeads(leadData);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStep = () => {
    setSteps([...steps, { subject: 'Follow up on my last email', body: 'Hey {{first_name}},\n\nChecking back on this...', delay_hours: 48, videoId: '' }]);
  };

  const handleRemoveStep = (index: number) => {
    const nextSteps = [...steps];
    nextSteps.splice(index, 1);
    setSteps(nextSteps);
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    const nextSteps = [...steps];
    nextSteps[index] = { ...nextSteps[index], [field]: value };
    setSteps(nextSteps);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || steps.length === 0) return;

    try {
      const { error } = await supabase.from('campaigns').insert({
        name,
        steps,
        status: 'draft',
      });

      if (!error) {
        setName('');
        setSteps([{ subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }]);
        setShowBuilder(false);
        fetchData();
      } else {
        alert(error.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    await supabase.from('campaigns').update({ status: nextStatus }).eq('id', id);
    fetchData();
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    await supabase.from('campaigns').delete().eq('id', id);
    fetchData();
  };

  // Link selected leads to the campaign with smart staggering
  const handleLinkLeads = async () => {
    if (!showLeadLinker || selectedLeadIds.length === 0) return;

    try {
      // 1. Fetch active inboxes to dynamically load balance the schedule
      const { data: activeInboxes } = await supabase
        .from('inboxes')
        .select('id')
        .eq('status', 'active');

      const inboxCount = activeInboxes && activeInboxes.length > 0 ? activeInboxes.length : 1;

      // Stagger spacing per lead: 150 seconds (2.5 mins) divided by total active inboxes
      const staggerIntervalSeconds = Math.max(30, Math.floor(150 / inboxCount));

      // Smart Scheduler bounds (Mon-Fri, 9:00 AM to 5:00 PM local/standard sending time)
      const baseDate = new Date();
      const getNextSmartSendTime = (index: number) => {
        const date = new Date(baseDate.getTime());
        // Stagger indexing with a minor randomized jitter (+- 15 seconds) to prevent bot-sending footprints
        const jitter = Math.floor(Math.random() * 30) - 15;
        date.setSeconds(date.getSeconds() + (index * staggerIntervalSeconds) + jitter);

        const adjustToBusinessHours = (d: Date) => {
          const day = d.getDay(); // 0 = Sunday, 6 = Saturday
          let adjusted = false;

          // Weekend check
          if (day === 0) { // Sunday
            d.setDate(d.getDate() + 1);
            d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
            adjusted = true;
          } else if (day === 6) { // Saturday
            d.setDate(d.getDate() + 2);
            d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
            adjusted = true;
          }

          // Business hours check (9:00 AM - 5:00 PM)
          const currentHour = d.getHours();
          if (currentHour < 9) {
            d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
            adjusted = true;
          } else if (currentHour >= 17) {
            d.setDate(d.getDate() + 1);
            d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
            adjusted = true;
            
            const newDay = d.getDay();
            if (newDay === 0) d.setDate(d.getDate() + 1);
            else if (newDay === 6) d.setDate(d.getDate() + 2);
          }
          return adjusted;
        };

        // Cascade loops until a valid business day time window is resolved
        while (adjustToBusinessHours(date)) {}
        return date;
      };

      const campaignLeads = selectedLeadIds.map((leadId, idx) => ({
        campaign_id: showLeadLinker,
        lead_id: leadId,
        status: 'pending',
        current_step_index: 0,
        next_send_time: getNextSmartSendTime(idx).toISOString(),
      }));

      const { error } = await supabase.from('campaign_leads').upsert(campaignLeads, { onConflict: 'campaign_id,lead_id' });
      if (error) {
        alert(error.message);
      } else {
        alert(`Linked ${selectedLeadIds.length} leads to campaign. Emails have been queued at spam-safe 2-3 min stagger intervals, restricted to standard business hours (Mon-Fri 9AM-5PM).`);
        setSelectedLeadIds([]);
        setShowLeadLinker(null);
        fetchData();
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error scheduling campaign: ${err.message}`);
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Mail className="w-7 h-7 text-emerald-400" />
            Outreach Campaigns
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Build sequence steps, attach video pitches, and orchestrate email sending rotation.
          </p>
        </div>

        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Create Sequence
        </button>
      </div>

      {/* Grid List of Campaigns */}
      {loading ? (
        <div className="glass-panel p-12 text-center text-slate-400">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="glass-panel p-12 text-center text-slate-400 border border-dashed border-slate-800">
          No outreach sequences built yet. Click &apos;Create Sequence&apos; to launch one!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map((camp) => (
            <div key={camp.id} className="glass-panel p-6 rounded-2xl border border-slate-800/60 flex flex-col justify-between hover:border-emerald-500/20 transition-all">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white">{camp.name}</h3>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1.5 border ${
                      camp.status === 'active' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                      {camp.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleStatus(camp.id, camp.status)}
                      className={`p-2 rounded-lg transition-colors border ${
                        camp.status === 'active'
                          ? 'border-amber-500/25 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                      title={camp.status === 'active' ? 'Pause' : 'Start'}
                    >
                      {camp.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteCampaign(camp.id)}
                      className="p-2 border border-slate-850 hover:border-rose-500/40 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                      title="Delete Campaign"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-1 bg-slate-950/45 p-3.5 rounded-xl border border-slate-900/60">
                  <div className="flex justify-between">
                    <span>Total Sequence Steps:</span>
                    <span className="font-semibold text-white">{(camp.steps || []).length} steps</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/40 flex justify-between gap-3">
                <button
                  onClick={() => setShowLeadLinker(camp.id)}
                  className="flex-1 py-2 border border-slate-800 hover:bg-slate-800/50 text-slate-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  Add Leads
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Sequence Builder */}
      {showBuilder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-4xl rounded-2xl border border-slate-800/80 max-h-[85vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-4">
              <h3 className="text-lg font-bold text-white">Build Sequence Campaign</h3>
              <button onClick={() => setShowBuilder(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Campaign Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Agency Outreach Sequence"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm font-semibold"
                  required
                />
              </div>

              {/* Dynamic steps builder list */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-300">Sequence Mail Steps</h4>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                  >
                    + Add Mail Step
                  </button>
                </div>

                <div className="space-y-4">
                  {steps.map((step, idx) => (
                    <div key={idx} className="glass-panel p-5 rounded-xl border border-slate-800/60 relative space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          Step {idx + 1}
                        </span>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="text-slate-500 hover:text-rose-400 text-xs flex items-center gap-0.5"
                          >
                            <Trash className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Subject Line</label>
                          <input
                            type="text"
                            value={step.subject}
                            onChange={(e) => handleStepChange(idx, 'subject', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg glass-input text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Delay (Hours)</label>
                          <input
                            type="number"
                            value={step.delay_hours}
                            onChange={(e) => handleStepChange(idx, 'delay_hours', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-lg glass-input text-xs"
                            min="0"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Body HTML/Text</label>
                        <textarea
                          value={step.body}
                          onChange={(e) => handleStepChange(idx, 'body', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg glass-input text-xs h-32 font-mono resize-y"
                          required
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Available variables: <code className="text-emerald-400 font-bold">{"{{first_name}}"}</code>, <code className="text-emerald-400 font-bold">{"{{last_name}}"}</code>, <code className="text-emerald-400 font-bold">{"{{company}}"}</code>, <code className="text-emerald-400 font-bold">{"{{website}}"}</code>.
                        </p>
                      </div>

                      {/* Video Spark Embed link selection */}
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Attach VideoSpark pitch (Optional)</label>
                        <select
                          value={step.videoId}
                          onChange={(e) => handleStepChange(idx, 'videoId', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg glass-input text-xs cursor-pointer"
                        >
                          <option value="">None (Plain text email)</option>
                          {videos.map(v => (
                            <option key={v.id} value={v.id}>{v.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800/60 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBuilder(false)}
                  className="px-4 py-2 border border-slate-850 text-slate-400 hover:bg-slate-850 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                >
                  Save Campaign Sequence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Lead Linker */}
      {showLeadLinker && (() => {
        // Filter leads based on the search query
        const matchedLeads = leads.filter(lead => {
          const term = linkerSearch.toLowerCase();
          return (
            lead.email.toLowerCase().includes(term) ||
            (lead.first_name || '').toLowerCase().includes(term) ||
            (lead.company || '').toLowerCase().includes(term)
          );
        });

        const displayedLeads = matchedLeads.slice(0, 50); // safe limit for rendering

        const handleSelectAllMatched = () => {
          const matchedIds = matchedLeads.map(l => l.id);
          setSelectedLeadIds(prev => {
            const union = new Set([...prev, ...matchedIds]);
            return Array.from(union);
          });
        };

        const handleClearSelection = () => {
          setSelectedLeadIds([]);
        };

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-2xl rounded-2xl border border-slate-800/80 max-h-[85vh] overflow-y-auto p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800/60 pb-4">
                <h3 className="text-lg font-bold text-white">Add Leads to Sequence</h3>
                <button
                  onClick={() => {
                    setShowLeadLinker(null);
                    setLinkerSearch('');
                  }}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {leads.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No leads available in database. Create or import some first.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Search Prospect Leads</label>
                    <input
                      type="text"
                      placeholder="Search by name, email, or company..."
                      value={linkerSearch}
                      onChange={(e) => setLinkerSearch(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-xs"
                    />
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Matches: {matchedLeads.length} leads ({selectedLeadIds.length} selected)
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllMatched}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-bold"
                      >
                        Select All Matches
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="px-2.5 py-1 border border-slate-800 hover:bg-slate-800/40 text-slate-400 rounded text-[10px] font-bold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-slate-800/60 max-h-60 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/30 p-2 space-y-1">
                    {displayedLeads.map(lead => {
                      const isSelected = selectedLeadIds.includes(lead.id);
                      return (
                        <button
                          key={lead.id}
                          onClick={() => toggleSelectLead(lead.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                            isSelected ? 'bg-indigo-600/10' : 'hover:bg-slate-900/40'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-white text-sm">{lead.first_name} {lead.last_name || ''}</div>
                            <div className="text-xs text-slate-500">{lead.email} - {lead.company || 'No Company'}</div>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                            isSelected ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-700 bg-slate-950'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}
                    {matchedLeads.length > 50 && (
                      <div className="p-3 text-center text-slate-500 text-[10px] font-semibold italic">
                        Showing first 50 results. Use the search input above to narrow down results.
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-800/60">
                    <button
                      onClick={() => {
                        setShowLeadLinker(null);
                        setLinkerSearch('');
                      }}
                      className="px-4 py-2 border border-slate-850 text-slate-400 hover:bg-slate-850 text-xs font-semibold rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLinkLeads}
                      disabled={selectedLeadIds.length === 0}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-40"
                    >
                      Link Selected Leads ({selectedLeadIds.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
