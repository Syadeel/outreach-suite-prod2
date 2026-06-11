'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Upload, Video, Mic, CheckCircle, Copy, ExternalLink, Loader,
  Sparkles, Play, XCircle, RefreshCw, Link as LinkIcon, Eye,
  Trash2, ChevronDown, ChevronUp
} from 'lucide-react'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string
  v2_video_url?: string | null
  email_gif_url?: string | null
  personalized_landing_page_url?: string | null
  v2_status?: string | null
  v2_generated_at?: string | null
}

const DEFAULT_SCRIPT = `Hey {{first_name}} from {{company}}, I built a system that helps businesses like yours grow with automated AI video outreach. Let me show you how it works.`

export default function V2Tab() {
  // ─── Avatar Setup State ───
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

  // ─── Script Template State ───
  const [scriptTemplate, setScriptTemplate] = useState(DEFAULT_SCRIPT)

  // ─── Bulk Generation State ───
  const [isGenerating, setIsGenerating] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [generationLog, setGenerationLog] = useState<{lead: string; status: 'ok' | 'error'; message: string}[]>([])
  const [currentLead, setCurrentLead] = useState('')
  const [showLog, setShowLog] = useState(true)

  // ─── Generated Results State ───
  const [generatedLeads, setGeneratedLeads] = useState<Lead[]>([])
  const [loadingResults, setLoadingResults] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const voiceRef = useRef<HTMLInputElement>(null)
  const faceRef = useRef<HTMLInputElement>(null)

  // ─── Load saved avatar + results on mount ───
  useEffect(() => {
    const savedVoice = localStorage.getItem('os_v2_voice_ref_url')
    const savedFace = localStorage.getItem('os_v2_face_url')
    if (savedVoice) setVoiceUrl(savedVoice)
    if (savedFace) setFaceUrl(savedFace)
    if (savedVoice && savedFace) setAvatarReady(true)
    fetchGeneratedLeads()
  }, [])

  // ─── Cloudinary Upload Helper ───
  const uploadToCloudinary = async (file: File, onProgress: (pct: number) => void): Promise<string> => {
    const sigRes = await fetch('/api/cloudinary/signature')
    if (!sigRes.ok) throw new Error('Failed to get Cloudinary signature')
    const sig = await sigRes.json()

    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('api_key', sig.apiKey)
      form.append('timestamp', String(sig.timestamp))
      form.append('signature', sig.signature)
      form.append('resource_type', 'video')

      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText)
          resolve(data.secure_url)
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.error?.message || 'Upload failed'))
          } catch { reject(new Error(`Upload failed (${xhr.status})`)) }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`)
      xhr.send(form)
    })
  }

  // ─── Handle Voice Upload ───
  const handleVoiceUpload = async (file: File) => {
    setVoiceFile(file)
    setVoiceUploading(true)
    setVoiceProgress(0)
    try {
      const url = await uploadToCloudinary(file, setVoiceProgress)
      setVoiceUrl(url)
      localStorage.setItem('os_v2_voice_ref_url', url)
      if (faceUrl) setAvatarReady(true)
    } catch (err: any) {
      console.error('Voice upload failed:', err)
    } finally {
      setVoiceUploading(false)
    }
  }

  // ─── Handle Face Video Upload ───
  const handleFaceUpload = async (file: File) => {
    setFaceFile(file)
    setFaceUploading(true)
    setFaceProgress(0)
    try {
      const url = await uploadToCloudinary(file, setFaceProgress)
      setFaceUrl(url)
      localStorage.setItem('os_v2_face_url', url)
      if (voiceUrl) setAvatarReady(true)
    } catch (err: any) {
      console.error('Face upload failed:', err)
    } finally {
      setFaceUploading(false)
    }
  }

  // ─── Save Avatar ───
  const handleSaveAvatar = () => {
    if (voiceUrl && faceUrl) {
      localStorage.setItem('os_v2_voice_ref_url', voiceUrl)
      localStorage.setItem('os_v2_face_url', faceUrl)
      setAvatarSaved(true)
      setTimeout(() => setAvatarSaved(false), 3000)
    }
  }

  // ─── Fetch Generated Leads ───
  const fetchGeneratedLeads = async () => {
    setLoadingResults(true)
    try {
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, company, email, v2_video_url, email_gif_url, personalized_landing_page_url, v2_status, v2_generated_at')
        .eq('v2_status', 'ready')
        .order('v2_generated_at', { ascending: false })
      if (data) setGeneratedLeads(data as Lead[])
    } catch (err) {
      console.error('Failed to fetch generated leads:', err)
    } finally {
      setLoadingResults(false)
    }
  }

  // ─── Bulk Generate ───
  const handleGenerateAll = async () => {
    // Fetch leads that haven't been processed or failed
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, first_name, last_name, company, email')
      .or('v2_status.is.null,v2_status.eq.none,v2_status.eq.failed')

    if (error || !leads || leads.length === 0) {
      setGenerationLog([{ lead: 'System', status: 'error', message: 'No unprocessed leads found or query failed' }])
      return
    }

    setIsGenerating(true)
    setTotalCount(leads.length)
    setProcessedCount(0)
    setGenerationLog([])

    const voiceRefUrl = voiceUrl || localStorage.getItem('os_v2_voice_ref_url') || ''
    const faceVideoUrl = faceUrl || localStorage.getItem('os_v2_face_url') || ''

    for (const lead of leads) {
      const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email
      setCurrentLead(name)

      try {
        const res = await fetch('/api/v2/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            script: scriptTemplate,
            faceVideoUrl: faceVideoUrl,
            voiceRefUrl: voiceRefUrl,
          }),
        })

        if (res.ok) {
          setProcessedCount(p => p + 1)
          setGenerationLog(prev => [...prev, {
            lead: name,
            status: 'ok',
            message: `Done — ${lead.company || 'N/A'}`
          }])
        } else {
          const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
          setGenerationLog(prev => [...prev, {
            lead: name,
            status: 'error',
            message: errData.error || `HTTP ${res.status}`
          }])
        }
      } catch (err: any) {
        setGenerationLog(prev => [...prev, {
          lead: name,
          status: 'error',
          message: err.message || 'Network error'
        }])
      }
    }

    setIsGenerating(false)
    setCurrentLead('')
    fetchGeneratedLeads()
  }

  // ─── Copy to clipboard with feedback ───
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* fallback */ }
  }

  // ─── Preview text (first lead as example) ───
  const previewText = scriptTemplate
    .replace(/\{\{first_name\}\}/g, 'John')
    .replace(/\{\{company\}\}/g, 'Acme Corp')

  // ─── Format date ───
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString()
  }

  return (
    <div className="space-y-6 p-1">

      {/* ──────── HEADER ──────── */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-7 h-7 text-emerald-400" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-heading">V2 AI Avatar</h2>
          <p className="text-sm text-muted">Generate personalized AI avatar videos at scale</p>
        </div>
      </div>

      {/* ──────── SECTION 1: AVATAR SETUP ──────── */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-5">
        <h3 className="text-sm font-bold text-heading flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Step 1: Create Your AI Avatar
        </h3>
        <p className="text-xs text-muted">
          Upload a <strong>voice sample</strong> (.mp3/.wav) and a <strong>face video</strong> (.mp4) of yourself speaking.
          The system will clone your voice and sync it to your face for personalized videos.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Voice Upload */}
          <div
            onClick={() => voiceRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              voiceUrl ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <input
              ref={voiceRef}
              type="file"
              accept=".mp3,.wav"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleVoiceUpload(f)
                e.target.value = ''
              }}
            />
            <Mic className={`w-8 h-8 mx-auto mb-2 ${voiceUrl ? 'text-emerald-400' : 'text-slate-500'}`} />
            <p className="text-sm font-medium text-body">Voice Sample</p>
            <p className="text-xs text-muted mt-1">.mp3 or .wav</p>

            {voiceUploading && (
              <div className="mt-3">
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${voiceProgress}%` }} />
                </div>
                <p className="text-[10px] text-muted mt-1">{voiceProgress}%</p>
              </div>
            )}
            {voiceUrl && !voiceUploading && (
              <p className="text-xs text-emerald-400 mt-2 flex items-center justify-center gap-1">
                <CheckCircle size={12} /> Ready
              </p>
            )}
          </div>

          {/* Face Video Upload */}
          <div
            onClick={() => faceRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              faceUrl ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <input
              ref={faceRef}
              type="file"
              accept=".mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFaceUpload(f)
                e.target.value = ''
              }}
            />
            <Video className={`w-8 h-8 mx-auto mb-2 ${faceUrl ? 'text-emerald-400' : 'text-slate-500'}`} />
            <p className="text-sm font-medium text-body">Face Video</p>
            <p className="text-xs text-muted mt-1">.mp4 (face clearly visible)</p>

            {faceUploading && (
              <div className="mt-3">
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${faceProgress}%` }} />
                </div>
                <p className="text-[10px] text-muted mt-1">{faceProgress}%</p>
              </div>
            )}
            {faceUrl && !faceUploading && (
              <p className="text-xs text-emerald-400 mt-2 flex items-center justify-center gap-1">
                <CheckCircle size={12} /> Ready
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleSaveAvatar}
          disabled={!avatarReady}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {avatarSaved ? (
            <><CheckCircle className="w-4 h-4" /> Avatar Saved!</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Save Avatar Configuration</>
          )}
        </button>
      </div>

      {/* ──────── SECTION 2: SCRIPT TEMPLATE ──────── */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-4">
        <h3 className="text-sm font-bold text-heading flex items-center gap-2">
          <Mic className="w-4 h-4 text-indigo-400" />
          Step 2: Script Template
        </h3>
        <p className="text-xs text-muted">
          Write your script with <code className="text-emerald-400 bg-slate-900 px-1 rounded">{'{{first_name}}'}</code> and{' '}
          <code className="text-emerald-400 bg-slate-900 px-1 rounded">{'{{company}}'}</code> as placeholders.
        </p>

        <textarea
          value={scriptTemplate}
          onChange={(e) => setScriptTemplate(e.target.value)}
          placeholder="Enter your script with {{first_name}} and {{company}}..."
          className="w-full px-4 py-3 rounded-xl glass-input text-sm h-28 resize-y"
          maxLength={1000}
        />

        <div className="flex justify-between text-xs text-muted">
          <span>{scriptTemplate.length} / 1000 characters</span>
          <span>Preview: {previewText.slice(0, 80)}...</span>
        </div>
      </div>

      {/* ──────── SECTION 3: BULK GENERATION ──────── */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 space-y-4">
        <h3 className="text-sm font-bold text-heading flex items-center gap-2">
          <Play className="w-4 h-4 text-amber-400" />
          Step 3: Generate for All Leads
        </h3>
        <p className="text-xs text-muted">
          Process all unprocessed leads through the V2 pipeline. Each lead gets a personalized video with their name and company.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating}
            className="px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-600/10"
          >
            {isGenerating ? (
              <><Loader className="w-4 h-4 animate-spin" /> Generating... ({processedCount}/{totalCount})</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate for All Leads</>
            )}
          </button>
          <button
            onClick={fetchGeneratedLeads}
            className="px-4 py-3 glass-panel rounded-xl border border-slate-800/60 text-sm text-body hover:bg-white/5 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Progress Bar */}
        {isGenerating && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-body">
              <span>Processing leads</span>
              <span>{processedCount} / {totalCount}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: totalCount ? `${(processedCount / totalCount) * 100}%` : '0%' }}
              />
            </div>
            {currentLead && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 animate-pulse">
                <Loader className="w-3 h-3 animate-spin" />
                Now processing: {currentLead}
              </div>
            )}
          </div>
        )}

        {/* Generation Log */}
        {generationLog.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowLog(!showLog)}
              className="flex items-center gap-1 text-xs text-muted hover:text-body transition-colors"
            >
              {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Generation Log ({generationLog.length} entries)
            </button>
            {showLog && (
              <div className="bg-slate-950/40 rounded-xl border border-slate-800/60 p-3 max-h-48 overflow-y-auto space-y-1">
                {generationLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {entry.status === 'ok' ? (
                      <CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-medium text-body">{entry.lead}</span>
                      <span className="text-muted"> — {entry.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ──────── SECTION 4: GENERATED RESULTS ──────── */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
        <div className="p-4 border-b border-slate-800/60 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-heading">Generated Videos</h3>
            <p className="text-[10px] text-muted mt-0.5">
              Each lead has a personalized video, GIF for email, and a landing page
            </p>
          </div>
          <button onClick={fetchGeneratedLeads} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-slate-800/40 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loadingResults ? (
          <div className="p-12 text-center text-muted text-sm">
            <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading results...
          </div>
        ) : generatedLeads.length === 0 ? (
          <div className="p-12 text-center">
            <Video className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-body">No videos generated yet</p>
            <p className="text-xs text-muted mt-1">Upload avatar samples and run bulk generation above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="text-left px-4 py-3 text-muted font-medium">Lead</th>
                  <th className="text-left px-4 py-3 text-muted font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-muted font-medium">Video</th>
                  <th className="text-left px-4 py-3 text-muted font-medium">Email GIF</th>
                  <th className="text-left px-4 py-3 text-muted font-medium">Landing Page</th>
                  <th className="text-left px-4 py-3 text-muted font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {generatedLeads.map((lead) => {
                  const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email
                  const gifId = `gif-${lead.id}`
                  const lpId = `lp-${lead.id}`
                  const vidId = `vid-${lead.id}`
                  return (
                    <tr key={lead.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-heading">{name}</td>
                      <td className="px-4 py-3 text-muted">{lead.company || '—'}</td>
                      <td className="px-4 py-3">
                        {lead.v2_video_url ? (
                          <div className="flex items-center gap-2">
                            <video src={lead.v2_video_url} className="w-16 h-10 rounded object-cover bg-slate-900" />
                            <button
                              onClick={() => window.open(lead.v2_video_url!, '_blank')}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Open video"
                            >
                              <ExternalLink size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.email_gif_url ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={lead.email_gif_url}
                              className="bg-slate-900 border border-slate-700 text-[10px] rounded px-1.5 py-1 w-28 text-muted truncate"
                            />
                            <button
                              onClick={() => copyToClipboard(lead.email_gif_url!, gifId)}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Copy GIF URL"
                            >
                              {copiedId === gifId ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.personalized_landing_page_url ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={lead.personalized_landing_page_url}
                              className="bg-slate-900 border border-slate-700 text-[10px] rounded px-1.5 py-1 w-28 text-muted truncate"
                            />
                            <button
                              onClick={() => copyToClipboard(lead.personalized_landing_page_url!, lpId)}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Copy LP URL"
                            >
                              {copiedId === lpId ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            </button>
                            <a
                              href={lead.personalized_landing_page_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Open landing page"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{fmtDate(lead.v2_generated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
