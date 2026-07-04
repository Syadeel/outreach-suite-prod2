'use client'

import { useEffect, useRef } from 'react'

interface CalendlyWidgetProps {
  embedCode: string | null
  ctaUrl?: string | null
}

export default function CalendlyWidget({ embedCode, ctaUrl }: CalendlyWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // If there's a direct Calendly URL, use iframe approach
    if (ctaUrl && ctaUrl.includes('calendly.com')) {
      const container = containerRef.current
      container.innerHTML = ''
      
      const iframe = document.createElement('iframe')
      iframe.src = `${ctaUrl}?embed_domain=${window.location.hostname}`
      iframe.style.width = '100%'
      iframe.style.minHeight = '630px'
      iframe.style.border = 'none'
      iframe.style.borderRadius = '12px'
      container.appendChild(iframe)
      return
    }

    // If there's an embed code, parse and inject it
    if (embedCode) {
      const container = containerRef.current
      container.innerHTML = ''

      // Try to extract the Calendly URL from the embed code
      const urlMatch = embedCode.match(/data-url="([^"]+)"/) || embedCode.match(/src="([^"]*calendly[^"]*)"/)
      
      if (urlMatch && urlMatch[1]) {
        // Found a Calendly URL, use iframe
        const calendlyUrl = urlMatch[1].replace(/&amp;/g, '&')
        // Validate Calendly URL
        if (calendlyUrl.startsWith('https://calendly.com/')) {
          const iframe = document.createElement('iframe')
          iframe.src = `${calendlyUrl}?embed_domain=${window.location.hostname}`
          iframe.style.width = '100%'
          iframe.style.minHeight = '630px'
          iframe.style.border = 'none'
          iframe.style.borderRadius = '12px'
          container.appendChild(iframe)
        }
      } else {
        // Sanitize: only allow iframes from calendly.com
        const sanitized = embedCode.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sanitized;
        // Only keep iframes from calendly.com
        const iframes = tempDiv.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          const src = iframe.getAttribute('src') || '';
          if (!src.includes('calendly.com')) {
            iframe.remove();
          }
        });
        container.appendChild(tempDiv);
        
        // Load Calendly script if not already loaded
        if (!document.querySelector('script[src*="calendly.com/assets/external/widget.js"]')) {
          const script = document.createElement('script')
          script.src = 'https://assets.calendly.com/assets/external/widget.js'
          script.async = true
          document.body.appendChild(script)
        }
      }
    }
  }, [embedCode, ctaUrl])

  if (!embedCode && !ctaUrl) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
        No calendar configured. Add a Calendly link in the CTA URL field.
      </div>
    )
  }

  return (
    <div ref={containerRef} className="calend-embed" style={{ width: '100%', minHeight: '630px' }} />
  )
}
