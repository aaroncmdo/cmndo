'use client'

// Sub-Projekt 1 (Kunde-Portal 1+): schlankes In-Portal-Schadenmeldeformular.
// Ruft die Server-Action meldeNeuenSchaden (createLead -> convertLeadToFall).
// Policy-konform: shared/forms (TextField/SelectField), shared/SectionCard,
// primitives/Button, rounded-ios-* — keine handgerollten Cards/Buttons.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { TextField } from '@/components/shared/forms/TextField'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { DatumFeld } from '@/components/shared/forms/DatumFeld'
import { SelectField, type SelectFieldOption } from '@/components/shared/forms/SelectField'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button'
import { meldeNeuenSchaden } from './actions'
import type { SchadenMeldenForm } from '@/lib/kunde/schaden-melden'

const SCHADENSART_OPTIONS: SelectFieldOption[] = [
  { value: 'haftpflicht', label: 'Unverschuldet — der Gegner haftet' },
  { value: 'vollkasko', label: 'Über meine Vollkasko' },
  { value: 'teilkasko', label: 'Über meine Teilkasko' },
  { value: 'eigenverschulden', label: 'Selbstverschuldet' },
  { value: 'unbekannt', label: 'Weiß ich noch nicht' },
]

const TEXTAREA_CLS =
  'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30'

