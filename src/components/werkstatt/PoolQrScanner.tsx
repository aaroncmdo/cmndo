'use client'

// Werkstatt-QR-Pool — Zuweis-Scanner. Kamera-Scan via BarcodeDetector (wo
// verfuegbar) + immer sichtbarer manueller Token-Fallback. Liefert den
// erkannten/eingegebenen Token via onToken.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/primitives'
import { extractQrPoolToken } from '@/lib/werkstatt/qr-pool-token'

// BarcodeDetector ist (noch) nicht in den Standard-DOM-Types.
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  const scannerVerfuegbar = getBarcodeDetectorCtor() !== null

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
    const Ctor = getBarcodeDetectorCtor()
    if (!Ctor) {
      setFehler('Kamera-Scan wird auf diesem Gerät nicht unterstützt — bitte Code manuell eingeben.')
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
      const detector = new Ctor({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            const token = extractQrPoolToken(codes[0].rawValue)
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
        scannerVerfuegbar && (
          <Button variant="navy" size="sm" onClick={startScan} disabled={disabled}>
            Kamera-Scan starten
          </Button>
        )
      )}

      <div className="space-y-1">
        <label className="text-body-xs font-medium text-claimondo-navy">
          {scannerVerfuegbar ? 'Oder Code manuell eingeben' : 'Code manuell eingeben'}
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
