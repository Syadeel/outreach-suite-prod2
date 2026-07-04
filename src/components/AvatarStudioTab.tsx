'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Upload, Video, Mic, CheckCircle, Loader, Sparkles, 
  Play, XCircle, RefreshCw, Trash2, Download, ExternalLink,
  Volume2, Eye, Settings, Zap, Brain, Wand2
} from 'lucide-react'
import styles from './AvatarStudioTab.module.css'

interface AvatarConfig {
  voiceRefUrl: string | null
  faceVideoUrl: string | null
  avatarImageUrl: string | null
  voiceModel: 'cosyvoice' | 'qwen3-tts' | 'edge-tts'
  faceModel: 'latentsync' | 'catvton' | 'wan27'
  quality: 'fast' | 'balanced' | 'high'
}

export default function AvatarStudioTab() {
  // ─── Avatar State ───
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [faceFile, setFaceFile] = useState<File | null>(null)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const [faceUploading, setFaceUploading] = useState(false)
  const [voiceProgress, setVoiceProgress] = useState(0)
  const [faceProgress, setFaceProgress] = useState(0)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null)
  const [avatarReady, setAvatarReady] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStep, setGenerationStep] = useState('')

  // ─── Config State ───
  const [voiceModel, setVoiceModel] = useState<'cosyvoice' | 'qwen3-tts' | 'edge-tts'>('cosyvoice')
  const [faceModel, setFaceModel] = useState<'latentsync' | 'catvton' | 'wan27'>('latentsync')
  const [quality, setQuality] = useState<'fast' | 'balanced' | 'high'>('balanced')
  const [showSettings, setShowSettings] = useState(false)

  // ─── Test State ───
  const [testText, setTestText] = useState('Hey, just wanted to show you something cool. Check this out.')
  const [testGenerating, setTestGenerating] = useState(false)
  const [testVideoUrl, setTestVideoUrl] = useState<string | null>(null)

  // ─── Requirements State ───
  const [baseVideoReady, setBaseVideoReady] = useState(false)

  const voiceRef = useRef<HTMLInputElement>(null)
  const faceRef = useRef<HTMLInputElement>(null)

  // ─── Load saved avatar on mount ───
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const res = await fetch('/api/avatar-config?userId=default_user')
        if (res.ok) {
          const data = await res.json()
          if (data.voiceRefUrl) setVoiceUrl(data.voiceRefUrl)
          if (data.faceVideoUrl) setFaceUrl(data.faceVideoUrl)
          if (data.avatarImageUrl) setAvatarImageUrl(data.avatarImageUrl)
          if (data.voiceRefUrl && data.faceVideoUrl) setAvatarReady(true)
        }
      } catch { /* fall through to localStorage */ }

      // Fallback to localStorage
      const savedVoice = localStorage.getItem('os_avatar_voice_url')
      const savedFace = localStorage.getItem('os_avatar_face_url')
      const savedImage = localStorage.getItem('os_avatar_image_url')
      if (savedVoice) setVoiceUrl(savedVoice)
      if (savedFace) setFaceUrl(savedFace)
      if (savedImage) setAvatarImageUrl(savedImage)
      if (savedVoice && savedFace) setAvatarReady(true)

      // Check base video status
      try {
        const res = await fetch('/api/v2/avatar-config/status?userId=default_user')
        if (res.ok) {
          const data = await res.json()
          setBaseVideoReady(data.status === 'done')
        }
      } catch {}
    }

    loadAvatar()
  }, [])

  // ─── Cloudinary Upload Helper ───
  const uploadToCloudinary = async (file: File, onProgress: (pct: number) => void): Promise<string> => {
    const bucket = file.type.includes('image') ? 'images' : 'videos'
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', bucket)
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
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

  // ─── Handle Voice Upload ───
  const handleVoiceUpload = async (file: File) => {
    setVoiceFile(file)
    setVoiceUploading(true)
    setVoiceProgress(0)
    try {
      const url = await uploadToCloudinary(file, setVoiceProgress)
      setVoiceUrl(url)
      localStorage.setItem('os_avatar_voice_url', url)
      if (faceUrl) setAvatarReady(true)
    } catch (err: any) {
      console.error('Voice upload failed:', err)
    } finally {
      setVoiceUploading(false)
    }
  }

  // ─── Handle Face Image Upload ───
  const handleFaceUpload = async (file: File) => {
    setFaceFile(file)
    setFaceUploading(true)
    setFaceProgress(0)
    try {
      const url = await uploadToCloudinary(file, setFaceProgress)
      setFaceUrl(url)
      localStorage.setItem('os_avatar_face_url', url)
      if (voiceUrl) setAvatarReady(true)
    } catch (err: any) {
      console.error('Face upload failed:', err)
    } finally {
      setFaceUploading(false)
    }
  }

  // ─── Save Avatar Configuration ───
  const handleSaveAvatar = async () => {
    if (!voiceUrl || !faceUrl) return

    try {
      const res = await fetch('/api/avatar-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default_user',
          voiceRefUrl: voiceUrl,
          faceVideoUrl: faceUrl,
          avatarImageUrl: avatarImageUrl,
        }),
      })
      if (res.ok) {
        // Also save to localStorage as backup
        localStorage.setItem('os_avatar_voice_url', voiceUrl)
        localStorage.setItem('os_avatar_face_url', faceUrl)
        if (avatarImageUrl) localStorage.setItem('os_avatar_image_url', avatarImageUrl)
      }
    } catch (err) {
      console.error('Failed to save avatar config:', err)
    }
  }

  // ─── Reset Avatar ───
  const handleResetAvatar = async () => {
    localStorage.removeItem('os_avatar_voice_url')
    localStorage.removeItem('os_avatar_face_url')
    localStorage.removeItem('os_avatar_image_url')
    setVoiceUrl(null)
    setFaceUrl(null)
    setAvatarImageUrl(null)
    setAvatarReady(false)

    try {
      await fetch('/api/avatar-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default_user',
          voiceRefUrl: null,
          faceVideoUrl: null,
          avatarImageUrl: null,
        }),
      })
    } catch { /* ignore */ }
  }

  // ─── Generate AI Avatar ───
  const handleGenerateAvatar = async () => {
    if (!voiceUrl || !faceUrl) return

    setGenerating(true)
    setGenerationProgress(0)
    setGenerationStep('Initializing...')

    try {
      // Step 1: Voice cloning
      setGenerationStep('Cloning voice with CosyVoice...')
      setGenerationProgress(10)
      
      const voiceCloneRes = await fetch('/api/v2/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: testText,
          ref_audio_url: voiceUrl 
        }),
      })

      if (!voiceCloneRes.ok) throw new Error('Voice cloning failed')
      const voiceData = await voiceCloneRes.json()
      setGenerationProgress(40)

      // Step 2: Lip-sync with LatentSync
      setGenerationStep('Generating lip-sync with LatentSync...')
      
      const lipSyncRes = await fetch('/api/v2/latentsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: faceUrl,
          audio_url: voiceData.audioUrl,
        }),
      })

      if (!lipSyncRes.ok) throw new Error('Lip-sync failed')
      const lipSyncData = await lipSyncRes.json()
      setGenerationProgress(80)

      // Step 3: Generate avatar image with CatVTON (optional)
      setGenerationStep('Generating professional avatar...')
      
      // This would call CatVTON for virtual try-on
      // For now, we'll use the video frame as avatar
      setAvatarImageUrl(faceUrl)
      setGenerationProgress(100)

      setTestVideoUrl(lipSyncData.videoUrl)
      setGenerationStep('Avatar generated successfully!')
    } catch (err: any) {
      console.error('Avatar generation failed:', err)
      setGenerationStep(`Error: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // ─── Generate Test Video ───
  const handleGenerateTest = async () => {
    if (!voiceUrl || !faceUrl || !testText.trim()) return

    setTestGenerating(true)
    try {
      const res = await fetch('/api/v2/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'test',
          script: testText,
          faceVideoUrl: faceUrl,
          voiceRefUrl: voiceUrl,
        }),
      })

      if (!res.ok) throw new Error('Test generation failed')
      const data = await res.json()
      setTestVideoUrl(data.videoUrl)
    } catch (err: any) {
      console.error('Test generation failed:', err)
    } finally {
      setTestGenerating(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Sparkles className={styles.headerIcon} />
          <div>
            <h2 className={styles.title}>Avatar Studio</h2>
            <p className={styles.subtitle}>Create your AI avatar for personalized video outreach</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={styles.settingsBtn}
        >
          <Settings className={styles.settingsIcon} />
        </button>
      </div>

      {/* Requirements Status Panel */}
      <div className={styles.reqPanel}>
        <h3 className={styles.reqTitle}>Generation Requirements</h3>
        <div className={styles.reqGrid}>
          <div className={`${styles.reqItem} ${voiceUrl ? styles.reqDone : styles.reqMissing}`}>
            {voiceUrl ? <CheckCircle className={styles.reqIconDone} /> : <XCircle className={styles.reqIconMissing} />}
            <span>Voice Sample</span>
          </div>
          <div className={`${styles.reqItem} ${faceUrl ? styles.reqDone : styles.reqMissing}`}>
            {faceUrl ? <CheckCircle className={styles.reqIconDone} /> : <XCircle className={styles.reqIconMissing} />}
            <span>Face Image</span>
          </div>
          <div className={`${styles.reqItem} ${testText.trim() ? styles.reqDone : styles.reqMissing}`}>
            {testText.trim() ? <CheckCircle className={styles.reqIconDone} /> : <XCircle className={styles.reqIconMissing} />}
            <span>Script Template</span>
          </div>
          <div className={`${styles.reqItem} ${baseVideoReady ? styles.reqDone : styles.reqMissing}`}>
            {baseVideoReady ? <CheckCircle className={styles.reqIconDone} /> : <XCircle className={styles.reqIconMissing} />}
            <span>Base Video</span>
          </div>
        </div>
        <div className={`${styles.reqSummary} ${voiceUrl && faceUrl ? styles.reqSummaryReady : styles.reqSummaryPending}`}>
          {voiceUrl && faceUrl
            ? 'Ready to generate — Upload a script and click Generate'
            : 'Upload a voice sample and face image to get started'}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className={styles.settingsPanel}>
          <h3 className={styles.settingsTitle}>Avatar Settings</h3>
          
          <div className={styles.settingsGrid}>
            <div className={styles.settingGroup}>
              <label className={styles.settingLabel}>Voice Model</label>
              <select 
                value={voiceModel} 
                onChange={(e) => setVoiceModel(e.target.value as any)}
                className={styles.settingSelect}
              >
                <option value="cosyvoice">CosyVoice (Best Quality)</option>
                <option value="qwen3-tts">Qwen3-TTS (Fast)</option>
                <option value="edge-tts">Edge-TTS (Free)</option>
              </select>
            </div>

            <div className={styles.settingGroup}>
              <label className={styles.settingLabel}>Face Model</label>
              <select 
                value={faceModel} 
                onChange={(e) => setFaceModel(e.target.value as any)}
                className={styles.settingSelect}
              >
                <option value="latentsync">LatentSync (Best)</option>
                <option value="catvton">CatVTON (Virtual Try-On)</option>
                <option value="wan27">Wan2.7 (Video Gen)</option>
              </select>
            </div>

            <div className={styles.settingGroup}>
              <label className={styles.settingLabel}>Quality</label>
              <select 
                value={quality} 
                onChange={(e) => setQuality(e.target.value as any)}
                className={styles.settingSelect}
              >
                <option value="fast">Fast (Lower Quality)</option>
                <option value="balanced">Balanced</option>
                <option value="high">High (Slow)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Upload Section */}
        <div className={styles.uploadSection}>
          <h3 className={styles.sectionTitle}>
            <Upload className={styles.sectionIcon} />
            Upload Samples
          </h3>
          <p className={styles.sectionDesc}>
            Upload a voice sample and face image to create your AI avatar
          </p>

          <div className={styles.uploadGrid}>
            {/* Voice Upload */}
            <div 
              onClick={() => voiceRef.current?.click()}
              className={`${styles.uploadCard} ${voiceUrl ? styles.uploadCardReady : ''}`}
            >
              <input
                ref={voiceRef}
                type="file"
                accept=".mp3,.wav,.m4a"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleVoiceUpload(f)
                  e.target.value = ''
                }}
              />
              <Mic className={styles.uploadIcon} />
              <p className={styles.uploadTitle}>Voice Sample</p>
              <p className={styles.uploadDesc}>.mp3, .wav, or .m4a</p>
              <p className={styles.uploadHint}>30+ seconds recommended</p>

              {voiceUploading && (
                <div className={styles.uploadProgress}>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${voiceProgress}%` }} 
                    />
                  </div>
                  <p className={styles.progressText}>{voiceProgress}%</p>
                </div>
              )}
              {voiceUrl && !voiceUploading && (
                <div className={styles.uploadReady}>
                  <CheckCircle className={styles.readyIcon} />
                  <span>Ready</span>
                </div>
              )}
            </div>

            {/* Face Image Upload */}
            <div 
              onClick={() => faceRef.current?.click()}
              className={`${styles.uploadCard} ${faceUrl ? styles.uploadCardReady : ''}`}
            >
              <input
                ref={faceRef}
                type="file"
                accept=".mp4,.webm,.mov"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFaceUpload(f)
                  e.target.value = ''
                }}
              />
              <Video className={styles.uploadIcon} />
              <p className={styles.uploadTitle}>Face Image</p>
              <p className={styles.uploadDesc}>.mp4, .webm, or .mov</p>
              <p className={styles.uploadHint}>Face clearly visible, good lighting</p>

              {faceUploading && (
                <div className={styles.uploadProgress}>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${faceProgress}%` }} 
                    />
                  </div>
                  <p className={styles.progressText}>{faceProgress}%</p>
                </div>
              )}
              {faceUrl && !faceUploading && (
                <div className={styles.uploadReady}>
                  <CheckCircle className={styles.readyIcon} />
                  <span>Ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.actions}>
            <button
              onClick={handleSaveAvatar}
              disabled={!avatarReady}
              className={styles.saveBtn}
            >
              <Sparkles className={styles.btnIcon} />
              Save Avatar
            </button>
            {(voiceUrl || faceUrl) && (
              <button
                onClick={handleResetAvatar}
                className={styles.resetBtn}
              >
                <Trash2 className={styles.btnIcon} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Generation Section */}
        <div className={styles.generationSection}>
          <h3 className={styles.sectionTitle}>
            <Wand2 className={styles.sectionIcon} />
            Generate Avatar
          </h3>
          <p className={styles.sectionDesc}>
            Generate your AI avatar with voice cloning and lip-sync
          </p>

          {/* Test Text Input */}
          <div className={styles.testInput}>
            <label className={styles.testLabel}>Test Script</label>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Enter text for your avatar to say..."
              className={styles.testTextarea}
              maxLength={2000}
            />
            <p className={styles.testHint}>{testText.length}/2000 characters (~{Math.round(testText.length / 15)}s of speech)</p>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerateAvatar}
            disabled={!avatarReady || generating}
            className={styles.generateBtn}
          >
            {generating ? (
              <>
                <Loader className={styles.btnIcon} />
                {generationStep}
              </>
            ) : (
              <>
                <Zap className={styles.btnIcon} />
                Generate AI Avatar
              </>
            )}
          </button>

          {/* Progress */}
          {generating && (
            <div className={styles.generationProgress}>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${generationProgress}%` }} 
                />
              </div>
              <p className={styles.progressText}>{generationStep}</p>
            </div>
          )}

          {/* Preview */}
          {testVideoUrl && (
            <div className={styles.preview}>
              <h4 className={styles.previewTitle}>Avatar Preview</h4>
              <video 
                src={testVideoUrl} 
                controls 
                className={styles.previewVideo}
              />
              <div className={styles.previewActions}>
                <a 
                  href={testVideoUrl} 
                  download 
                  className={styles.downloadBtn}
                >
                  <Download className={styles.btnIcon} />
                  Download
                </a>
                <button 
                  onClick={() => window.open(testVideoUrl, '_blank')}
                  className={styles.openBtn}
                >
                  <ExternalLink className={styles.btnIcon} />
                  Open
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Avatar Preview */}
      {avatarReady && (
        <div className={styles.avatarPreview}>
          <h3 className={styles.sectionTitle}>
            <Eye className={styles.sectionIcon} />
            Avatar Preview
          </h3>
          
          <div className={styles.previewGrid}>
            {voiceUrl && (
              <div className={styles.previewCard}>
                <Volume2 className={styles.previewIcon} />
                <p className={styles.previewLabel}>Voice Sample</p>
                <audio src={voiceUrl} controls className={styles.audioPlayer} />
              </div>
            )}
            
            {faceUrl && (
              <div className={styles.previewCard}>
                <Video className={styles.previewIcon} />
                <p className={styles.previewLabel}>Face Image</p>
                <video 
                  src={faceUrl} 
                  muted 
                  loop 
                  playsInline
                  className={styles.facePreview}
                />
              </div>
            )}

            {avatarImageUrl && (
              <div className={styles.previewCard}>
                <Brain className={styles.previewIcon} />
                <p className={styles.previewLabel}>AI Avatar</p>
                <img 
                  src={avatarImageUrl} 
                  alt="AI Avatar" 
                  className={styles.avatarImage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Tips */}
      <div className={styles.tips}>
        <h3 className={styles.tipsTitle}>
          <Sparkles className={styles.tipsIcon} />
          Tips for Best Results
        </h3>
        <ul className={styles.tipsList}>
          <li>Use a clear, well-lit voice sample (30+ seconds)</li>
          <li>Face video should have good lighting and clear face visibility</li>
          <li>Speak naturally in your voice sample</li>
          <li>Keep face image stable (use a tripod if possible)</li>
          <li>Test with short scripts first before bulk generation</li>
        </ul>
      </div>
    </div>
  )
}
