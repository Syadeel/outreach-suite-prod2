'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Video, Upload, Play, Trash2, ExternalLink, Copy, CheckCircle, Loader, X, Mic, Sparkles, Download, Image, XCircle } from 'lucide-react'
import s from './VideoTab.module.css'
import { useToast } from '../components/Toast'

type Tab = 'library' | 'generate'

export default function VideoTab() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('video-tab')
      if (saved === 'library' || saved === 'generate') return saved
    }
    return 'generate'
  })

  useEffect(() => { localStorage.setItem('video-tab', activeTab) }, [activeTab])

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerIcon}><Video className={s.iconLg} /></div>
          <div>
            <h2 className={s.title}>Video Studio</h2>
            <p className={s.subtitle}>Generate AI videos or manage your video library.</p>
          </div>
        </div>
        <div className={s.tabToggle}>
          <button className={`${s.tabBtn} ${activeTab === 'library' ? s.tabActive : ''}`} onClick={() => setActiveTab('library')}><Video className={s.iconXs} /> Library</button>
          <button className={`${s.tabBtn} ${activeTab === 'generate' ? s.tabActive : ''}`} onClick={() => setActiveTab('generate')}><Sparkles className={s.iconXs} /> Generate AI Video</button>
        </div>
      </div>

      {activeTab === 'library' ? <VideoLibrary /> : <AIVideoGenerator />}
    </div>
  )
}

