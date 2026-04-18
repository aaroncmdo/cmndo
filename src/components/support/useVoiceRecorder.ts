'use client'

// AAR-520 (S3): MediaRecorder-Hook fuer den Support-Chat.
// 60s Safety-Auto-Stop, Stream wird nach Stop sauber geschlossen (kein Hot-Mic),
// Transkript via /api/support/voice-transcribe (Groq Whisper).
//
// Return:
//   isRecording       boolean
//   isTranscribing    boolean (nach Stop bis Transkript da ist)
//   error             string | null
//   isSupported       boolean  — MediaRecorder im Browser verfuegbar?
//   start             Aufnahme starten
//   stopAndTranscribe Stop + Transkription, gibt Transcript zurueck (oder null)

import { useCallback, useEffect, useRef, useState } from 'react'

const AUTO_STOP_MS = 60_000

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsSupported(
      typeof window.MediaRecorder !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia,
    )
  }, [])

  const cleanup = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    const stream = recorderRef.current?.stream
    stream?.getTracks().forEach((t) => t.stop())
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const start = useCallback(async () => {
    if (!isSupported) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
      autoStopTimerRef.current = setTimeout(() => {
        try {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        } catch {
          // ignore
        }
      }, AUTO_STOP_MS)
    } catch (e) {
      const err = e as DOMException
      if (err?.name === 'NotAllowedError') {
        setError('Mikrofon-Zugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.')
      } else if (err?.name === 'NotFoundError') {
        setError('Kein Mikrofon gefunden.')
      } else {
        setError('Mikrofon konnte nicht gestartet werden.')
      }
    }
  }, [isSupported])

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current
    if (!recorder) return null

    return new Promise<string | null>((resolve) => {
      recorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)
        try {
          const mimeType = recorder.mimeType || 'audio/webm'
          const audioBlob = new Blob(chunksRef.current, { type: mimeType })
          if (audioBlob.size === 0) {
            setError('Keine Aufnahme erkannt. Bitte erneut versuchen.')
            resolve(null)
            return
          }
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')
          formData.append('language', 'de')

          const res = await fetch('/api/support/voice-transcribe', {
            method: 'POST',
            body: formData,
          })
          const data = (await res.json().catch(() => ({}))) as {
            transcript?: string
            error?: string
          }
          if (!res.ok) {
            setError(data.error ?? 'Transkription fehlgeschlagen.')
            resolve(null)
            return
          }
          const transcript = (data.transcript ?? '').trim()
          if (!transcript) {
            setError('Keine Sprache erkannt.')
            resolve(null)
            return
          }
          resolve(transcript)
        } catch (e) {
          console.error('[AAR-520] Transkription fehlgeschlagen:', e)
          setError('Transkription fehlgeschlagen.')
          resolve(null)
        } finally {
          setIsTranscribing(false)
          cleanup()
          recorderRef.current = null
        }
      }
      try {
        recorder.stop()
      } catch {
        setIsRecording(false)
        setIsTranscribing(false)
        resolve(null)
      }
    })
  }, [cleanup])

  const clearError = useCallback(() => setError(null), [])

  return { isRecording, isTranscribing, error, isSupported, start, stopAndTranscribe, clearError }
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return null
}
