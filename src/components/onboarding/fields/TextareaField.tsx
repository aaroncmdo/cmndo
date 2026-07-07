'use client'

// AAR-956 15.06.: vereinheitlicht auf Flow-/Claimondo-Stil (s. TextField).

import type { OnboardingFeld } from '../types'
import { liquidFieldBase } from '@/lib/styles/liquid-field'
import { VoiceDictation } from './VoiceDictation'
import { appendTranscript } from './append-transcript'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  // Unfallhergang-Sprachdiktat (FlowLink): wenn gesetzt, erscheint der Diktat-Button
  // unter der Textarea. token = FlowLink-Token fuer /api/flow/voice-transcribe.
  voiceDictation?: { token: string }
}

export function TextareaField({ feld, value, onChange, disabled, voiceDictation }: Props) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      <textarea
        name={feld.feld_key}
        data-testid={`feld-${feld.feld_key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={feld.placeholder ?? ''}
        disabled={disabled}
        required={feld.pflicht}
        rows={4}
        className={`min-h-[110px] w-full resize-y rounded-ios-md px-4 py-3 text-base leading-relaxed ${liquidFieldBase}`}
      />
      {voiceDictation && (
        <VoiceDictation
          token={voiceDictation.token}
          disabled={disabled}
          onFinalTranscript={(t) => onChange(appendTranscript(value, t))}
        />
      )}
    </div>
  )
}
