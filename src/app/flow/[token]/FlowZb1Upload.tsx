'use client'

// AAR-956 §4 / Part 2: ZB1-Foto-Upload im FlowLink. Foto → uploadZb1Flow (OCR, H6-Regel)
// → füllt Fahrzeug-/Halter-Felder automatisch. Optional (überspringbar). Serverseitig
// reuse von runZB1Ocr (keine neue OCR-Quelle). Bewusst leichtgewichtig + Flow-eigen
// (das geteilte Zb1UploadField hängt an dokument_upload_anfragen-Token + fallId).

import { useRef, useState } from 'react'
import { uploadZb1Flow } from './self-service-actions'

// Lokal gespiegelt — 'use server'-Files (self-service-actions) dürfen keine Types
// exportieren (AAR-664). Shape == uploadZb1Flow-Rückgabe.extracted.
type Zb1FlowExtracted = {
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  halter_name: string | null
}

export function FlowZb1Upload({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'laden' | 'fertig' | 'fehler' | 'skip'>('idle')
  const [extracted, setExtracted] = useState<Zb1FlowExtracted | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('laden')
    setFehler(null)
    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('fehler')
      setFehler('Foto konnte nicht gelesen werden.')
      return
    }
    const r = await uploadZb1Flow(token, base64, file.type || 'image/jpeg')
    if (!r.ok) {
      setStatus('fehler')
      setFehler(r.error ?? 'Auslesen fehlgeschlagen.')
      return
    }
    setExtracted(r.extracted ?? null)
    setStatus('fertig')
  }

  if (status === 'skip') return null

  return (
    <div
      className="rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.04] p-4 mb-5"
      data-testid="flow-zb1-upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <p className="text-sm font-semibold text-claimondo-navy mb-1">Fahrzeugschein-Foto</p>
      <p className="text-xs text-claimondo-ondo mb-3">
        Foto hochladen — wir lesen Kennzeichen, Fahrzeug &amp; Halter automatisch aus. Optional.
      </p>

      {status === 'fertig' && extracted ? (
        <div
          className="rounded-ios-sm bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800"
          data-testid="flow-zb1-fertig"
        >
          <p className="font-medium mb-1">Ausgelesen ✓</p>
          <p className="text-emerald-700">
            {[
              extracted.kennzeichen,
              [extracted.fahrzeug_hersteller, extracted.fahrzeug_modell].filter(Boolean).join(' '),
              extracted.halter_name,
            ]
              .filter(Boolean)
              .join(' · ') || 'Daten übernommen.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle')
              setExtracted(null)
              inputRef.current?.click()
            }}
            className="mt-2 text-xs font-medium text-claimondo-ondo"
          >
            Neu fotografieren
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={status === 'laden'}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white text-sm font-semibold px-4 py-2.5 transition-colors disabled:opacity-50"
          >
            {status === 'laden' ? 'Wird ausgelesen …' : 'Foto aufnehmen'}
          </button>
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
