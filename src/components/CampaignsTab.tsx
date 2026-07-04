'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Mail, Plus, Trash, Play, Pause, Users, Edit3, X, ChevronRight, Check, LayoutGrid, List, Send, Loader } from 'lucide-react'
import s from './CampaignsTab.module.css'
import { useToast } from '../components/Toast'

export default function CampaignsTab() {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [videos, setVideos] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [showLeadLinker, setShowLeadLinker] = useState<string | null>(null)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<any[]>([{ subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }])
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [linkerSearch, setLinkerSearch] = useState('')
  const [templates, setTemplates] = useState<any[]>([])
  const [lpTemplates, setLpTemplates] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') { const v = localStorage.getItem('campaigns-view-mode'); if (v === 'grid' || v === 'list') return v }
    return 'grid'
  })

  useEffect(() => { fetchData() }, [])
  useEffect(() => { localStorage.setItem('campaigns-view-mode', viewMode) }, [viewMode])

  const fetchData = async () => {
    try {
      const { data: campaignData } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
      if (campaignData) setCampaigns(campaignData)
      const { data: videoData } = await supabase.from('video_recordings').select('*').order('created_at', { ascending: false })
      if (videoData) setVideos(videoData)
      const { data: leadData } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (leadData) setLeads(leadData)
      const { data: templateData } = await supabase.from('email_templates').select('*').order('created_at', { ascending: false })
      if (templateData) setTemplates(templateData)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleAddStep = () => setSteps([...steps, { subject: 'Follow up on my last email', body: 'Hey {{first_name}},\n\nChecking back on this...', delay_hours: 48, videoId: '' }])
  const handleRemoveStep = (i: number) => { const next = [...steps]; next.splice(i, 1); setSteps(next) }
  const handleStepChange = (i: number, field: string, value: any) => { const next = [...steps]; next[i] = { ...next[i], [field]: value }; setSteps(next) }

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || steps.length === 0) return
    try {
      if (editingCampaignId) {
        await supabase.from('campaigns').update({ name, steps }).eq('id', editingCampaignId)
      } else {
        await supabase.from('campaigns').insert({ name, steps, status: 'draft' })
      }
      setName(''); setSteps([{ subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }]); setShowBuilder(false); setEditingCampaignId(null); fetchData()
    } catch (err) { console.error(err) }
  }

  const handleEditCampaign = (camp: any) => { setEditingCampaignId(camp.id); setName(camp.name); setSteps(camp.steps || []); setShowBuilder(true) }
  const handleToggleStatus = async (id: string, currentStatus: string) => { await supabase.from('campaigns').update({ status: currentStatus === 'active' ? 'paused' : 'active' }).eq('id', id); fetchData() }
  const handleDeleteCampaign = async (id: string) => { if (!confirm('Delete this campaign?')) return; await supabase.from('campaigns').delete().eq('id', id); fetchData() }

  const handleLinkLeads = async () => {
    if (!showLeadLinker || selectedLeadIds.length === 0) return
    try {
      const { data: activeInboxes } = await supabase.from('inboxes').select('id').eq('status', 'active')
      const inboxCount = activeInboxes?.length || 1
      const staggerIntervalSeconds = Math.max(30, Math.floor(150 / inboxCount))
      const baseDate = new Date()
      const getNextSmartSendTime = (index: number) => {
        const date = new Date(baseDate.getTime())
        const jitter = Math.floor(Math.random() * 30) - 15
        date.setSeconds(date.getSeconds() + (index * staggerIntervalSeconds) + jitter)
        const day = date.getDay()
        if (day === 0) { date.setDate(date.getDate() + 1); date.setHours(9, Math.floor(Math.random() * 30), 0, 0) }
        else if (day === 6) { date.setDate(date.getDate() + 2); date.setHours(9, Math.floor(Math.random() * 30), 0, 0) }
        const hour = date.getHours()
        if (hour < 9) { date.setHours(9, Math.floor(Math.random() * 30), 0, 0) }
        else if (hour >= 17) { date.setDate(date.getDate() + 1); date.setHours(9, Math.floor(Math.random() * 30), 0, 0) }
        return date
      }
      const campaignLeads = selectedLeadIds.map((leadId, idx) => ({ campaign_id: showLeadLinker, lead_id: leadId, status: 'pending', current_step_index: 0, next_send_time: getNextSmartSendTime(idx).toISOString() }))
      const { error } = await supabase.from('campaign_leads').upsert(campaignLeads, { onConflict: 'campaign_id,lead_id' })
      if (error) { toast.error(error.message) } else { toast.success(`Linked ${selectedLeadIds.length} leads to campaign.`); setSelectedLeadIds([]); setShowLeadLinker(null); fetchData() }
    } catch (err: any) { toast.error(`Error: ${err.message}`) }
  }

  const toggleSelectLead = (id: string) => setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><Mail className={s.titleIcon} /> Outreach Campaigns</h2>
          <p className={s.subtitle}>Build sequence steps, attach video pitches, and orchestrate email sending rotation.</p>
        </div>
        <div className={s.headerActions}>
          <div className={s.viewToggle}>
            <button className={`${s.toggleBtn} ${viewMode === 'grid' ? s.toggleActive : ''}`} onClick={() => setViewMode('grid')} title="Grid view"><LayoutGrid className={s.iconSm} /></button>
            <button className={`${s.toggleBtn} ${viewMode === 'list' ? s.toggleActive : ''}`} onClick={() => setViewMode('list')} title="List view"><List className={s.iconSm} /></button>
          </div>
          <button onClick={() => setShowBuilder(true)} className={s.createBtn}><Plus className={s.btnIcon} /> Create Sequence</button>
        </div>
      </div>

      {loading ? (
        <div className={s.loadingState}>
          <Loader className={s.loadingSpinner} />
          <span>Loading campaigns...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className={s.emptyCard}>
          <Send className={s.emptyIcon} />
          <h3 className={s.emptyTitle}>No campaigns yet</h3>
          <p className={s.emptyText}>Create your first outreach sequence to start connecting with leads.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={s.grid}>
          {campaigns.map((camp) => (
            <div key={camp.id} className={s.card}>
              <div className={s.cardContent}>
                <div className={s.cardHeader}>
                  <div>
                    <h3 className={s.cardTitle}>{camp.name}</h3>
                    <span className={`${s.badge} ${camp.status === 'active' ? s.badgeActive : s.badgeDraft}`}>{camp.status}</span>
                  </div>
                  <div className={s.cardActions}>
                    <button onClick={() => handleToggleStatus(camp.id, camp.status)} className={`${s.actionBtn} ${camp.status === 'active' ? s.actionBtnAmber : s.actionBtnSuccess}`} title={camp.status === 'active' ? 'Pause' : 'Start'}>
                      {camp.status === 'active' ? <Pause className={s.iconSm} /> : <Play className={s.iconSm} />}
                    </button>
                    {camp.status !== 'active' && <button onClick={() => handleEditCampaign(camp)} className={s.actionBtn} title="Edit"><Edit3 className={s.iconSm} /></button>}
                    <button onClick={() => handleDeleteCampaign(camp.id)} className={s.actionBtn} title="Delete"><Trash className={s.iconSm} /></button>
                  </div>
                </div>
                <div className={s.cardStats}>
                  <div className={s.statRow}><span>Total Sequence Steps:</span><span className={s.statValue}>{(camp.steps || []).length} steps</span></div>
                </div>
              </div>
              <div className={s.cardFooter}>
                <button onClick={() => setShowLeadLinker(camp.id)} className={s.addLeadsBtn}><Users className={s.iconSm} /> Add Leads</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.list}>
          {campaigns.map((camp) => (
            <div key={camp.id} className={s.listRow}>
              <div className={s.listLeft}>
                <h3 className={s.cardTitle}>{camp.name}</h3>
                <span className={`${s.badge} ${camp.status === 'active' ? s.badgeActive : s.badgeDraft}`}>{camp.status}</span>
              </div>
              <div className={s.listMiddle}>
                <span className={s.listStatLabel}>{(camp.steps || []).length} steps</span>
              </div>
              <div className={s.listActions}>
                <button onClick={() => handleToggleStatus(camp.id, camp.status)} className={`${s.actionBtn} ${camp.status === 'active' ? s.actionBtnAmber : s.actionBtnSuccess}`} title={camp.status === 'active' ? 'Pause' : 'Start'}>
                  {camp.status === 'active' ? <Pause className={s.iconSm} /> : <Play className={s.iconSm} />}
                </button>
                {camp.status !== 'active' && <button onClick={() => handleEditCampaign(camp)} className={s.actionBtn} title="Edit"><Edit3 className={s.iconSm} /></button>}
                <button onClick={() => setShowLeadLinker(camp.id)} className={s.actionBtn} title="Add Leads"><Users className={s.iconSm} /></button>
                <button onClick={() => handleDeleteCampaign(camp.id)} className={s.actionBtn} title="Delete"><Trash className={s.iconSm} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBuilder && (
        <div className={s.modal}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>{editingCampaignId ? 'Edit Sequence Campaign' : 'Build Sequence Campaign'}</h3>
              <button onClick={() => { setShowBuilder(false); setEditingCampaignId(null); setName(''); setSteps([{ subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }]) }} className={s.closeBtn}><X className={s.iconLg} /></button>
            </div>
            <form onSubmit={handleSaveCampaign} className={s.form}>
              <div>
                <label className={s.label}>Campaign Name *</label>
                <input type="text" placeholder="e.g. Agency Outreach Sequence" value={name} onChange={(e) => setName(e.target.value)} className={s.input} required />
              </div>
              <div className={s.stepsSection}>
                <div className={s.stepsHeader}>
                  <h4 className={s.stepsTitle}>Sequence Mail Steps</h4>
                  <button type="button" onClick={handleAddStep} className={s.addStepBtn}>+ Add Mail Step</button>
                </div>
                <div className={s.stepsList}>
                  {steps.map((step, idx) => (
                    <div key={idx} className={s.stepCard}>
                      <div className={s.stepHeader}>
                        <span className={s.stepBadge}>Step {idx + 1}</span>
                        {steps.length > 1 && <button type="button" onClick={() => handleRemoveStep(idx)} className={s.removeStepBtn}><Trash className={s.iconXs} /> Remove</button>}
                      </div>
                      <div className={s.stepFields}>
                        <div className={s.stepFieldFull}>
                          <label className={s.labelSm}>Subject Line</label>
                          <input type="text" value={step.subject} onChange={(e) => handleStepChange(idx, 'subject', e.target.value)} className={s.inputSm} required />
                        </div>
                        <div>
                          <label className={s.labelSm}>Delay (Hours)</label>
                          <input type="number" value={step.delay_hours} onChange={(e) => handleStepChange(idx, 'delay_hours', parseInt(e.target.value) || 0)} className={s.inputSm} min="0" required />
                        </div>
                      </div>
                      <div>
                        <label className={s.labelSm}>Email Body</label>
                        <textarea value={step.body} onChange={(e) => handleStepChange(idx, 'body', e.target.value)} className={s.textarea} required />
                        <p className={s.hint}>Variables: <code>{'{{first_name}}'}</code>, <code>{'{{company}}'}</code>, <code>{'{{website}}'}</code></p>
                      </div>
                      <div>
                        <label className={s.labelSm}>Attach Video (Optional)</label>
                        <select value={step.videoId} onChange={(e) => handleStepChange(idx, 'videoId', e.target.value)} className={s.select}>
                          <option value="">None (Plain text email)</option>
                          {videos.map(v => <option key={v.id} value={v.id}>{v.title.split('|||')[0]}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.modalFooter}>
                <button type="button" onClick={() => { setShowBuilder(false); setEditingCampaignId(null); setName(''); setSteps([{ subject: 'Quick question for {{first_name}}', body: 'Hey {{first_name}},\n\nI was looking at {{company}}...', delay_hours: 0, videoId: '' }]) }} className={s.cancelBtn}>Cancel</button>
                <button type="submit" className={s.saveBtn}>{editingCampaignId ? 'Save Changes' : 'Save Campaign Sequence'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLeadLinker && (
        <div className={s.modal}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Add Leads to Sequence</h3>
              <button onClick={() => { setShowLeadLinker(null); setLinkerSearch('') }} className={s.closeBtn}><X className={s.iconLg} /></button>
            </div>
            <div className={s.form}>
              <div>
                <label className={s.label}>Search Prospect Leads</label>
                <input type="text" placeholder="Search by name, email, or company..." value={linkerSearch} onChange={(e) => setLinkerSearch(e.target.value)} className={s.input} />
              </div>
              <div className={s.linkerActions}>
                <span className={s.linkerCount}>Matches: {leads.filter(l => l.email.toLowerCase().includes(linkerSearch.toLowerCase()) || (l.first_name || '').toLowerCase().includes(linkerSearch.toLowerCase()) || (l.company || '').toLowerCase().includes(linkerSearch.toLowerCase())).length} leads ({selectedLeadIds.length} selected)</span>
                <div className={s.linkerButtons}>
                  <button onClick={() => setSelectedLeadIds(leads.filter(l => l.email.toLowerCase().includes(linkerSearch.toLowerCase()) || (l.first_name || '').toLowerCase().includes(linkerSearch.toLowerCase()) || (l.company || '').toLowerCase().includes(linkerSearch.toLowerCase())).map(l => l.id))} className={s.selectAllBtn}>Select All</button>
                  <button onClick={() => setSelectedLeadIds([])} className={s.clearBtn}>Clear All</button>
                </div>
              </div>
              <div className={s.leadsList}>
                {leads.filter(l => l.email.toLowerCase().includes(linkerSearch.toLowerCase()) || (l.first_name || '').toLowerCase().includes(linkerSearch.toLowerCase()) || (l.company || '').toLowerCase().includes(linkerSearch.toLowerCase())).slice(0, 50).map(lead => {
                  const isSelected = selectedLeadIds.includes(lead.id)
                  return (
                    <button key={lead.id} onClick={() => toggleSelectLead(lead.id)} className={`${s.leadItem} ${isSelected ? s.leadItemSelected : ''}`}>
                      <div>
                        <div className={s.leadName}>{lead.first_name} {lead.last_name || ''}</div>
                        <div className={s.leadEmail}>{lead.email} - {lead.company || 'No Company'}</div>
                      </div>
                      <div className={`${s.checkbox} ${isSelected ? s.checkboxChecked : ''}`}>{isSelected && <Check className={s.iconXs} />}</div>
                    </button>
                  )
                })}
              </div>
              <div className={s.modalFooter}>
                <button onClick={() => { setShowLeadLinker(null); setLinkerSearch('') }} className={s.cancelBtn}>Cancel</button>
                <button onClick={handleLinkLeads} disabled={selectedLeadIds.length === 0} className={s.saveBtn}>Link Selected Leads ({selectedLeadIds.length})</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
