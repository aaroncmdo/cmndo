'use client'

// Wizard-Schritt 3: Schaden (Pflicht — eine von drei Quellen). Fotos (Vision-KI) · Beschreibung
// (Text-KI) · manuelle Gewerke-Auswahl. Jede Quelle setzt den Reparaturbedarf → Live-Re-Rank.
import { useRef, useState } from 'react'
import { Button } from '@/components/primitives'
import { GEWERKE, type Gewerk, type Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import type { EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import { klassifiziereSchadenfotoEmbed, klassifiziereSchadenbeschreibungEmbed } from '../actions'
import { manuelleGewerkeZuBedarf } from './wizard-logic'

const MAX_FOTOS = 3
const GEWERK_LABEL: Record<Gewerk, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart Repair',
}

type Props = {
  bedarf: Reparaturbedarf | null
  onBedarf: (b: Reparaturbedarf | null) => void
}

export function SchadenStep({ bedarf, onBedarf }: Props) {
  const [beschreibung, setBeschreibung] = useState('')
  const [fotoLaeuft, setFotoLaeuft] = useState(false)
  const [textLaeuft, setTextLaeuft] = useState(false)
  const [fotoAnzahl, setFotoAnzahl] = useState(0)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const manuell = new Set<Gewerk>(bedarf?.quelle === 'manuell' ? bedarf.kategorien : [])

  async function onFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS)
    if (dateien.length === 0) return
    const fotos = await Promise.all(
      dateien.map(
        (datei) =>
          new Promise<EmbedFoto>((resolve) => {
            const reader = new FileReader()
            reader.onerror = () => resolve({ media_type: '', data: '' })
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              if (!dataUrl?.includes(',')) return resolve({ media_type: '', data: '' })
              const [header, data] = dataUrl.split(',')
              resolve({ media_type: header.replace('data:', '').replace(';base64', ''), data })
            }
            reader.readAsDataURL(datei)
          }),
      ),
    )
    setFotoAnzahl(fotos.length)
    setFotoLaeuft(true)
    try {
      const b = await klassifiziereSchadenfotoEmbed(fotos)
      onBedarf(b)
    } finally {
      setFotoLaeuft(false)
    }
  }

  async function analysiereText() {
    if (!beschreibung.trim()) return
    setTextLaeuft(true)
    try {
      onBedarf(await klassifiziereSchadenbeschreibungEmbed(beschreibung))
    } finally {
      setTextLaeuft(false)
    }
  }

  function toggleGewerk(g: Gewerk) {
    const next = new Set(manuell)
    if (next.has(g)) next.delete(g)
    else next.add(g)
    const b = manuelleGewerkeZuBedarf(Array.from(next))
    onBedarf(b.kategorien.length ? b : null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Was ist beschädigt?</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Fotos, kurze Beschreibung oder direkt die Bereiche wählen — eines genügt.
        </p>
      </div>

      {/* Fotos */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-1 text-body-sm font-semibold text-claimondo-navy">Schadenfotos</p>
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="hidden"
          onChange={onFotos}
        />
        <Button type="button" variant="ghost" onClick={() => fotoInputRef.current?.click()} loading={fotoLaeuft}>
          {fotoAnzahl > 0 ? `${fotoAnzahl} Foto${fotoAnzahl > 1 ? 's' : ''} ausgewählt` : 'Fotos auswählen'}
        </Button>
      </div>

      {/* Beschreibung */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-1 text-body-sm font-semibold text-claimondo-navy">Kurze Beschreibung</p>
        <textarea
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          onBlur={analysiereText}
          rows={2}
          placeholder="z. B. Stoßstange eingedrückt, Kratzer im Lack"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
        <Button type="button" variant="ghost" onClick={analysiereText} loading={textLaeuft} disabled={!beschreibung.trim()}>
          Beschreibung analysieren
        </Button>
      </div>

      {/* Manuelle Gewerke */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="mb-2 text-body-sm font-semibold text-claimondo-navy">Oder Bereiche direkt wählen</p>
        <div className="flex flex-wrap gap-2">
          {GEWERKE.map((g) => {
            const aktiv = manuell.has(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGewerk(g)}
                className={`rounded-ios-md border px-3 py-1.5 text-body-sm font-semibold transition-colors ${
                  aktiv ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
                }`}
              >
                {GEWERK_LABEL[g]}
              </button>
            )
          })}
        </div>
      </div>

      {bedarf && bedarf.kategorien.length > 0 && (
        <p className="text-[0.8125rem] text-success-strong">
          Erkannt: {bedarf.kategorien.map((k) => GEWERK_LABEL[k]).join(', ')}
        </p>
      )}
    </div>
  )
}
