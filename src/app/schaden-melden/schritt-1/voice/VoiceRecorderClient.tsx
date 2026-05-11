'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { toast } from 'sonner'
import { Mic, Square, Loader2, AlertTriangle, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VoiceExtraction } from '@/lib/flow/schemas/voice-extraction'

// AAR-470 C4: Client-Recorder für Schritt 1 Voice-Modus.
//
// - MediaRecorder (audio/webm) mit 16 kHz Mono-Audio, Auto-Cutoff nach 3 Min
// - Live-Waveform aus AnalyserNode getByteTimeDomain
// - Nach Stop: POST an /api/schaden-melden/voice-transcribe
// - Prefill wird in sessionStorage('claimondo-voice-prefill') geschrieben und
//   /schaden-melden/schritt-1?prefilled=1 übernimmt die Werte im Form
// - Fallback: wenn MediaRecorder nicht supported oder Groq 429 → Toast +
//   Weiterleitung auf den Tippen-Modus

const VOICE_PREFILL_KEY = 'claimondo-voice-prefill'
const MAX_RECORDING_MS = 3 * 60 * 1000

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'processing' }
  | { kind: 'error'; message: string }

type VoicePrefill = VoiceExtraction & { transcript: string; capturedAt: string }

export function VoiceRecorderClient() {
  const router = useRouter()
  const locale = useLocale()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [elapsedMs, setElapsedMs] = useState(0)
  const [supported, setSupported] = useState<boolean | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        'mediaDevices' in navigator &&
        typeof window.MediaRecorder !== 'undefined',
    )
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    analyserRef.current = null
    mediaRecorderRef.current = null
  }, [])

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const buffer = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buffer)
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#4573A2'
      ctx.beginPath()
      const slice = width / buffer.length
      let x = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] / 128.0
        const y = (v * height) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += slice
      }
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          noiseSuppression: true,
          echoCancellation: true,
        },
      })
      streamRef.current = stream

      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => void handleStop()
      recorder.start()

      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      analyserRef.current = analyser
      drawWaveform()

      const startedAt = Date.now()
      setState({ kind: 'recording', startedAt })
      setElapsedMs(0)
      timerRef.current = setInterval(
        () => setElapsedMs(Date.now() - startedAt),
        200,
      )
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
          toast.message('Max. 3 Minuten erreicht — Aufnahme wird verarbeitet.')
        }
      }, MAX_RECORDING_MS)
    } catch (err) {
      console.warn('[AAR-470] getUserMedia fehlgeschlagen:', err)
      setState({
        kind: 'error',
        message:
          'Mikrofon-Zugriff wurde verweigert. Bitte Zugriff erlauben oder tippen.',
      })
    }
  }, [drawWaveform])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleStop = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    setState({ kind: 'processing' })
    const chunks = chunksRef.current
    chunksRef.current = []
    if (chunks.length === 0) {
      setState({ kind: 'error', message: 'Keine Aufnahme erkannt.' })
      return
    }
    const audio = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
    if (audio.size < 1000) {
      setState({ kind: 'error', message: 'Aufnahme zu kurz.' })
      return
    }

    const form = new FormData()
    form.set('audio', audio, 'aufnahme.webm')
    form.set(
      'language',
      ['de', 'en', 'tr', 'pl', 'ru', 'ar'].includes(locale) ? locale : 'de',
    )

    try {
      const res = await fetch('/api/schaden-melden/voice-transcribe', {
        method: 'POST',
        body: form,
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        transcript?: string
        extraction?: VoiceExtraction
        error?: string
      }
      if (res.status === 429) {
        toast.message(
          'Spracherkennung gerade nicht verfügbar — wir schalten auf Tippen um.',
        )
        router.push('/schaden-melden/schritt-1')
        return
      }
      if (!res.ok || !json.success || !json.extraction) {
        setState({
          kind: 'error',
          message: json.error ?? 'Transkription fehlgeschlagen',
        })
        return
      }
      const prefill: VoicePrefill = {
        ...json.extraction,
        transcript: json.transcript ?? '',
        capturedAt: new Date().toISOString(),
      }
      try {
        sessionStorage.setItem(VOICE_PREFILL_KEY, JSON.stringify(prefill))
      } catch {
        // sessionStorage disabled → Prefill geht verloren, User muss tippen
      }
      router.push('/schaden-melden/schritt-1?prefilled=1')
    } catch (err) {
      console.error('[AAR-470] Fetch fehlgeschlagen:', err)
      setState({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Verbindung unterbrochen',
      })
    }
  }, [locale, router])

  if (supported === false) {
    return <UnsupportedFallback onSwitch={() => router.push('/schaden-melden/schritt-1')} />
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-lg bg-claimondo-bg p-1">
        <button
          type="button"
          onClick={() => router.push('/schaden-melden/schritt-1')}
          className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-claimondo-ondo hover:text-claimondo-navy"
        >
          Tippen
        </button>
        <button
          type="button"
          aria-pressed="true"
          className="flex-1 rounded-md bg-white px-4 py-2 text-sm font-semibold text-claimondo-navy shadow-sm"
        >
          Einsprechen
        </button>
      </div>

      <div className="rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-6">
        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            width={560}
            height={100}
            className="h-24 w-full rounded-md bg-claimondo-bg"
            aria-hidden
          />
          <p className="text-sm tabular-nums text-claimondo-ondo">
            {formatTime(elapsedMs)} / 03:00
          </p>
          <RecorderControls
            state={state}
            onStart={startRecording}
            onStop={stopRecording}
            onRetry={() => setState({ kind: 'idle' })}
            onSwitch={() => router.push('/schaden-melden/schritt-1')}
          />
        </div>
      </div>

      {state.kind === 'error' ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{state.message}</p>
            <p className="mt-1 text-xs">
              Sie können die Aufnahme erneut starten oder direkt tippen.
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-center text-xs text-claimondo-ondo">
        Ihre Aufnahme wird nur zur Transkription verwendet und nicht gespeichert.
      </p>
    </div>
  )
}

