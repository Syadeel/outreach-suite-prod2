'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Video, Upload, Play, Trash2, ExternalLink, Copy, CheckCircle, Loader, X } from 'lucide-react'
import s from './VideoTab.module.css'

export default function VideoTab() {
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
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title || file.name, video_url: data.url })
            }).then(r => r.json()).then(() => { fetchVideos(); resolve() }).catch(reject)
          } else { reject(new Error(`Upload failed: ${xhr.status}`)) }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', '/api/upload')
        xhr.send(form)
      })
      setTitle('')
    } catch (err: any) { alert(err.message || 'Upload failed') }
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
    } catch (err) { alert('Camera access denied') }
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
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title || 'Webcam Recording', video_url: data.url })
            }).then(r => r.json()).then(() => { fetchVideos(); resolve() }).catch(reject)
          } else { reject(new Error(`Upload failed: ${xhr.status}`)) }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', '/api/upload')
        xhr.send(form)
      })
      setTitle(''); setRecordedBlob(null); setShowRecord(false)
    } catch (err: any) { alert(err.message || 'Upload failed') }
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
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><Video className={s.titleIcon} /> Video Library</h2>
          <p className={s.subtitle}>Record, upload, and manage your video pitches.</p>
        </div>
        <div className={s.actions}>
          <label className={s.uploadBtn}><Upload className={s.iconSm} /> {uploading ? `Uploading ${uploadProgress}%` : 'Upload Video'}<input type="file" accept="video/*" onChange={handleFileUpload} className={s.hidden} disabled={uploading} /></label>
          <button onClick={() => setShowRecord(!showRecord)} className={s.recordBtn}><Play className={s.iconSm} /> Record</button>
        </div>
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
        <div className={s.empty}>Loading videos...</div>
      ) : videos.length === 0 ? (
        <div className={s.emptyCard}><Video className={s.emptyIcon} /><h3 className={s.emptyTitle}>No Videos Yet</h3><p className={s.emptyText}>Record or upload your first video pitch.</p></div>
      ) : (
        <div className={s.grid}>
          {videos.map((video) => (
            <div key={video.id} className={s.card}>
              <video src={video.video_url} className={s.thumbnail} muted playsInline />
              <div className={s.cardContent}>
                <h3 className={s.cardTitle}>{video.title || 'Untitled'}</h3>
                <p className={s.cardDate}>{new Date(video.created_at).toLocaleDateString()}</p>
                <div className={s.cardActions}>
                  <a href={video.video_url} target="_blank" rel="noopener noreferrer" className={s.cardLink}><ExternalLink className={s.iconXs} /></a>
                  <button onClick={() => copyToClipboard(video.video_url, video.id)} className={s.cardLink}>{copiedId === video.id ? <CheckCircle className={s.iconXs} /> : <Copy className={s.iconXs} />}</button>
                  <button onClick={() => deleteVideo(video.id)} className={s.cardDelete}><Trash2 className={s.iconXs} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
