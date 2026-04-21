// AAR-519 (S2): Hook für Screenshot-Capture via html2canvas.
// Viewport-only (nicht Full-Page), scale 0.5 für kleine Files (<500KB).
// Default-Export: { screenshot, capture, clearScreenshot, isCapturing, error }.
//
// AAR-646: Wechsel von html2canvas v1 auf html2canvas-pro — die alte
// Library kann moderne CSS-Farben (lab(), oklch(), color()) nicht parsen
// und crasht mit „attempted to parse an unsupported color function: lab"
// sobald Tailwind v4 oder ein Claimondo-Token oklch() nutzt. html2canvas-pro
// ist ein drop-in Fork mit moderner CSS-Color-Unterstützung.

'use client'

import { useCallback, useState } from 'react'

// html2canvas-pro wird dynamisch importiert, damit der Bundle-Cost nur
// anfällt wenn der Support-Drawer tatsächlich geöffnet wird.
export function useScreenshot() {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(async () => {
    if (typeof window === 'undefined') return
    setIsCapturing(true)
    setError(null)
    try {
      const mod = await import('html2canvas-pro')
      const html2canvas = mod.default
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 0.5,
        logging: false,
        backgroundColor: '#ffffff',
        height: window.innerHeight,
        windowHeight: window.innerHeight,
      })
      const dataUrl = canvas.toDataURL('image/png', 0.85)
      setScreenshot(dataUrl)
    } catch (e) {
      console.error('[AAR-519/AAR-646] Screenshot-Capture fehlgeschlagen:', e)
      setError(e instanceof Error ? e.message : 'Screenshot fehlgeschlagen')
      setScreenshot(null)
    } finally {
      setIsCapturing(false)
    }
  }, [])

  const clearScreenshot = useCallback(() => {
    setScreenshot(null)
    setError(null)
  }, [])

  return { screenshot, capture, clearScreenshot, isCapturing, error }
}
