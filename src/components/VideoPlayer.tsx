'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { spliceClips, type ClipInfo, isFFmpegSupported } from '@/lib/browser-splice'
import s from './VideoPlayer.module.css'

interface VideoPlayerProps {
  baseVideoUrl: string
  clips?: ClipInfo[]
  totalDuration?: number
  leadId?: string
  className?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
}

type PlayerState = 'loading' | 'splicing' | 'ready' | 'error'

export default function VideoPlayer({
  baseVideoUrl,
  clips = [],
  totalDuration = 30,
  leadId,
  className = '',
  autoPlay = true,
  muted = true,
  loop = true,
}: VideoPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [state, setState] = useState<PlayerState>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  const processVideo = useCallback(async () => {
    if (!baseVideoUrl) {
      setState('error')
      setErrorMsg('No video URL provided')
      return
    }

    if (clips.length === 0 || !isFFmpegSupported()) {
      setVideoUrl(baseVideoUrl)
      setState('ready')
      return
    }

    setState('splicing')
    setProgress('Preparing video...')

    try {
      setProgress('Loading video editor...')
      const result = await spliceClips(baseVideoUrl, clips, totalDuration)
      setVideoUrl(result.videoBlobUrl)
      setState('ready')
    } catch (err: any) {
      console.error('[VideoPlayer] Splice failed:', err)
      setVideoUrl(baseVideoUrl)
      setState('ready')
      setErrorMsg(`Splice failed: ${err.message}. Showing base video.`)
    }
  }, [baseVideoUrl, clips, totalDuration])

  useEffect(() => {
    processVideo()
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [processVideo])

  return (
    <div className={`${s.container} ${className}`}>
      {(state === 'loading' || state === 'splicing') && (
        <div className={s.loading}>
          <div className={s.loadingSpinner} />
          <p className={s.loadingText}>
            {state === 'splicing' ? progress : 'Loading video...'}
          </p>
        </div>
      )}

      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          className={s.video}
          onError={() => setErrorMsg('Video playback error')}
        />
      )}

      {errorMsg && (
        <div className={s.errorBanner}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
