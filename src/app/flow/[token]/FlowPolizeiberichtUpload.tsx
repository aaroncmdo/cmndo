'use client'

// AAR-956 Gebiet-3 (Funnel): Polizeibericht-Upload im FlowLink — erscheint nur, wenn der Kunde
// "Polizei vor Ort" = Ja angab (conditional via FlowFeststellungStep). Foto ODER PDF, KEIN OCR,
// ueberspringbar. Flow-eigen (flow_links-Token), gespiegelt an FlowZb1Upload (ohne OCR/Korrektur).

import { useRef, useState } from 'react'
import { uploadPolizeiberichtFlow } from './self-service-actions'
import { Button } from '@/components/primitives/Button/Button.web'

export function FlowPolizeiberichtUpload({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'laden' | 'bestaetigt' | 'fehler' | 'skip'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('laden')
    setFehler(null)
    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('fehler')
      setFehler('Datei konnte nicht gelesen werden.')
      return
    }
    const r = await uploadPolizeiberichtFlow(token, base64, file.type || 'image/jpeg')
    if (!r.ok) {
      setStatus('fehler')
      setFehler(r.error ?? 'Upload fehlgeschlagen.')
      return
    }
    setStatus('bestaetigt')
  }

  if (status === 'skip') return null

  return (
    <div
      className="rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.04] p-4 mb-5"
      data-testid="flow-polizeibericht-upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <p className="text-sm font-semibold text-claimondo-navy mb-1">Polizeibericht</p>
      <p className="text-xs text-claimondo-ondo mb-3">
        Sie gaben an, die Polizei war vor Ort. Laden Sie den Bericht hoch (Foto oder PDF) — optional,
        Sie können ihn auch später nachreichen.
      </p>

      {status === 'bestaetigt' ? (
        <div
          className="rounded-ios-sm bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800"
          data-testid="flow-polizeibericht-bestaetigt"
        >
          <p className="font-medium">Polizeibericht hochgeladen ✓</p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            variant="ondo"
            size="sm"
            loading={status === 'laden'}
            onClick={() => inputRef.current?.click()}
          >
            {status === 'laden' ? 'Wird hochgeladen …' : 'Bericht hochladen'}
          </Button>
          <button
            type="button"
            onClick={() => setStatus('skip')}
            className="text-sm text-claimondo-ondo/80 underline"
          >
            Überspringen
          </button>
        </div>
      )}
      {fehler && <p className="mt-2 text-sm text-red-500">{fehler}</p>}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string | null> {
  try {
    const reader = new FileReader()
    return await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const idx = result.indexOf(',')
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  } catch {
    return null
  }
}
