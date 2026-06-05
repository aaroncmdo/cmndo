'use client'

// AAR-956 §4 / Part 2: ZB1-Foto-Upload im FlowLink. Drei Wege:
//   1. Foto hochladen → uploadZb1Flow (OCR, H6 = nur leere Felder füllen)
//   2. ausgelesene Werte manuell prüfen/korrigieren → speichereZb1KorrekturFlow (überschreibt bewusst)
//   3. überspringen
// „nur Lücken": liegen die Fahrzeugdaten schon vor (bereitsErfasst), ist der Upload nur
// optional (ergänzt Fehlendes). Reuse runZB1Ocr serverseitig — keine neue OCR-Quelle.
// Flow-eigen, weil das geteilte Zb1UploadField an dokument_upload_anfragen-Token + fallId hängt.

import { useRef, useState } from 'react'
import { uploadZb1Flow, speichereZb1KorrekturFlow } from './self-service-actions'
import { Button } from '@/components/primitives/Button/Button.web'

type Zb1FlowExtracted = {
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  halter_name: string | null
}

export function FlowZb1Upload({ token, bereitsErfasst }: { token: string; bereitsErfasst?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'laden' | 'fertig' | 'bestaetigt' | 'fehler' | 'skip'>(
    'idle',
  )
  const [extracted, setExtracted] = useState<Zb1FlowExtracted | null>(null)
  const [edit, setEdit] = useState({ kennzeichen: '', fahrzeug_hersteller: '', fahrzeug_modell: '' })
  const [fehler, setFehler] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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
    const ex = r.extracted ?? {
      kennzeichen: null,
      fahrzeug_hersteller: null,
      fahrzeug_modell: null,
      halter_name: null,
    }
    setExtracted(ex)
    setEdit({
      kennzeichen: ex.kennzeichen ?? '',
      fahrzeug_hersteller: ex.fahrzeug_hersteller ?? '',
      fahrzeug_modell: ex.fahrzeug_modell ?? '',
    })
    setStatus('fertig')
  }

  async function handleUebernehmen() {
    setSaving(true)
    setFehler(null)
    const r = await speichereZb1KorrekturFlow(token, edit)
    setSaving(false)
    if (!r.ok) {
      setFehler(r.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    setStatus('bestaetigt')
  }

  function neuFotografieren() {
    setExtracted(null)
    setFehler(null)
    setStatus('idle')
    inputRef.current?.click()
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
        {bereitsErfasst
          ? 'Ihre Fahrzeugdaten liegen bereits vor — ein Foto ergänzt nur noch Fehlendes. Optional.'
          : 'Foto hochladen — wir lesen Kennzeichen, Fahrzeug & Halter automatisch aus. Optional.'}
      </p>

      {status === 'bestaetigt' ? (
        <div
          className="rounded-ios-sm bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800"
          data-testid="flow-zb1-bestaetigt"
        >
          <p className="font-medium">Fahrzeugdaten übernommen ✓</p>
        </div>
      ) : status === 'fertig' && extracted ? (
        <div
          className="rounded-ios-sm bg-emerald-50/60 border border-emerald-100 p-3"
          data-testid="flow-zb1-fertig"
        >
          <p className="text-sm font-medium text-emerald-800 mb-2">
            Ausgelesen — bitte prüfen &amp; ggf. korrigieren:
          </p>
          <div className="flex flex-col gap-2">
            <KorrField label="Kennzeichen" value={edit.kennzeichen} onChange={(v) => setEdit({ ...edit, kennzeichen: v })} />
            <KorrField label="Hersteller" value={edit.fahrzeug_hersteller} onChange={(v) => setEdit({ ...edit, fahrzeug_hersteller: v })} />
            <KorrField label="Modell" value={edit.fahrzeug_modell} onChange={(v) => setEdit({ ...edit, fahrzeug_modell: v })} />
            {extracted.halter_name && (
              <p className="text-xs text-claimondo-ondo">Halter: {extracted.halter_name}</p>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Button variant="ondo" size="sm" loading={saving} onClick={handleUebernehmen}>
              Übernehmen
            </Button>
            <button type="button" onClick={neuFotografieren} className="text-sm text-claimondo-ondo underline">
              Neu fotografieren
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            variant="ondo"
            size="sm"
            loading={status === 'laden'}
            onClick={() => inputRef.current?.click()}
          >
            {status === 'laden' ? 'Wird ausgelesen …' : 'Foto aufnehmen'}
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

function KorrField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-claimondo-ondo/70">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy"
      />
    </label>
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
