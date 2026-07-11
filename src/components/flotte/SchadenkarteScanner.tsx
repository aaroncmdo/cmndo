'use client'

// Schadenkarte-QR-Scanner fuer das Flotten-Portal. Kamera-Scan (nativ via
// BarcodeDetector wo verfuegbar — Chrome/Edge/Android; sonst jsQR-Fallback
// fuer Safari/iOS/Firefox) + immer sichtbarer manueller Token-Fallback.
// Liefert den erkannten/eingegebenen Token via onToken.
// FORK von src/components/werkstatt/PoolQrScanner.tsx —
// einzige Aenderung: extractSchadenkarteToken statt extractQrPoolToken.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/primitives/Button'
import { extractSchadenkarteToken } from '@/lib/schadenkarte/token'

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

export function SchadenkarteScanner({ onToken, disabled }: Props) {
  const [manuell, setManuell] = useState('')
  const [scanAktiv, setScanAktiv] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  // Kamera-Verfuegbarkeit erst NACH Mount pruefen (kein Hydration-Mismatch). getUserMedia
  // gibt es in allen modernen Browsern (auch Safari/iOS/Firefox) — der QR-Decode faellt bei
  // fehlendem BarcodeDetector auf jsQR zurueck.
  const [kameraVerfuegbar, setKameraVerfuegbar] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  // onToken stabil halten, damit der Scan-Effekt nicht bei jeder Parent-Render neu startet.
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

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
      // Erst hier true setzen -> der Effect unten haengt den Stream ans NUN gemountete <video>.
      setScanAktiv(true)
    } catch {
      setFehler('Kamerazugriff nicht möglich — bitte Code manuell eingeben.')
      stopScan()
    }
  }

  // Stream ans Video haengen + Decode-Loop — ERST wenn scanAktiv true ist UND das <video>
  // im DOM steht. FIX: frueher las startScan videoRef.current synchron VOR dem Re-Render
  // (Element noch nicht gemountet) -> null -> Scan brach sofort ab, die Vorschau war nie sichtbar.
  useEffect(() => {
    if (!scanAktiv) return
    const stream = streamRef.current
    const video = videoRef.current
    if (!stream || !video) return
    let abgebrochen = false

    video.srcObject = stream
    void video.play().catch(() => {})

    void (async () => {
      // Decoder waehlen: nativ (BarcodeDetector) — sonst jsQR-Fallback, lazy geladen.
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
        if (abgebrochen || !streamRef.current || !videoRef.current) return
        try {
          const raw = await decodeFrame(videoRef.current)
          if (raw) {
            const token = extractSchadenkarteToken(raw)
            if (token) {
              stopScan()
              onTokenRef.current(token)
              return
            }
          }
        } catch {
          // transienter Frame-Fehler — weiter versuchen
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    })()

    return () => {
      abgebrochen = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [scanAktiv])

  function submitManuell() {
    const token = extractSchadenkarteToken(manuell)
    if (!token) {
      setFehler('Ungültiger Code. Format: SKT-XXXXXXXXXXXXXXXX')
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
          {/* Kamera-Vorschau mit Scan-Ausschnitt (Zielrahmen + abgedunkelte Umgebung) */}
          <div className="relative mx-auto w-full max-w-xs aspect-square overflow-hidden rounded-ios-lg bg-black">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="aspect-square w-3/5 rounded-ios-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-body-xs text-white">
              QR-Code in den Rahmen halten
            </p>
          </div>
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
            placeholder="SKT-XXXXXXXXXXXXXXXX"
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
