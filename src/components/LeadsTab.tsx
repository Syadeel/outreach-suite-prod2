'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Upload, Plus, Users, Trash2, Filter, RefreshCw, CheckCircle2, AlertTriangle, Copy, ExternalLink, Play, Sparkles, Loader, XCircle, X, ChevronDown, ChevronUp, Video, CheckCircle } from 'lucide-react'
import s from './LeadsTab.module.css'

export default function LeadsTab() {
  const [leads, setLeads] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [website, setWebsite] = useState('')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvProgress, setCsvProgress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [showGenModal, setShowGenModal] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [totalGenCount, setTotalGenCount] = useState(0)
  const [genLog, setGenLog] = useState<{lead: string; status: 'ok' | 'error'; message: string}[]>([])
  const [currentGenLead, setCurrentGenLead] = useState('')

  useEffect(() => { fetchLeads() }, [])

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (!error && data) setLeads(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    try {
      // Generate screenshot if website is provided
      let screenshotUrl = null
      if (website.trim()) {
        try {
          const res = await fetch('/api/screenshot/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: website.trim() }),
          })
          if (res.ok) { const data = await res.json(); screenshotUrl = data.screenshotUrl }
        } catch (e) { /* screenshot generation failed, continue without it */ }
      }

      const { error } = await supabase.from('leads').insert({
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        company: company.trim(),
        website: website.trim(),
        stage: 'new',
        website_screenshot_url: screenshotUrl,
      })
      if (!error) { setEmail(''); setFirstName(''); setLastName(''); setCompany(''); setWebsite(''); setShowAddForm(false); fetchLeads() }
      else { alert(error.message) }
    } catch (err) { console.error(err) }
  }

  const handleDeleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return
    try {
      await supabase.from('campaign_leads').delete().eq('lead_id', id)
      await supabase.from('leads').delete().eq('id', id)
      setSelectedLeadIds(prev => prev.filter(item => item !== id))
      fetchLeads()
    } catch (err: any) { alert('Delete failed: ' + err.message) }
  }

  const handleDeleteSelected = async () => {
    if (!selectedLeadIds.length) return
    if (!confirm(`Delete ${selectedLeadIds.length} selected leads?`)) return
    try {
      for (const id of selectedLeadIds) {
        await supabase.from('campaign_leads').delete().eq('lead_id', id)
        await supabase.from('leads').delete().eq('id', id)
      }
      setSelectedLeadIds([])
      fetchLeads()
    } catch (err: any) { alert('Delete failed: ' + err.message) }
  }

  const handleVerifyLeads = async (leadIds?: string[]) => {
    setVerifying(true)
    try {
      const res = await fetch('/api/leads/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds }) })
      const data = await res.json()
      alert(data.message || 'Lead verification complete!')
      fetchLeads()
    } catch (err: any) { alert('Verification failed: ' + err.message) }
    finally { setVerifying(false) }
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvLoading(true)
    setCsvProgress('Reading CSV...')
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split(/\r\n|\n/)
        if (lines.length === 0) { alert('Empty CSV'); setCsvLoading(false); return }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''))
        const leadsToInsert = []
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i]) continue
          const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/["']/g, '').trim())
          const obj: any = {}
          headers.forEach((h, j) => obj[h] = values[j] || '')
          const emailVal = (obj.email || obj['email address'] || '').toLowerCase().trim()
          if (!emailVal || !emailVal.includes('@')) continue
          const domain = emailVal.split('@')[1] || ''
          leadsToInsert.push({ email: emailVal, first_name: obj['first name'] || obj.firstname || '', last_name: obj['last name'] || obj.lastname || '', company: obj.company || obj.organization || '', website: obj.website || obj.domain || '', stage: 'new', custom_fields: { logo_url: domain ? `https://logo.clearbit.com/${domain}` : '' } })
        }
        if (leadsToInsert.length === 0) { alert('No valid leads found'); setCsvLoading(false); return }
        setCsvProgress(`Importing ${leadsToInsert.length} leads...`)
        const { error } = await supabase.from('leads').upsert(leadsToInsert, { onConflict: 'email' })
        if (error) { alert(`Error: ${error.message}`) } else { alert(`Imported ${leadsToInsert.length} leads`) }
        fetchLeads()
      } catch (err: any) { alert(`Error: ${err.message}`) }
      finally { setCsvLoading(false); setCsvProgress('') }
    }
    reader.readAsText(file)
  }

  const handleGenerateAvatars = async () => {
    let avatarVoiceUrl = ''
    let avatarFaceUrl = ''
    try {
      const res = await fetch('/api/avatar-config?userId=default_user')
      if (res.ok) { const data = await res.json(); avatarVoiceUrl = data.voiceRefUrl || ''; avatarFaceUrl = data.faceVideoUrl || '' }
    } catch {}
    if (!avatarVoiceUrl) avatarVoiceUrl = localStorage.getItem('os_avatar_voice_url') || ''
    if (!avatarFaceUrl) avatarFaceUrl = localStorage.getItem('os_avatar_face_url') || ''
    if (!avatarVoiceUrl || !avatarFaceUrl) { alert('Configure your AI Avatar first in Avatar Studio.'); return }
    const { data: unprocessedLeads, error } = await supabase.from('leads').select('id, first_name, last_name, company, email').or('v2_status.is.null,v2_status.eq.failed')
    if (error || !unprocessedLeads?.length) { alert(error ? `Error: ${error.message}` : 'All leads already processed!'); return }
    setShowGenModal(true); setIsGenerating(true); setTotalGenCount(unprocessedLeads.length); setProcessedCount(0); setGenLog([])
    const scriptTemplate = "Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach. Let me show you how it works."
    for (const lead of unprocessedLeads) {
      const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email
      setCurrentGenLead(name)
      try {
        const res = await fetch('/api/v2/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, script: scriptTemplate, faceVideoUrl: avatarFaceUrl, voiceRefUrl: avatarVoiceUrl }) })
        if (res.ok) { setProcessedCount(p => p + 1); setGenLog(prev => [...prev, { lead: name, status: 'ok', message: `Done — ${lead.company || 'N/A'}` }]) }
        else { const errData = await res.json().catch(() => ({ error: 'Unknown' })); setGenLog(prev => [...prev, { lead: name, status: 'error', message: errData.error || `HTTP ${res.status}` }]) }
      } catch (err: any) { setGenLog(prev => [...prev, { lead: name, status: 'error', message: err.message || 'Network error' }]) }
    }
    setIsGenerating(false); setCurrentGenLead(''); fetchLeads()
  }

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'new': return s.badgeSky
      case 'contacted': return s.badgeEmerald
      case 'replied': return s.badgeAmber
      case 'interested': return s.badgeEmerald
      case 'unsubscribed': return s.badgeSlate
      case 'bounce': return s.badgeRose
      default: return s.badgeSlate
    }
  }

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.email.toLowerCase().includes(search.toLowerCase()) || (lead.first_name || '').toLowerCase().includes(search.toLowerCase()) || (lead.company || '').toLowerCase().includes(search.toLowerCase())
    const matchesStage = stageFilter === 'all' || lead.stage === stageFilter
    return matchesSearch && matchesStage
  })

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><Users className={s.titleIcon} /> Leads & CRM</h2>
          <p className={s.subtitle}>Import, manage, filter, and verify your prospect database.</p>
        </div>
        <div className={s.actions}>
          <button onClick={() => handleVerifyLeads()} disabled={verifying || csvLoading || leads.length === 0} className={s.verifyBtn}><RefreshCw className={`${s.iconSm} ${verifying ? 'animate-spin' : ''}`} /> {verifying ? 'Verifying...' : 'Verify DNS'}</button>
          <label className={s.importBtn}><Upload className={s.iconSm} /> {csvLoading ? 'Uploading...' : 'Import CSV'}<input type="file" accept=".csv" onChange={handleCsvUpload} className={s.hidden} disabled={csvLoading} /></label>
          <button onClick={handleGenerateAvatars} disabled={isGenerating} className={s.genBtn}><Sparkles className={s.iconSm} /> Generate AI Avatars</button>
          <button onClick={() => setShowAddForm(!showAddForm)} className={s.addBtn}><Plus className={s.iconSm} /> Add Lead</button>
        </div>
      </div>

      {csvProgress && <div className={s.progress}><div className={s.spinner} /> <span>{csvProgress}</span></div>}

      {showAddForm && (
        <form onSubmit={handleManualAdd} className={s.form}>
          <h3 className={s.formTitle}>New Lead Details</h3>
          <div className={s.formGrid}>
            <div><label className={s.label}>Email *</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={s.input} required /></div>
            <div><label className={s.label}>First Name</label><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={s.input} /></div>
            <div><label className={s.label}>Last Name</label><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={s.input} /></div>
          </div>
          <div className={s.formGrid2}>
            <div><label className={s.label}>Company</label><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={s.input} /></div>
            <div><label className={s.label}>Website</label><input type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} className={s.input} /></div>
          </div>
          <div className={s.formActions}>
            <button type="button" onClick={() => setShowAddForm(false)} className={s.cancelBtn}>Cancel</button>
            <button type="submit" className={s.saveBtn}>Save Lead</button>
          </div>
        </form>
      )}

      <div className={s.filterBar}>
        <div className={s.searchWrapper}><Search className={s.searchIcon} /><input type="text" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className={s.searchInput} /></div>
        <div className={s.filterWrapper}><Filter className={s.iconSm} /><select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={s.filterSelect}><option value="all">All Stages</option><option value="new">New</option><option value="contacted">Contacted</option><option value="replied">Replied</option><option value="interested">Interested</option><option value="unsubscribed">Unsubscribed</option><option value="bounce">Bounced</option></select></div>
      </div>

      {selectedLeadIds.length > 0 && (
        <div className={s.batchBar}>
          <span className={s.batchCount}>{selectedLeadIds.length} Selected</span>
          <div className={s.batchActions}>
            <button onClick={() => handleVerifyLeads(selectedLeadIds)} disabled={verifying} className={s.batchVerifyBtn}><RefreshCw className={`${s.iconXs} ${verifying ? 'animate-spin' : ''}`} /> Verify</button>
            <button onClick={handleDeleteSelected} className={s.batchDeleteBtn}><Trash2 className={s.iconXs} /> Delete</button>
            <button onClick={() => setSelectedLeadIds([])} className={s.batchClearBtn}>Deselect</button>
          </div>
        </div>
      )}

      <div className={s.tableWrapper}>
        {loading ? (
          <div className={s.empty}>Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className={s.empty}>No leads found.</div>
        ) : (
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr className={s.tableHeader}>
                  <th className={s.thCheck}><input type="checkbox" checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length} onChange={() => setSelectedLeadIds(selectedLeadIds.length === filteredLeads.length ? [] : filteredLeads.map(l => l.id))} className={s.checkbox} /></th>
                  <th className={s.th}>Name</th>
                  <th className={s.th}>Email</th>
                  <th className={s.th}>Company</th>
                  <th className={s.th}>Stage</th>
                  <th className={s.th}>V2 Status</th>
                  <th className={s.th}>Landing Page</th>
                  <th className={s.th}>GIF</th>
                  <th className={s.thRight}>Actions</th>
                </tr>
              </thead>
              <tbody className={s.tbody}>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className={s.tr}>
                    <td className={s.tdCheck}><input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => setSelectedLeadIds(prev => prev.includes(lead.id) ? prev.filter(id => id !== lead.id) : [...prev, lead.id])} className={s.checkbox} /></td>
                    <td className={s.tdName}>{lead.first_name} {lead.last_name || ''}</td>
                    <td className={s.tdEmail}>{lead.email}</td>
                    <td className={s.td}>{lead.company || '—'}</td>
                    <td className={s.td}><span className={`${s.badge} ${getStageBadge(lead.stage)}`}>{lead.stage}</span></td>
                    <td className={s.td}>{!lead.v2_status || lead.v2_status === 'none' ? <span className={s.statusPending}>Pending</span> : lead.v2_status === 'processing' ? <span className={s.statusProcessing}><Loader className={s.iconXs} /> Processing</span> : lead.v2_status === 'ready' ? <span className={s.statusReady}><CheckCircle className={s.iconXs} /> Ready</span> : <span className={s.statusFailed}><XCircle className={s.iconXs} /> Failed</span>}</td>
                    <td className={s.td}>
                      {lead.personalized_landing_page_url ? (
                        <a href={lead.personalized_landing_page_url} target="_blank" rel="noopener noreferrer" className={s.linkBtn}>
                          <ExternalLink className={s.iconXs} /> View
                        </a>
                      ) : '—'}
                    </td>
                    <td className={s.td}>
                      {lead.email_gif_url ? (
                        <span className={s.gifReady}><CheckCircle className={s.iconXs} /> Ready</span>
                      ) : '—'}
                    </td>
                    <td className={s.tdRight}>
                      <div className={s.rowActions}>
                        <button onClick={() => handleVerifyLeads([lead.id])} disabled={verifying} className={s.rowActionBtn}><RefreshCw className={`${s.iconXs} ${verifying ? 'animate-spin' : ''}`} /></button>
                        <button onClick={() => handleDeleteLead(lead.id)} className={s.rowActionBtn}><Trash2 className={s.iconXs} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showGenModal && (
        <div className={s.modal}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}><Sparkles className={s.iconSm} /> Generating AI Avatars</h3>
              <button onClick={() => setShowGenModal(false)} className={s.closeBtn}><X className={s.iconLg} /></button>
            </div>
            <div className={s.modalBody}>
              <div className={s.genProgress}>
                <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${totalGenCount ? (processedCount / totalGenCount) * 100 : 0}%` }} /></div>
                <p className={s.progressText}>{processedCount} / {totalGenCount}</p>
              </div>
              {currentGenLead && <p className={s.currentLead}>Processing: {currentGenLead}</p>}
              <div className={s.genLog}>
                {genLog.map((entry, i) => (
                  <div key={i} className={s.logEntry}>
                    {entry.status === 'ok' ? <CheckCircle className={s.logIconOk} /> : <XCircle className={s.logIconErr} />}
                    <span className={s.logName}>{entry.lead}</span>
                    <span className={s.logMsg}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
