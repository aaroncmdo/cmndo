'use client'

// Werkstatt-QR-Pool — Zuweis-Scanner. Kamera-Scan (nativ via BarcodeDetector wo
// verfuegbar — Chrome/Edge/Android; sonst jsQR-Fallback für Safari/iOS/Firefox) +
// immer sichtbarer manueller Token-Fallback. Liefert den erkannten/eingegebenen
// Token via onToken.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/primitives'
import { extractQrPoolToken } from '@/lib/werkstatt/qr-pool-token'

// BarcodeDetector ist (noch) nicht in den Standard-DOM-Types + fehlt in Safari/Firefox.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
}
function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

type Props = {
  onToken: (token: string) => void
  disabled?: boolean
}

export function PoolQrScanner({ onToken, disabled }: Props) {
  const [manuell, setManuell] = useState('')
  const [scanAktiv, setScanAktiv] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  // Kamera-Verfuegbarkeit erst NACH Mount pruefen (kein Hydration-Mismatch). getUserMedia
  // gibt es in allen modernen Browsern (auch Safari/iOS/Firefox) — der QR-Decode faellt bei
  // fehlendem BarcodeDetector auf jsQR zurueck. Frueher war der Button an BarcodeDetector
  // gebunden -> auf Safari/Firefox unsichtbar (Admin fand den Kamera-Scan nicht).
  const [kameraVerfuegbar, setKameraVerfuegbar] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setKameraVerfuegbar(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  function stopScan() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setScanAktiv(false)
  }

  // Cleanup beim Unmount.
  useEffect(() => stopScan, [])

  async function startScan() {
    setFehler(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setFehler('Kamera wird auf diesem Gerät nicht unterstützt — bitte Code manuell eingeben.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanAktiv(true)
      const video = videoRef.current
      if (!video) {
        stopScan()
        return
      }
      video.srcObject = stream
      await video.play()

      // Decoder waehlen: nativ (BarcodeDetector) — sonst jsQR-Fallback, lazy geladen,
      // damit die ~40 KB nur auf Browsern ohne BarcodeDetector im Bundle landen.
      const Ctor = getBarcodeDetectorCtor()
      let decodeFrame: (v: HTMLVideoElement) => Promise<string | null>
      if (Ctor) {
        const detector = new Ctor({ formats: ['qr_code'] })
        decodeFrame = async (v) => (await detector.detect(v))[0]?.rawValue ?? null
      } else {
        const { default: jsQR } = await import('jsqr')
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        decodeFrame = async (v) => {
          if (!ctx || !v.videoWidth) return null
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
        }
      }

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const raw = await decodeFrame(videoRef.current)
          if (raw) {
            const token = extractQrPoolToken(raw)
            if (token) {
              stopScan()
              onToken(token)
              return
            }
          }
        } catch {
          // transienter Frame-Fehler — weiter versuchen
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setFehler('Kamerazugriff nicht möglich — bitte Code manuell eingeben.')
      stopScan()
    }
  }

  function submitManuell() {
    const token = extractQrPoolToken(manuell)
    if (!token) {
      setFehler('Ungültiger Code. Format: WQR-XXXXXXXX')
      return
    }
    setFehler(null)
    setManuell('')
    onToken(token)
  }

  return (
    <div className="space-y-3">
      {scanAktiv ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            className="w-full aspect-square rounded-ios-lg bg-black object-cover"
            playsInline
            muted
          />
          <Button variant="ghost" size="sm" onClick={stopScan}>
            Scan abbrechen
          </Button>
        </div>
      ) : (
        kameraVerfuegbar && (
          <Button variant="navy" size="sm" onClick={startScan} disabled={disabled}>
            Kamera-Scan starten
          </Button>
        )
      )}

      <div className="space-y-1">
        <label className="text-body-xs font-medium text-claimondo-navy">
          {kameraVerfuegbar ? 'Oder Code manuell eingeben' : 'Code manuell eingeben'}
        </label>
        <div className="flex gap-2">
          <input
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            placeholder="WQR-XXXXXXXX"
            className="flex-1 font-mono uppercase rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30"
            disabled={disabled}
          />
          <Button variant="navy" size="sm" onClick={submitManuell} disabled={disabled || !manuell.trim()}>
            Übernehmen
          </Button>
        </div>
      </div>

      {fehler && <p className="text-body-sm text-danger-strong">{fehler}</p>}
    </div>
  )
}
