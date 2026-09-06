'use client'

// Die ZWEI VERSCHIEDENEN Orte (Aaron 14.07.):
//   'fahrzeug'     -> wo steht das Auto?    -> Geo-Anker fuer den WERKSTATT-Finder
//   'besichtigung' -> wo besichtigt der SV? -> Geo-Anker fuer den GUTACHTER-Finder
//
// Sie koennen identisch sein (der SV kommt zum Auto), muessen es aber nicht (das Auto steht laengst in
// einer Werkstatt, oder noch am Unfallort). Der Step erscheint NUR, wenn der jeweilige Ort in der DB
// noch unbekannt ist — die Bedingung dafuer steht in flow_szenario_steps, nicht im Code.

import { useState } from 'react'
import { Button } from '@/components/primitives'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { speichereOrtFlow } from './self-service-actions'

const TEXTE = {
  fahrzeug: {
    titel: 'Wo steht Ihr Fahrzeug?',
    hilfe: 'Damit wir Ihnen eine passende Werkstatt in Ihrer Nähe vorschlagen können.',
    platzhalter: 'Adresse, an der das Auto steht',
  },
  besichtigung: {
    titel: 'Wo soll der Gutachter besichtigen?',
    hilfe: 'Der Sachverständige kommt zu diesem Ort — dort schaut er sich den Schaden an.',
    platzhalter: 'Adresse für die Besichtigung',
  },
} as const

export function FlowOrtStep({
  token,
  art,
  onWeiter,
  initialAdresse,
}: {
  token: string
  art: 'fahrzeug' | 'besichtigung'
  onWeiter: () => void
  /**
   * Vorbefuellung (Spec 2026-07-21): der abgeleitete *_effektiv-Wert (i.d.R. der Unfallort bzw. der
   * andere bereits erfasste Ort). Der Kunde bestaetigt oder korrigiert — statt ein leeres Feld zu sehen.
   * Ohne Google-Place-Auswahl wird der Freitext serverseitig geocodet (speichereOrtFlow).
   */
  initialAdresse?: string | null
}) {
  const [place, setPlace] = useState<PlaceResult | null>(null)
  const [freitext, setFreitext] = useState(initialAdresse ?? '')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const texte = TEXTE[art]

  async function speichern() {
    // Freitext ist erlaubt (der Server geocodet nach) — ohne Adresse geht aber nichts.
    const adresse = (place?.adresse ?? freitext).trim()
    if (!adresse) {
      setFehler('Bitte gib eine Adresse an.')
      return
    }
    setSendet(true)
    setFehler(null)

    const r = await speichereOrtFlow(token, art, {
      adresse,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      placeId: place?.place_id ?? null,
      plz: place?.plz ?? null,
    })

    setSendet(false)
    if (!r.ok) {
      setFehler(r.error ?? 'Der Ort konnte nicht gespeichert werden.')
      return
    }
    onWeiter()
  }

  return (
    <div className="py-4">
      <h2 className="text-heading-md font-semibold text-claimondo-navy mb-2">{texte.titel}</h2>
      <p className="text-body-sm text-claimondo-ondo mb-6 leading-relaxed">{texte.hilfe}</p>

      <GooglePlaceAutocomplete
        placeholder={texte.platzhalter}
        defaultValue={initialAdresse ?? undefined}
        onSelect={(p) => {
          setPlace(p)
          setFreitext(p.adresse)
        }}
        onChange={(v) => {
          // Tippt der Kunde weiter, ist die frühere Auswahl nicht mehr gültig -> Koordinaten verwerfen,
          // der Server geocodet dann aus dem Freitext.
          setFreitext(v)
          setPlace(null)
        }}
        scrollIntoViewOnFocus
      />

      {fehler && <p className="text-body-sm text-danger-strong mt-3">{fehler}</p>}

      <Button onClick={speichern} loading={sendet} className="w-full mt-6">
        Weiter
      </Button>
    </div>
  )
}