// ==================== VIDEO LIBRARY ====================
function VideoLibrary() {
  const { toast } = useToast()
  const [videos, setVideos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [title, setTitle] = useState('')
  const [showRecord, setShowRecord] = useState(false)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { fetchVideos() }, [])

  const fetchVideos = async () => {
    try {
      const { data } = await supabase.from('video_recordings').select('*').order('created_at', { ascending: false })
      if (data) setVideos(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(0)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'videos')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText)
            fetch('/api/video-recordings', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title || file.name, video_url: data.url })
            }).then(r => r.json()).then(() => { fetchVideos(); resolve() }).catch(reject)
          } else { reject(new Error(`Upload failed: ${xhr.status}`)) }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', '/api/upload')
        xhr.send(form)
      })
      setTitle('')
    } catch (err: any) { toast.error(err.message || 'Upload failed') }
    finally { setUploading(false); setUploadProgress(0) }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => { const blob = new Blob(chunks, { type: 'video/webm' }); setRecordedBlob(blob); stream.getTracks().forEach(t => t.stop()) }
      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
    } catch (err) { toast.error('Camera access denied') }
  }

  const stopRecording = () => { mediaRecorder?.stop(); setRecording(false) }

  const uploadRecording = async () => {
    if (!recordedBlob) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', recordedBlob, 'recording.webm')
      form.append('bucket', 'videos')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText)
            fetch('/api/video-recordings', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title || 'Webcam Recording', video_url: data.url })
            }).then(r => r.json()).then(() => { fetchVideos(); resolve() }).catch(reject)
          } else { reject(new Error(`Upload failed: ${xhr.status}`)) }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', '/api/upload')
        xhr.send(form)
      })
      setTitle(''); setRecordedBlob(null); setShowRecord(false)
    } catch (err: any) { toast.error(err.message || 'Upload failed') }
    finally { setUploading(false); setUploadProgress(0) }
  }

  const deleteVideo = async (id: string) => {
    if (!confirm('Delete this video?')) return
    await supabase.from('video_recordings').delete().eq('id', id)
    fetchVideos()
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <>
      <div className={s.libraryActions}>
        <label className={s.uploadBtn}><Upload className={s.iconSm} /> {uploading ? `Uploading ${uploadProgress}%` : 'Upload Video'}<input type="file" accept="video/*" onChange={handleFileUpload} className={s.hidden} disabled={uploading} /></label>
        <button onClick={() => setShowRecord(!showRecord)} className={s.recordBtn}><Play className={s.iconSm} /> Record</button>
      </div>

      {showRecord && (
        <div className={s.recordSection}>
          <h3 className={s.sectionTitle}>Webcam Recording</h3>
          <div className={s.videoWrapper}>
            <video ref={videoRef} className={s.video} muted playsInline />
            {recordedBlob && <video ref={previewRef} src={URL.createObjectURL(recordedBlob)} className={s.video} controls />}
          </div>
          <div className={s.recordActions}>
            {!recording && !recordedBlob && <button onClick={startRecording} className={s.startBtn}><Play className={s.iconSm} /> Start Recording</button>}
            {recording && <button onClick={stopRecording} className={s.stopBtn}><X className={s.iconSm} /> Stop Recording</button>}
            {recordedBlob && (
              <>
                <input type="text" placeholder="Video title..." value={title} onChange={(e) => setTitle(e.target.value)} className={s.titleInput} />
                <button onClick={uploadRecording} disabled={uploading} className={s.saveBtn}>{uploading ? 'Uploading...' : 'Save Recording'}</button>
                <button onClick={() => { setRecordedBlob(null); setShowRecord(false) }} className={s.cancelBtn}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className={s.loadingState}>
          <Loader className={s.loadingSpinner} />
          <span>Loading videos...</span>
        </div>
      ) : videos.length === 0 ? (
        <div className={s.emptyCard}>
          <div className={s.emptyIconWrap}><Video className={s.emptyIcon} /></div>
          <h3 className={s.emptyTitle}>No Videos Yet</h3>
          <p className={s.emptyText}>Record, upload, or generate your first AI video.</p>
        </div>
      ) : (
        <div className={s.grid}>
          {videos.map((video) => (
            <div key={video.id} className={s.card}>
              <div className={s.thumbnailWrap}>
                <video src={video.video_url} className={s.thumbnail} muted playsInline />
                <div className={s.playOverlay}><Play className={s.playIcon} /></div>
              </div>
              <div className={s.cardBody}>
                <h3 className={s.cardTitle}>{video.title || 'Untitled'}</h3>
                <p className={s.cardDate}>{new Date(video.created_at).toLocaleDateString()}</p>
                <div className={s.cardActions}>
                  <a href={video.video_url} target="_blank" rel="noopener noreferrer" className={s.cardActionBtn} title="Open"><ExternalLink className={s.iconXs} /></a>
                  <button onClick={() => copyToClipboard(video.video_url, video.id)} className={s.cardActionBtn} title="Copy URL">{copiedId === video.id ? <CheckCircle className={s.iconXs} /> : <Copy className={s.iconXs} />}</button>
                  <button onClick={() => deleteVideo(video.id)} className={s.cardActionBtnDanger} title="Delete"><Trash2 className={s.iconXs} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ==================== AI VIDEO GENERATOR ====================
function AIVideoGenerator() {
  const { toast } = useToast()
  const [script, setScript] = useState('Hey, just wanted to show you something cool. Check this out.')
  const [generating, setGenerating] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  // Face image
  const [faceImageUrl, setFaceImageUrl] = useState<string | null>(null)
  const [uploadingFace, setUploadingFace] = useState(false)
  const [faceProgress, setFaceProgress] = useState(0)

  // Voice sample
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [voiceProgress, setVoiceProgress] = useState(0)

  const faceRef = useRef<HTMLInputElement>(null)
  const voiceRef = useRef<HTMLInputElement>(null)

  // Load saved avatar config on mount
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const res = await fetch('/api/avatar-config?userId=default_user')
        if (res.ok) {
          const data = await res.json()
          if (data.faceImageUrl || data.faceVideoUrl) setFaceImageUrl(data.faceImageUrl || data.faceVideoUrl)
          if (data.voiceRefUrl) setVoiceUrl(data.voiceRefUrl)
        }
      } catch {}
    }
    loadAvatar()
  }, [])

  const uploadWithProgress = async (file: File, bucket: string, onProgress: (p: number) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', bucket)
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText)
          resolve(data.url)
        } else { reject(new Error('Upload failed')) }
      })
      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.open('POST', '/api/upload')
      xhr.send(form)
    })
  }

  const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFace(true)
    setFaceProgress(0)
    try {
      const url = await uploadWithProgress(file, 'images', setFaceProgress)
      setFaceImageUrl(url)
    } catch (err: any) { setError(err.message) }
    finally { setUploadingFace(false) }
  }

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingVoice(true)
    setVoiceProgress(0)
    try {
      const url = await uploadWithProgress(file, 'videos', setVoiceProgress)
      setVoiceUrl(url)
    } catch (err: any) { setError(err.message) }
    finally { setUploadingVoice(false) }
  }

  const handleGenerate = async () => {
    if (!script.trim()) return
    if (!faceImageUrl) { setError('Upload a face image first'); return }

    setGenerating(true)
    setError('')
    setVideoUrl(null)
    setProgress('Generating voice...')

    try {
      const ttsRes = await fetch('/api/v2/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, ref_audio_url: voiceUrl || undefined }),
      })
      const ttsData = await ttsRes.json()
      if (!ttsRes.ok) throw new Error(ttsData.error || 'TTS failed')

      setProgress('Generating lip-sync video...')
      const lipRes = await fetch('/api/v2/latentsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: ttsData.audioUrl, videoUrl: faceImageUrl }),
      })
      const lipData = await lipRes.json()
      if (!lipRes.ok) throw new Error(lipData.error || 'Lip-sync failed')

      setProgress('Saving video...')
      const finalUrl = lipData.videoUrl || lipData.url
      await fetch('/api/video-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `AI Video: ${script.slice(0, 40)}...`, video_url: finalUrl }),
      })

      setVideoUrl(finalUrl)
      setProgress('')
      toast.success('Video generated successfully!')
    } catch (err: any) {
      setError(err.message || 'Generation failed')
      setProgress('')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={s.generateContent}>
      {/* Requirements Status */}
      <div className={s.reqPanel}>
        <h3 className={s.reqTitle}>Generation Requirements</h3>
        <div className={s.reqGrid}>
          <div className={`${s.reqItem} ${faceImageUrl ? s.reqDone : s.reqMissing}`}>
            {faceImageUrl ? <CheckCircle className={s.reqIconDone} /> : <XCircle className={s.reqIconMissing} />}
            <span>Face Image</span>
          </div>
          <div className={`${s.reqItem} ${voiceUrl ? s.reqDone : s.reqMissing}`}>
            {voiceUrl ? <CheckCircle className={s.reqIconDone} /> : <XCircle className={s.reqIconMissing} />}
            <span>Voice Sample</span>
          </div>
        </div>
        <div className={`${s.reqSummary} ${faceImageUrl ? s.reqSummaryReady : s.reqSummaryPending}`}>
          {faceImageUrl ? 'Ready to generate' : 'Upload a face image to get started'}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className={s.twoColumn}>
        {/* Left: Uploads */}
        <div className={s.uploadColumn}>
          {/* Face Image */}
          <div className={`${s.uploadCard} ${faceImageUrl ? s.uploadCardReady : ''}`}>
            <input ref={faceRef} type="file" accept="image/*" onChange={handleFaceUpload} className={s.hidden} />
            <div className={s.uploadCardHeader}>
              <Image className={s.uploadCardIcon} />
              <div>
                <h4 className={s.uploadCardTitle}>Face Image</h4>
                <p className={s.uploadCardDesc}>Photo of the person in the video</p>
              </div>
            </div>
            {faceImageUrl ? (
              <div className={s.uploadReadyArea}>
                <img src={faceImageUrl} alt="Face" className={s.uploadPreview} />
                <button onClick={() => setFaceImageUrl(null)} className={s.removeBtn}><X className={s.iconXs} /> Change</button>
              </div>
            ) : (
              <div className={s.dropArea} onClick={() => faceRef.current?.click()}>
                {uploadingFace ? (
                  <>
                    <Loader className={`${s.dropIcon} animate-spin`} />
                    <span className={s.dropText}>Uploading... {faceProgress}%</span>
                    <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${faceProgress}%` }} /></div>
                  </>
                ) : (
                  <>
                    <Upload className={s.dropIcon} />
                    <span className={s.dropText}>Click to upload face image</span>
                    <span className={s.dropHint}>PNG, JPG up to 10MB</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Voice Sample */}
          <div className={`${s.uploadCard} ${voiceUrl ? s.uploadCardReady : ''}`}>
            <input ref={voiceRef} type="file" accept=".mp3,.wav,.m4a" onChange={handleVoiceUpload} className={s.hidden} />
            <div className={s.uploadCardHeader}>
              <Mic className={s.uploadCardIcon} />
              <div>
                <h4 className={s.uploadCardTitle}>Voice Sample</h4>
                <p className={s.uploadCardDesc}>Audio for voice cloning (optional)</p>
              </div>
            </div>
            {voiceUrl ? (
              <div className={s.uploadReadyArea}>
                <CheckCircle className={s.readyCheckIcon} />
                <span className={s.readyText}>Voice sample loaded</span>
                <button onClick={() => setVoiceUrl(null)} className={s.removeBtn}><X className={s.iconXs} /> Remove</button>
              </div>
            ) : (
              <div className={s.dropArea} onClick={() => voiceRef.current?.click()}>
                {uploadingVoice ? (
                  <>
                    <Loader className={`${s.dropIcon} animate-spin`} />
                    <span className={s.dropText}>Uploading... {voiceProgress}%</span>
                    <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${voiceProgress}%` }} /></div>
                  </>
                ) : (
                  <>
                    <Upload className={s.dropIcon} />
                    <span className={s.dropText}>Click to upload voice sample</span>
                    <span className={s.dropHint}>MP3, WAV, M4A</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Script + Generate */}
        <div className={s.scriptColumn}>
          <div className={s.scriptCard}>
            <h4 className={s.scriptLabel}>Script</h4>
            <p className={s.scriptDesc}>What should the AI say in the video?</p>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Enter your script..."
              className={s.textarea}
              maxLength={2000}
              rows={8}
            />
            <div className={s.textareaFooter}>
              <span className={s.charCount}>{script.length}/2000 characters</span>
            </div>

            {error && (
              <div className={s.errorMsg}><X className={s.iconSm} /> {error}</div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !script.trim() || !faceImageUrl}
              className={s.generateBtn}
            >
              {generating ? (
                <><Loader className={`${s.iconSm} animate-spin`} /> {progress || 'Generating...'}</>
              ) : (
                <><Sparkles className={s.iconSm} /> Generate AI Video</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Result */}
      {videoUrl && (
        <div className={s.resultCard}>
          <div className={s.resultHeader}>
            <h3 className={s.resultTitle}><Video className={s.iconSm} /> Generated Video</h3>
            <div className={s.resultActions}>
              <a href={videoUrl} download className={s.resultActionBtn}><Download className={s.iconSm} /> Download</a>
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={s.resultActionBtn}><ExternalLink className={s.iconSm} /> Open</a>
            </div>
          </div>
          <video src={videoUrl} controls className={s.resultVideo} />
        </div>
      )}
    </div>
  )
}
