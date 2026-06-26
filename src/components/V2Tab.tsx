'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, Video, Mic, CheckCircle, Copy, ExternalLink, Loader, Sparkles, Play, XCircle, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import s from './V2Tab.module.css'

interface Lead { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string; v2_video_url?: string | null; email_gif_url?: string | null; personalized_landing_page_url?: string | null; v2_status?: string | null; v2_generated_at?: string | null }

const DEFAULT_SCRIPT = `Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach. Let me show you how it works.`

export default function V2Tab() {
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [faceFile, setFaceFile] = useState<File | null>(null)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const [faceUploading, setFaceUploading] = useState(false)
  const [voiceProgress, setVoiceProgress] = useState(0)
  const [faceProgress, setFaceProgress] = useState(0)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const [avatarReady, setAvatarReady] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [scriptTemplate, setScriptTemplate] = useState(DEFAULT_SCRIPT)
  const [isGenerating, setIsGenerating] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [generationLog, setGenerationLog] = useState<{lead: string; status: 'ok' | 'error'; message: string}[]>([])
  const [currentLead, setCurrentLead] = useState('')
  const [showLog, setShowLog] = useState(true)
  const [generatedLeads, setGeneratedLeads] = useState<Lead[]>([])
  const [loadingResults, setLoadingResults] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [avatarSavedStatus, setAvatarSavedStatus] = useState<'local' | 'remote' | null>(null)

  useEffect(() => { loadAvatar(); fetchGeneratedLeads() }, [])

  const loadAvatar = async () => {
    try {
      const res = await fetch('/api/avatar-config?userId=default_user')
      if (res.ok) { const data = await res.json(); if (data.voiceRefUrl) setVoiceUrl(data.voiceRefUrl); if (data.faceVideoUrl) setFaceUrl(data.faceVideoUrl); if (data.voiceRefUrl && data.faceVideoUrl) setAvatarReady(true); setAvatarSavedStatus('remote'); return }
    } catch {}
    const savedVoice = localStorage.getItem('os_v2_voice_ref_url'); const savedFace = localStorage.getItem('os_v2_face_url')
    if (savedVoice) setVoiceUrl(savedVoice); if (savedFace) setFaceUrl(savedFace); if (savedVoice && savedFace) setAvatarReady(true); if (savedVoice || savedFace) setAvatarSavedStatus('local')
  }

  const uploadToCloudinary = async (file: File, onProgress: (pct: number) => void): Promise<string> => {
    const bucket = file.type.includes('image') ? 'images' : 'videos'
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', bucket)
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(JSON.parse(xhr.responseText).url) }
        else { reject(new Error('Upload failed')) }
      })
      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.open('POST', '/api/upload')
      xhr.send(form)
    })
  }

  const handleVoiceUpload = async (file: File) => { setVoiceFile(file); setVoiceUploading(true); setVoiceProgress(0); try { const url = await uploadToCloudinary(file, setVoiceProgress); setVoiceUrl(url); localStorage.setItem('os_v2_voice_ref_url', url); if (faceUrl) setAvatarReady(true) } catch (err) { console.error(err) } finally { setVoiceUploading(false) } }
  const handleFaceUpload = async (file: File) => { setFaceFile(file); setFaceUploading(true); setFaceProgress(0); try { const url = await uploadToCloudinary(file, setFaceProgress); setFaceUrl(url); localStorage.setItem('os_v2_face_url', url); if (voiceUrl) setAvatarReady(true) } catch (err) { console.error(err) } finally { setFaceUploading(false) } }

  const handleSaveAvatar = async () => {
    if (voiceUrl && faceUrl) {
      localStorage.setItem('os_v2_voice_ref_url', voiceUrl); localStorage.setItem('os_v2_face_url', faceUrl); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 3000)
      try { const res = await fetch('/api/avatar-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'default_user', voiceRefUrl: voiceUrl, faceVideoUrl: faceUrl }) }); if (res.ok) setAvatarSavedStatus('remote') } catch { setAvatarSavedStatus('local') }
    }
  }

  const handleResetAvatar = async () => { localStorage.removeItem('os_v2_voice_ref_url'); localStorage.removeItem('os_v2_face_url'); setVoiceUrl(null); setFaceUrl(null); setAvatarReady(false); setAvatarSavedStatus(null); try { await fetch('/api/avatar-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'default_user', voiceRefUrl: null, faceVideoUrl: null }) }) } catch {} }

  const fetchGeneratedLeads = async () => { setLoadingResults(true); try { const { data } = await supabase.from('leads').select('id, first_name, last_name, company, email, v2_video_url, email_gif_url, personalized_landing_page_url, v2_status, v2_generated_at').eq('v2_status', 'ready').order('v2_generated_at', { ascending: false }); if (data) setGeneratedLeads(data as Lead[]) } catch (err) { console.error(err) } finally { setLoadingResults(false) } }

  const handleGenerateAll = async () => {
    const { data: leads, error } = await supabase.from('leads').select('id, first_name, last_name, company, email').or('v2_status.is.null,v2_status.eq.failed')
    if (error || !leads || leads.length === 0) { setGenerationLog([{ lead: 'System', status: 'error', message: 'No unprocessed leads found' }]); return }
    setIsGenerating(true); setTotalCount(leads.length); setProcessedCount(0); setGenerationLog([])
    const voiceRefUrl = voiceUrl || localStorage.getItem('os_v2_voice_ref_url') || ''; const faceVideoUrl = faceUrl || localStorage.getItem('os_v2_face_url') || ''
    for (const lead of leads) {
      const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email; setCurrentLead(name)
      try {
        const res = await fetch('/api/v2/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, script: scriptTemplate, faceVideoUrl, voiceRefUrl }) })
        if (res.ok) { setProcessedCount(p => p + 1); setGenerationLog(prev => [...prev, { lead: name, status: 'ok', message: `Done — ${lead.company || 'N/A'}` }]) }
        else { const errData = await res.json().catch(() => ({ error: 'Unknown' })); setGenerationLog(prev => [...prev, { lead: name, status: 'error', message: errData.error || `HTTP ${res.status}` }]) }
      } catch (err: any) { setGenerationLog(prev => [...prev, { lead: name, status: 'error', message: err.message || 'Network error' }]) }
    }
    setIsGenerating(false); setCurrentLead(''); fetchGeneratedLeads()
  }

  const copyToClipboard = async (text: string, id: string) => { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500) }
  const previewText = scriptTemplate.replace(/\{\{first_name\}\}/g, 'John').replace(/\{\{company\}\}/g, 'Acme Corp')
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString() : ''

  return (
    <div className={s.container}>
      <div className={s.header}><Sparkles className={s.headerIcon} /><div><h2 className={s.title}>V2 AI Avatar</h2><p className={s.subtitle}>Generate personalized AI avatar videos at scale</p></div></div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}><Sparkles className={s.sectionIcon} /> Step 1: Create Your AI Avatar</h3>
        <p className={s.sectionDesc}>Upload a <strong>voice sample</strong> (.mp3/.wav) and a <strong>face video</strong> (.mp4) of yourself speaking.</p>
        <div className={s.uploadGrid}>
          <div onClick={() => document.getElementById('voice-input')?.click()} className={`${s.uploadCard} ${voiceUrl ? s.uploadCardReady : ''}`}>
            <input id="voice-input" type="file" accept=".mp3,.wav" className={s.hidden} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVoiceUpload(f); e.target.value = '' }} />
            <Mic className={s.uploadIcon} /><p className={s.uploadTitle}>Voice Sample</p><p className={s.uploadDesc}>.mp3 or .wav</p>
            {voiceUploading && <div className={s.uploadProgress}><div className={s.progressBar}><div className={s.progressFill} style={{ width: `${voiceProgress}%` }} /></div><p className={s.progressText}>{voiceProgress}%</p></div>}
            {voiceUrl && !voiceUploading && <p className={s.uploadReady}><CheckCircle size={12} /> Ready</p>}
          </div>
          <div onClick={() => document.getElementById('face-input')?.click()} className={`${s.uploadCard} ${faceUrl ? s.uploadCardReady : ''}`}>
            <input id="face-input" type="file" accept=".mp4,.webm,.mov" className={s.hidden} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFaceUpload(f); e.target.value = '' }} />
            <Video className={s.uploadIcon} /><p className={s.uploadTitle}>Face Video</p><p className={s.uploadDesc}>.mp4 (face clearly visible)</p>
            {faceUploading && <div className={s.uploadProgress}><div className={s.progressBar}><div className={s.progressFill} style={{ width: `${faceProgress}%` }} /></div><p className={s.progressText}>{faceProgress}%</p></div>}
            {faceUrl && !faceUploading && <p className={s.uploadReady}><CheckCircle size={12} /> Ready</p>}
          </div>
        </div>
        <div className={s.avatarActions}>
          <button onClick={handleSaveAvatar} disabled={!avatarReady} className={s.saveBtn}>{avatarSaved ? <><CheckCircle className={s.btnIcon} /> Saved!</> : <><Sparkles className={s.btnIcon} /> Save Avatar</>}</button>
          {(voiceUrl || faceUrl) && <button onClick={handleResetAvatar} className={s.resetBtn}><Trash2 className={s.btnIcon} /> Reset</button>}
        </div>
        {avatarSavedStatus && <div className={s.savedStatus}><CheckCircle className={s.iconXs} />{avatarSavedStatus === 'remote' ? 'Saved to account' : 'Saved locally'}</div>}
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}><Mic className={s.sectionIcon} /> Step 2: Script Template</h3>
        <p className={s.sectionDesc}>Write your script with <code>{'{{first_name}}'}</code> and <code>{'{{company}}'}</code> placeholders.</p>
        <textarea value={scriptTemplate} onChange={(e) => setScriptTemplate(e.target.value)} placeholder="Enter your script..." className={s.textarea} maxLength={1000} />
        <div className={s.textareaFooter}><span>{scriptTemplate.length}/1000</span><span>Preview: {previewText.slice(0, 80)}...</span></div>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}><Play className={s.sectionIcon} /> Step 3: Generate for All Leads</h3>
        <p className={s.sectionDesc}>Process all unprocessed leads through the V2 pipeline.</p>
        <div className={s.genActions}>
          <button onClick={handleGenerateAll} disabled={isGenerating} className={s.genBtn}>{isGenerating ? <><Loader className={`${s.btnIcon} animate-spin`} /> Generating... ({processedCount}/{totalCount})</> : <><Sparkles className={s.btnIcon} /> Generate for All Leads</>}</button>
          <button onClick={fetchGeneratedLeads} className={s.refreshBtn}><RefreshCw className={s.btnIcon} /> Refresh</button>
        </div>
        {isGenerating && <div className={s.genProgress}><div className={s.progressBar}><div className={s.progressFill} style={{ width: totalCount ? `${(processedCount / totalCount) * 100}%` : '0%' }} /></div>{currentLead && <p className={s.currentLead}>Processing: {currentLead}</p>}</div>}
        {generationLog.length > 0 && (
          <div className={s.logSection}>
            <button onClick={() => setShowLog(!showLog)} className={s.logToggle}>{showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Log ({generationLog.length})</button>
            {showLog && <div className={s.logList}>{generationLog.map((entry, i) => (<div key={i} className={s.logEntry}>{entry.status === 'ok' ? <CheckCircle size={12} className={s.logOk} /> : <XCircle size={12} className={s.logErr} />}<span className={s.logName}>{entry.lead}</span><span className={s.logMsg}>{entry.message}</span></div>))}</div>}
          </div>
        )}
      </div>

      <div className={s.section}>
        <div className={s.resultsHeader}><div><h3 className={s.sectionTitle}>Generated Videos</h3><p className={s.sectionDesc}>Each lead has a personalized video, GIF, and landing page</p></div><button onClick={fetchGeneratedLeads} className={s.refreshBtn}><RefreshCw className={s.btnIcon} /></button></div>
        {loadingResults ? <div className={s.empty}><Loader className={`${s.iconLg} animate-spin`} /> Loading...</div> : generatedLeads.length === 0 ? <div className={s.empty}><Video className={s.emptyIcon} /><p>No videos generated yet</p></div> : (
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead><tr className={s.tableHeader}><th className={s.th}>Lead</th><th className={s.th}>Company</th><th className={s.th}>Video</th><th className={s.th}>GIF</th><th className={s.th}>Landing Page</th><th className={s.th}>Date</th></tr></thead>
              <tbody>{generatedLeads.map((lead) => { const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email; return (
                <tr key={lead.id} className={s.tr}>
                  <td className={s.tdName}>{name}</td>
                  <td className={s.td}>{lead.company || '—'}</td>
                  <td className={s.td}>{lead.v2_video_url ? <div className={s.tdActions}><video src={lead.v2_video_url} className={s.thumbnail} /><button onClick={() => window.open(lead.v2_video_url!, '_blank')} className={s.linkBtn}><ExternalLink size={14} /></button></div> : '—'}</td>
                  <td className={s.td}>{lead.email_gif_url ? <div className={s.tdActions}><input readOnly value={lead.email_gif_url} className={s.urlInput} /><button onClick={() => copyToClipboard(lead.email_gif_url!, `gif-${lead.id}`)} className={s.linkBtn}>{copiedId === `gif-${lead.id}` ? <CheckCircle size={14} /> : <Copy size={14} />}</button></div> : '—'}</td>
                  <td className={s.td}>{lead.personalized_landing_page_url ? <div className={s.tdActions}><input readOnly value={lead.personalized_landing_page_url} className={s.urlInput} /><button onClick={() => copyToClipboard(lead.personalized_landing_page_url!, `lp-${lead.id}`)} className={s.linkBtn}>{copiedId === `lp-${lead.id}` ? <CheckCircle size={14} /> : <Copy size={14} />}</button><a href={lead.personalized_landing_page_url!} target="_blank" rel="noopener noreferrer" className={s.linkBtn}><ExternalLink size={14} /></a></div> : '—'}</td>
                  <td className={s.td}>{fmtDate(lead.v2_generated_at)}</td>
                </tr>
              )})}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
