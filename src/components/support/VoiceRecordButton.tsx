'use client'

// AAR-520 (S3): Mikrofon-Button für den Support-Chat.
// Click toggelt Aufnahme/Stop. Nach Stop wird der Transkript-Text über
// onTranscript zurückgegeben — der Chat fügt ihn dann an den Textarea-Wert.

import { MicIcon, SquareIcon, Loader2Icon } from 'lucide-react'
import { useVoiceRecorder } from './useVoiceRecorder'

export function VoiceRecordButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void
  disabled?: boolean
}) {
  const { isRecording, isTranscribing, error, isSupported, start, stopAndTranscribe } =
    useVoiceRecorder()

  if (!isSupported) return null

  async function handleClick() {
    if (isTranscribing) return
    if (isRecording) {
      const t = await stopAndTranscribe()
      if (t) onTranscript(t)
    } else {
      await start()
    }
  }

  const label = isTranscribing
    ? 'Transkribiere…'
    : isRecording
      ? 'Stopp'
      : 'Aufnahme'

  const icon = isTranscribing ? (
    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
  ) : isRecording ? (
    <SquareIcon className="w-3.5 h-3.5 fill-white" />
  ) : (
    <MicIcon className="w-3.5 h-3.5" />
  )

  const className = isRecording
    ? 'text-sm font-medium px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 animate-pulse inline-flex items-center gap-1.5'
    : 'text-sm font-medium px-3 py-1.5 rounded-lg bg-claimondo-ondo/10 hover:bg-claimondo-ondo/20 text-claimondo-ondo inline-flex items-center gap-1.5 disabled:opacity-40'

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        className={className}
        aria-label={isRecording ? 'Aufnahme stoppen' : 'Aufnahme starten'}
      >
        {icon} {label}
      </button>
      {error && <p className="text-[10px] text-amber-700 max-w-[280px]">{error}</p>}
    </div>
  )
}