function RecorderControls({
  state,
  onStart,
  onStop,
  onRetry,
  onSwitch,
}: {
  state: State
  onStart: () => void
  onStop: () => void
  onRetry: () => void
  onSwitch: () => void
}) {
  if (state.kind === 'recording') {
    return (
      <Button
        onClick={onStop}
        className="h-14 w-14 rounded-full bg-red-600 p-0 hover:bg-red-700"
        aria-label="Aufnahme stoppen"
      >
        <Square className="h-6 w-6 text-white" />
      </Button>
    )
  }
  if (state.kind === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-claimondo-navy">
        <Loader2 className="h-4 w-4 animate-spin text-claimondo-ondo" aria-hidden />
        Wird transkribiert …
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button
          onClick={onRetry}
          className="bg-claimondo-ondo hover:bg-claimondo-shield"
        >
          Erneut versuchen
        </Button>
        <Button variant="outline" onClick={onSwitch}>
          <Keyboard className="mr-2 h-4 w-4" aria-hidden />
          Lieber tippen
        </Button>
      </div>
    )
  }
  return (
    <Button
      onClick={onStart}
      className="h-14 w-14 rounded-full bg-claimondo-ondo p-0 hover:bg-claimondo-shield"
      aria-label="Aufnahme starten"
    >
      <Mic className="h-6 w-6 text-white" />
    </Button>
  )
}

function UnsupportedFallback({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
      <p className="font-medium">Ihr Browser unterstützt keine Sprachaufnahme.</p>
      <p className="mt-2">
        Kein Problem — Sie können den Hergang stattdessen tippen.
      </p>
      <Button onClick={onSwitch} className="mt-4">
        <Keyboard className="mr-2 h-4 w-4" aria-hidden />
        Zum Tippen-Modus
      </Button>
    </div>
  )
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
