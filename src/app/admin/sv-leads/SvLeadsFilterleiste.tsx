'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import { filterUrl, type Bestand, type SvLeadFilter } from '@/lib/sv-leads/liste-filter'

/**
 * Suche, Bestandswahl, Sortierung und Status für die SV-Leads-Liste.
 *
 * ⚠ Der Filter lebt in der URL, nicht im Zustand dieser Komponente. Nur so
 * bleibt eine gefilterte Ansicht teilbar, über den Zurück-Knopf erreichbar und
 * nach einem Neuladen erhalten. Das Suchfeld hält den Text lokal, bis
 * abgeschickt wird — sonst löste jede getippte Taste eine Abfrage aus.
 */

const SORTIERUNGEN = [
  { value: 'aktualisiert', label: 'Zuletzt geändert' },
  { value: 'score', label: 'Größter Nachholbedarf' },
  { value: 'firma', label: 'Firma (A–Z)' },
  { value: 'ort', label: 'Ort (A–Z)' },
] as const

const STATUS = [
  { value: '', label: 'Alle Status' },
  { value: 'offen', label: 'Offen' },
  { value: 'beansprucht_pending', label: 'Beansprucht (ausstehend)' },
  { value: 'beansprucht', label: 'Beansprucht' },
  { value: 'konvertiert', label: 'Konvertiert' },
  { value: 'abgelehnt', label: 'Abgelehnt' },
] as const

export default function SvLeadsFilterleiste({
  filter,
  zaehlung,
  gesamt,
}: {
  filter: SvLeadFilter
  zaehlung: { gepflegt: number; entdeckt: number }
  /** Treffer des aktuellen Filters — nicht des Gesamtbestands. */
  gesamt: number
}) {
  const router = useRouter()
  const [suchtext, setSuchtext] = useState(filter.suche)

  const gehe = (aenderung: Partial<SvLeadFilter>) => router.push(filterUrl(filter, aenderung))

  const bestaende: Array<{ wert: Bestand; label: string; anzahl: number }> = [
    { wert: 'alle', label: 'Alle', anzahl: zaehlung.gepflegt + zaehlung.entdeckt },
    { wert: 'gepflegt', label: 'Gepflegt', anzahl: zaehlung.gepflegt },
    { wert: 'entdeckt', label: 'Entdeckt', anzahl: zaehlung.entdeckt },
  ]

  const gefiltert = Boolean(filter.suche || filter.status || filter.bestand !== 'alle')

  return (
    <div className="mb-4 rounded-ios-lg border border-claimondo-border bg-white p-4">
      {/*
        Die Zahlen stehen an den Umschaltern, nicht nur in der Kopfzeile.
        Ohne sie wüsste niemand, dass hinter „Entdeckt" tausende Betriebe
        liegen — und genau diese Unkenntnis war das Problem.
      */}
      <div className="mb-3 flex flex-wrap gap-2">
        {bestaende.map((b) => (
          <Button
            key={b.wert}
            variant={filter.bestand === b.wert ? 'navy' : 'ghost'}
            size="sm"
            onClick={() => gehe({ bestand: b.wert })}
          >
            {b.label} · {b.anzahl.toLocaleString('de-DE')}
          </Button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          gehe({ suche: suchtext })
        }}
      >
        <div className="min-w-[220px] flex-1">
          <TextField
            label="Suche"
            value={suchtext}
            onChange={(e) => setSuchtext(e.target.value)}
            placeholder="Firma, Name, Ort oder Postleitzahl"
          />
        </div>

        <div className="min-w-[190px]">
          <SelectField
            label="Sortierung"
            value={filter.sortierung}
            onChange={(e) => gehe({ sortierung: e.target.value as SvLeadFilter['sortierung'] })}
            options={SORTIERUNGEN}
          />
        </div>

        <div className="min-w-[170px]">
          <SelectField
            label="Status"
            value={filter.status ?? ''}
            onChange={(e) => gehe({ status: e.target.value || null })}
            options={STATUS}
          />
        </div>

        <div className="flex gap-2 pb-0.5">
          <Button type="submit" variant="navy" iconLeft={<SearchIcon className="h-4 w-4" />}>
            Suchen
          </Button>
          {gefiltert && (
            <Button
              variant="ghost"
              iconLeft={<XIcon className="h-4 w-4" />}
              onClick={() => {
                setSuchtext('')
                router.push('?')
              }}
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </form>

      {gefiltert && (
        <p className="mt-3 text-xs text-claimondo-ondo">
          {gesamt.toLocaleString('de-DE')} Treffer für den aktuellen Filter.
        </p>
      )}
    </div>
  )
}
