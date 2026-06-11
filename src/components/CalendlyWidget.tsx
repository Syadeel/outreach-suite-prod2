'use client'

import { useEffect, useRef } from 'react'

interface Props {
  embedCode: string | null
}

/**
 * Parses Calendly data-url from an embed code HTML string.
 * Scripts injected via dangerouslySetInnerHTML don't execute,
 * so we extract the URL and use the Calendly JS API instead.
 */
function parseCalendlyUrl(html: string): string | null {
  const match = html.match(/data-url="([^"]+)"/)
  return match ? match[1] : null
}

/**
 * CalendlyWidget — Renders a Calendly inline booking widget.
 *
 * Instead of using dangerouslySetInnerHTML (which can't execute scripts),
 * we dynamically load the Calendly widget script and use initInlineWidget().
 *
 * Falls back to a simple "Book a Call" link if the script fails to load.
 */
export default function CalendlyWidget({ embedCode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!embedCode || initialized.current) return

    const url = parseCalendlyUrl(embedCode)
    if (!url || !containerRef.current) return

    initialized.current = true

    // Check if script is already loaded
    if (document.querySelector('script[src*="calendly.com/assets/external/widget.js"]')) {
      // Script already loaded — init directly
      if ((window as any).Calendly) {
        ;(window as any).Calendly.initInlineWidget({
          url,
          parentElement: containerRef.current,
        })
      }
      return
    }

    // Load the Calendly widget script dynamically
    const script = document.createElement('script')
    script.src = 'https://assets.calendly.com/assets/external/widget.js'
    script.async = true
    script.onload = () => {
      if ((window as any).Calendly && containerRef.current) {
        ;(window as any).Calendly.initInlineWidget({
          url,
          parentElement: containerRef.current,
        })
      }
    }
    document.head.appendChild(script)
  }, [embedCode])

  if (!embedCode) return null

  const url = parseCalendlyUrl(embedCode)

  if (!url) {
    // Not a Calendly embed — fall back to rendering raw HTML
    return <div dangerouslySetInnerHTML={{ __html: embedCode }} />
  }

  return (
    <div
      ref={containerRef}
      style={{ minWidth: '320px', minHeight: '700px' }}
      className="calendly-widget-container"
    >
      {/* Fallback link shown while script loads */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-base transition-all hover:scale-[1.02]"
        style={{
          background: 'linear-gradient(135deg, var(--brand-color, #4F46E5), var(--brand-color-darker, #3730a3))',
        }}
      >
        <Calendar className="w-4 h-4" />
        Book a Call
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  )
}

// Need ArrowRight and Calendar for the fallback
import { Calendar, ArrowRight } from 'lucide-react'
