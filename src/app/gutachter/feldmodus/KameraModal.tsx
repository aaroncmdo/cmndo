'use client'

// AAR-386: In-App-Kamera-Modal für den Feldmodus-Upload.
// Nutzt `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
// statt des nativen `capture='environment'`-File-Pickers. Vorteil: bleibt in
// der PWA, zeigt Live-Preview, unterstützt Retake, und der SV sieht direkt
// was er schiesst. Fallback auf File-Picker wenn Kamera-API nicht verfügbar.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CameraIcon,
  CheckIcon,
  Loader2Icon,
  RefreshCcwIcon,
  XIcon,
} from 'lucide-react'
import { uploadDokumentToOutbox } from '@/lib/fall/upload-dokument'

interface Props {
  open: boolean
  fallId: string
  slotId: string | null
  dokumentTyp: string
  slotLabel: string
  istPflicht: boolean
  onClose: () => void
  onUploaded: (dokumentId: string) => void
}

type Phase = 'live' | 'preview' | 'uploading'

export default function KameraModal({
  open,
  fallId,
  slotId,
  dokumentTyp,
  slotLabel,
  istPflicht,
  onClose,
  onUploaded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('live')
  const [error, setError] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
  }, [])

  const startStream = useCallback(async () => {
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera-API wird vom Browser nicht unterstützt.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kamera-Zugriff verweigert'
      setError(msg)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPhase('live')
    setCapturedFile(null)
    setPreviewUrl(null)
    void startStream()
    return () => {
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) {
      toast.error('Kamera noch nicht bereit')
      return
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Foto konnte nicht erstellt werden')
          return
        }
        const fileName = `${dokumentTyp}_${Date.now()}.jpg`
        const file = new File([blob], fileName, { type: 'image/jpeg' })
        setCapturedFile(file)
        setPreviewUrl(URL.createObjectURL(blob))
        setPhase('preview')
        stopStream()
      },
      'image/jpeg',
      0.92,
    )
  }

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCapturedFile(null)
    setPreviewUrl(null)
    setPhase('live')
    void startStream()
  }

  const handleConfirm = () => {
    if (!capturedFile || isPending) return
    setPhase('uploading')
    startTransition(async () => {
      const res = await uploadDokumentToOutbox(
        fallId,
        slotId,
        capturedFile,
        dokumentTyp,
        { istPflicht },
      )
      if (res.ok) {
        toast.success(`${slotLabel} hochgeladen`)
        onUploaded(res.dokumentId)
        handleClose()
      } else {
        toast.error(res.error)
        setPhase('preview')
      }
    })
  }

  const handleClose = useCallback(() => {
    stopStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCapturedFile(null)
    setPreviewUrl(null)
    setPhase('live')
    onClose()
  }, [onClose, previewUrl, stopStream])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto aufnehmen: ${slotLabel}`}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-black text-white">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/60">
            Foto aufnehmen
          </p>
          <p className="text-sm font-semibold truncate">{slotLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-white/10 text-white/80"
          aria-label="Abbrechen"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="max-w-md p-6 text-center text-white/90 space-y-3">
            <p className="text-sm">Kamera-Zugriff nicht möglich:</p>
            <p className="text-xs text-red-300">{error}</p>
            <p className="text-xs text-white/70">
              Bitte Kamera-Berechtigung in den Browser-Einstellungen erlauben
              oder Datei über „Hochladen" auswählen.
            </p>
          </div>
        ) : phase === 'preview' && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Aufgenommenes Foto"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="px-4 py-4 bg-black">
        {phase === 'live' && !error && (
          <button
            type="button"
            onClick={handleCapture}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-white text-black text-sm font-semibold hover:bg-claimondo-bg"
          >
            <CameraIcon className="w-5 h-5" />
            Foto aufnehmen
          </button>
        )}
        {phase === 'preview' && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleRetake}
              disabled={isPending}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCcwIcon className="w-4 h-4" />
              Erneut
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckIcon className="w-4 h-4" />
              )}
              Hochladen
            </button>
          </div>
        )}
        {phase === 'uploading' && (
          <div className="flex items-center justify-center gap-2 py-4 text-white/80 text-sm">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            Lade hoch…
          </div>
        )}
      </div>
    </div>
  )
}
