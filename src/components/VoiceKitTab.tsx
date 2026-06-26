'use client'

import { useState } from 'react'
import { Mic, Upload, Play, Loader, CheckCircle, XCircle, Volume2, Download } from 'lucide-react'
import s from './VoiceKitTab.module.css'

export default function VoiceKitTab() {
  const [text, setText] = useState('Hey, this is my AI voice clone. Pretty cool right?')
  const [generating, setGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVoiceFile(file)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/vk/upload-voice', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) setVoiceUrl(data.path)
      else setError(data.error)
    } catch (err: any) { setError(err.message) }
    finally { setUploading(false) }
  }

  const handleGenerate = async () => {
    if (!text.trim()) return
    setGenerating(true)
    setError('')
    setAudioUrl(null)
    try {
      const res = await fetch('/api/v2/voice-clone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ref_audio_url: voiceUrl || undefined }) })
      const data = await res.json()
      if (res.ok) setAudioUrl(data.audioUrl)
      else setError(data.error)
    } catch (err: any) { setError(err.message) }
    finally { setGenerating(false) }
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <h2 className={s.title}><Mic className={s.titleIcon} /> Voice AI</h2>
        <p className={s.subtitle}>Generate voice clones and text-to-speech using AI.</p>
      </div>

      <div className={s.card}>
        <h3 className={s.cardTitle}>Voice Sample</h3>
        <p className={s.cardDesc}>Upload a voice sample for cloning (optional). Uses default voice if not provided.</p>
        <label className={s.uploadBtn}><Upload className={s.iconSm} /> {uploading ? 'Uploading...' : voiceFile ? voiceFile.name : 'Upload Voice Sample'}<input type="file" accept=".mp3,.wav,.m4a" onChange={handleVoiceUpload} className={s.hidden} disabled={uploading} /></label>
        {voiceUrl && <p className={s.uploadSuccess}><CheckCircle className={s.iconXs} /> Voice sample uploaded</p>}
      </div>

      <div className={s.card}>
        <h3 className={s.cardTitle}>Text to Speech</h3>
        <p className={s.cardDesc}>Enter text to generate AI voice audio.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text to generate..." className={s.textarea} maxLength={1000} />
        <div className={s.textareaFooter}><span className={s.charCount}>{text.length}/1000</span></div>
        <button onClick={handleGenerate} disabled={generating || !text.trim()} className={s.generateBtn}>
          {generating ? <><Loader className={`${s.iconSm} animate-spin`} /> Generating...</> : <><Play className={s.iconSm} /> Generate Voice</>}
        </button>
      </div>

      {error && <div className={s.error}><XCircle className={s.iconSm} /> {error}</div>}

      {audioUrl && (
        <div className={s.resultCard}>
          <h3 className={s.cardTitle}><Volume2 className={s.iconSm} /> Generated Audio</h3>
          <audio src={audioUrl} controls className={s.audio} />
          <a href={audioUrl} download className={s.downloadBtn}><Download className={s.iconSm} /> Download</a>
        </div>
      )}
    </div>
  )
}
