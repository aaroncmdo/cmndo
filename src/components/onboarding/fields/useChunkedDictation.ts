'use client'

// Gechunktes Sprachdiktat (rolling re-transcribe) fuer das Unfallhergang-Feld.
// MediaRecorder nimmt durchgehend auf (1s-Timeslice); alle ~2,5s wird das BISHER
// aufgenommene Gesamt-Audio (gueltiges webm-Praefix -> kein Wortverlust an
// Chunk-Grenzen) an den Transkriptions-Endpoint geschickt -> Live-Vorschau waechst
// mit. Beim Stopp liefert transcribeSnapshot(final) den maßgeblichen verbatim Text.
//
// Zwei Quellen (source):
//  - flow: token-authed /api/flow/voice-transcribe (anonymer FlowLink).
//  - auth: session-authed /api/support/voice-transcribe (eingeloggter Kunde, z.B.
//    Kunde-Onboarding — der Endpoint erlaubt Rolle 'kunde' bereits).
//
// Trade-off (bewusst, Aaron 07.07.): rolling re-transcribe laedt das wachsende Audio
// wiederholt hoch. Fuer typische Diktate (30-120s, Groq turbo billig/schnell)
// unkritisch; der 2-min-Auto-Stop begrenzt die Obergrenze.
//
// TAKT 7s -> 2,5s (Aaron 16.08., Ops-Test-Befund #5 „Spracheingabe nicht Wort-fuer-Wort"):
// Bei 7s sah man beim fluessigen Sprechen erst nach 7 Sekunden etwas — und wer kuerzer als
// 7s sprach, sah VOR dem Stopp nie eine Vorschau. Das las sich wie Batch, obwohl die
// Live-Vorschau laengst existierte; der Sanierungsplan hat daraus faelschlich einen
// Beschaffungsbedarf (Streaming-STT + AVV) abgeleitet. Es war die Taktung, nicht der Anbieter.
//
// Warum der kuerzere Takt NICHT durchdreht: `inFlightRef` ueberspringt einen Tick, solange
// noch ein Call laeuft. Waechst das Audio, dauert ein Durchgang laenger und das effektive
// Intervall dehnt sich von selbst — das Verfahren reguliert sich, statt Calls zu stapeln.
//
// ⚠ Beobachtungspunkt: Whisper neigt bei SEHR kurzem Audio zu Halluzinationen. Der erste
// Tick sieht jetzt nur ~2,5s Audio (vorher 7s). `language: 'de'` ist gesetzt, was das Risiko
// deutlich senkt (die klassischen Faelle entstehen bei Sprach-Autodetect) — und ein
// verunglueckter Zwischenstand wird vom finalen Durchgang ueberschrieben. Beim Abnehmen
// trotzdem darauf achten, ob am Anfang Unsinn aufblitzt.

import { useCallback, useEffect, useRef, useState } from 'react'

const AUTO_STOP_MS = 120_000 // 2 min Safety (ausfuehrliches Diktat erlaubt)
const REFRESH_MS = 2_500

export type DictationSource =
  | { kind: 'flow'; token: string }
  | { kind: 'schaden'; token: string }
  | { kind: 'auth' }

export function useChunkedDictation(source: DictationSource) {
  const endpoint =
    source.kind === 'flow'
      ? '/api/flow/voice-transcribe'
      : source.kind === 'schaden'
        ? '/api/schaden/voice-transcribe'
        : '/api/support/voice-transcribe'
  // Token-Gate fuer die anonymen Link-Quellen (flow: flow_links, schaden: Schadenkarte).
  const linkToken = source.kind === 'flow' || source.kind === 'schaden' ? source.token : null

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsSupported(
      typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    )
  }, [])

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    clearTimers()
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
  }, [clearTimers])

  useEffect(() => () => cleanup(), [cleanup])

  const transcribeSnapshot = useCallback(
    async (isFinal: boolean): Promise<string | null> => {
      const mimeType = recorderRef.current?.mimeType || 'audio/webm'
      const blob = new Blob([...chunksRef.current], { type: mimeType })
      if (blob.size === 0) return null
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      if (linkToken) fd.append('token', linkToken)
      fd.append('language', 'de')
      try {
        const res = await fetch(endpoint, { method: 'POST', body: fd })
        const data = (await res.json().catch(() => ({}))) as {
          transcript?: string
          error?: string
        }
        if (!res.ok) {
          if (isFinal) setError(data.error ?? 'Transkription fehlgeschlagen.')
          return null
        }
        return (data.transcript ?? '').trim() || null
      } catch {
        if (isFinal) setError('Transkription fehlgeschlagen.')
        return null
      }
    },
    [endpoint, linkToken],
  )

  // stop VOR start definiert (start referenziert stop im Auto-Stop-Timer).
  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current
    clearTimers()
    if (!recorder || recorder.state === 'inactive') return null
    return new Promise<string | null>((resolve) => {
      recorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)
        // auf einen evtl. laufenden Rolling-Call warten, damit chunksRef stabil ist
        while (inFlightRef.current) await new Promise((r) => setTimeout(r, 100))
        const finalText = await transcribeSnapshot(true)
        if (finalText) setLiveTranscript(finalText)
        setIsTranscribing(false)
        cleanup()
        recorderRef.current = null
        resolve(finalText)
      }
      try {
        recorder.stop()
      } catch {
        setIsRecording(false)
        setIsTranscribing(false)
        resolve(null)
      }
    })
  }, [clearTimers, cleanup, transcribeSnapshot])

  const start = useCallback(async () => {
    if (!isSupported) return
    setError(null)
    setLiveTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(1000) // 1s-Timeslice -> ondataavailable akkumuliert fortlaufend
      recorderRef.current = recorder
      setIsRecording(true)

      intervalRef.current = setInterval(async () => {
        if (inFlightRef.current) return // keine ueberlappenden Transkriptionen
        inFlightRef.current = true
        const t = await transcribeSnapshot(false)
        inFlightRef.current = false
        if (t) setLiveTranscript(t)
      }, REFRESH_MS)

      autoStopRef.current = setTimeout(() => {
        void stop()
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
  }, [isSupported, transcribeSnapshot, stop])

  const clearError = useCallback(() => setError(null), [])

  return {
    isRecording,
    isTranscribing,
    liveTranscript,
    error,
    isSupported,
    start,
    stop,
    clearError,
  }
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return null
}
