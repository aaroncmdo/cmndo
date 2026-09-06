'use client'

// Sprachdiktat-Button + Live-Vorschau fuer das Unfallhergang-Feld (FlowLink
// Feststellung). Nutzt useChunkedDictation (gechunktes Groq-Whisper): waehrend
// des Sprechens waechst die Live-Vorschau haeppchenweise; beim Stopp landet der
// verbatim Text via onFinalTranscript in der editierbaren Textarea.

import { Mic, Square, Loader2 } from 'lucide-react'
import { useChunkedDictation, type DictationSource } from './useChunkedDictation'

export function VoiceDictation({
  source,
  onFinalTranscript,
  disabled,
}: {
  source: DictationSource
  onFinalTranscript: (text: string) => void
  disabled?: boolean
}) {
  const { isRecording, isTranscribing, liveTranscript, error, isSupported, start, stop } =
    useChunkedDictation(source)

  // Kein MediaRecorder im Browser -> gar kein Button, nur die Textarea bleibt.
  if (!isSupported) return null

  async function handleClick() {
    if (isRecording) {
      const text = await stop()
      if (text) onFinalTranscript(text)
    } else {
      await start()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isTranscribing || disabled}
        aria-pressed={isRecording}
        className={`inline-flex w-fit items-center gap-2 rounded-ios-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${
          isRecording ? 'bg-danger' : 'bg-claimondo-navy'
        }`}
      >
        {isTranscribing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Transkribiere …
          </>
        ) : isRecording ? (
          <>
            <Square className="h-4 w-4" aria-hidden /> Aufnahme stoppen
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" aria-hidden /> Unfallhergang einsprechen
          </>
        )}
      </button>

      {isRecording && (
        <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/60 px-3 py-2 text-sm leading-relaxed text-claimondo-navy">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" /> Ich höre zu …
          </span>
          {liveTranscript ? (
            <span className="whitespace-pre-wrap">{liveTranscript}</span>
          ) : (
            <span className="text-claimondo-ondo">
              Sprich ganz normal — der Text erscheint hier nach und nach.
            </span>
          )}
        </div>
      )}

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      <p className="text-xs leading-relaxed text-claimondo-ondo">
        Die Sprachaufnahme wird nur zur Transkription verarbeitet und nicht gespeichert. Sie können den
        Text danach frei bearbeiten.
      </p>
    </div>
  )
}