export default function SchadenMeldenWizard() {
  const router = useRouter()
  const [f, setF] = useState<SchadenMeldenForm>({
    kennzeichen: '',
    fahrzeugHersteller: '',
    fahrzeugModell: '',
    unfalldatum: '',
    unfallUhrzeit: '',
    unfallhergang: '',
    unfallort: '',
    unfallortLat: null,
    unfallortLng: null,
    schadenPlz: '',
    schadensart: 'unbekannt',
    gegnerBekannt: false,
    istFahrzeughalter: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof SchadenMeldenForm>(k: K, v: SchadenMeldenForm[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await meldeNeuenSchaden(f)
    if (res.ok) {
      router.push(`/kunde/faelle/${res.fallId}`)
      return
    }
    setError(res.error)
    setSubmitting(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <SectionCard title="Fahrzeug" subtitle="Welches Fahrzeug ist betroffen?">
        <div className="space-y-4">
          <TextField
            label="Kennzeichen"
            value={f.kennzeichen ?? ''}
            onChange={(e) => set('kennzeichen', e.target.value)}
            placeholder="z. B. K-AB 123"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Hersteller (optional)"
              value={f.fahrzeugHersteller ?? ''}
              onChange={(e) => set('fahrzeugHersteller', e.target.value)}
              placeholder="z. B. VW"
            />
            <TextField
              label="Modell (optional)"
              value={f.fahrzeugModell ?? ''}
              onChange={(e) => set('fahrzeugModell', e.target.value)}
              placeholder="z. B. Golf"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Unfall / Schaden" subtitle="Wann und wo ist es passiert?">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Ops-Test #13: war `type="date"` — das rendert im Browser-Locale, ein
                deutscher Nutzer mit englischem System sah MM/DD/YYYY. DatumFeld zeigt
                immer TT.MM.JJJJ und meldet weiterhin ISO zurück. */}
            <DatumFeld
              label="Datum"
              valueIso={f.unfalldatum}
              onChangeIso={(iso) => set('unfalldatum', iso)}
            />
            {/* Weg-6-Audit Punkt C: `unfallUhrzeit` war im Formular-Typ vorhanden und
                wurde nach `unfall_uhrzeit` gemappt — nur das Eingabefeld fehlte, also
                blieb claims.schadenzeit immer NULL. Der Flow erhebt die Uhrzeit
                (feststellung-steps.ts). Für ein Gutachten zählt sie: Lichtverhältnisse,
                Verkehrslage, Plausibilität des Hergangs.
                Hier bewusst `type="time"` statt eines Pendants zu DatumFeld: ein
                englisches Systemlocale zeigt zwar „2:30 PM" statt „14:30", der Wert
                bleibt aber HH:MM (24h) und ist EINDEUTIG. Beim Datum war das anders —
                03/04 ist echt zweideutig, deshalb brauchte es dort ein eigenes Feld. */}
            <TextField
              label="Uhrzeit (optional)"
              type="time"
              value={f.unfallUhrzeit ?? ''}
              onChange={(e) => set('unfallUhrzeit', e.target.value)}
            />
          </div>
          {/* Ops-Test #14: war ein reines Textfeld. Dieser Einstieg erzeugte damit Leads
              OHNE jeden Geo-Anker (prod: 3 von 3 kunde_portal-Leads ohne Koordinaten) —
              findBestSV braucht fallLat/fallLng und fand so keinen Gutachter.
              Die Places-Auswahl liefert Koordinaten UND PLZ direkt mit; ein serverseitiges
              Nach-Geocoding wie im Flow ist hier deshalb nicht nötig.
              Freitext bleibt erlaubt (Feldweg, Kreuzung) — dann ohne Koordinaten. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="unfallort" className="text-xs font-semibold text-claimondo-shield">
              Ort / Adresse (optional)
            </label>
            <GooglePlaceAutocomplete
              defaultValue={f.unfallort ?? ''}
              placeholder="z. B. Aachener Straße 12, Köln"
              onChange={(v) => {
                // Freitext: Adresse übernehmen, aber die Koordinaten der vorherigen
                // Auswahl verwerfen — sie gehören zu einem anderen Ort.
                setF((prev) => ({ ...prev, unfallort: v, unfallortLat: null, unfallortLng: null }))
              }}
              onSelect={(r) => {
                setF((prev) => ({
                  ...prev,
                  unfallort: r.adresse,
                  unfallortLat: r.lat,
                  unfallortLng: r.lng,
                  // PLZ ist Pflicht und steckt in der Auswahl — der Kunde soll sie nicht
                  // abtippen müssen. Nur füllen, wenn Google eine liefert.
                  schadenPlz: r.plz || prev.schadenPlz,
                }))
              }}
            />
          </div>
          {/* PLZ steht bewusst UNTER dem Ort: die Places-Auswahl füllt sie automatisch —
              ein Feld, das sich weiter oben von selbst ändert, wirkt wie ein Fehler. */}
          <TextField
            label="PLZ des Schadenorts"
            value={f.schadenPlz ?? ''}
            onChange={(e) => set('schadenPlz', e.target.value)}
            placeholder="50667"
            inputMode="numeric"
            maxLength={5}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hergang" className="text-xs font-semibold text-claimondo-shield">
              Was ist passiert?
            </label>
            <textarea
              id="hergang"
              value={f.unfallhergang ?? ''}
              onChange={(e) => set('unfallhergang', e.target.value)}
              rows={3}
              placeholder="Kurz in eigenen Worten — das hilft uns bei der Einordnung."
              className={TEXTAREA_CLS}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Haftung" subtitle="Wer hat den Schaden verursacht?">
        <div className="space-y-4">
          <SelectField
            label="Wie ist der Schaden entstanden?"
            value={f.schadensart ?? 'unbekannt'}
            onChange={(e) => set('schadensart', e.target.value)}
            options={SCHADENSART_OPTIONS}
          />
          <label className="flex items-center gap-2.5 text-sm text-claimondo-navy">
            <input
              type="checkbox"
              checked={!!f.gegnerBekannt}
              onChange={(e) => set('gegnerBekannt', e.target.checked)}
              className="h-4 w-4 rounded-ios-sm border-claimondo-border accent-claimondo-ondo"
            />
            Es gibt einen Unfallgegner
          </label>
          <label className="flex items-center gap-2.5 text-sm text-claimondo-navy">
            <input
              type="checkbox"
              checked={f.istFahrzeughalter !== false}
              onChange={(e) => set('istFahrzeughalter', e.target.checked)}
              className="h-4 w-4 rounded-ios-sm border-claimondo-border accent-claimondo-ondo"
            />
            Ich bin Halter des Fahrzeugs
          </label>
        </div>
      </SectionCard>

      {error ? <p className="text-sm text-danger-strong">{error}</p> : null}

      <Button type="submit" variant="navy" fullWidth loading={submitting}>
        Schaden melden
      </Button>
    </form>
  )
}
