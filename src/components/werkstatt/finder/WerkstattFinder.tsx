'use client'

// Werkstatt-Finder — rangierte Distanz-Liste von Partner-Werkstaetten zu einem
// Schadenort. Bewusst simpel (kein Wizard, keine Karte): pro Werkstatt eine
// Card mit Name/Adresse/Distanz/Telefon + "Auswaehlen"-Button.

import { Card, Button } from '@/components/primitives'
import EmptyState from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { Fit } from '@/lib/werkstatt/bedarf/types'

type Props = {
  werkstaetten: (WerkstattFinderRow & { fit?: Fit })[]
  onSelect: (id: string) => void
  selectedId?: string | null
  loading?: boolean
  keineSpezialisierte?: boolean
}

function adresseZeile(w: WerkstattFinderRow): string {
  const plzOrt = [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')
  return [w.adresse_strasse, plzOrt].filter(Boolean).join(', ')
}

function distanzLabel(distanz_km: number): string | null {
  if (!Number.isFinite(distanz_km)) return null
  return `${distanz_km.toFixed(1)} km entfernt`
}

export function WerkstattFinder({ werkstaetten, onSelect, selectedId, loading, keineSpezialisierte }: Props) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-ios-md bg-claimondo-bg animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (werkstaetten.length === 0) {
    return (
      <EmptyState
        title="Keine Partner-Werkstatt in der Nähe gefunden"
        description="Für diesen Schadenort ist aktuell keine aktive Partner-Werkstatt verfügbar."
      />
    )
  }

  // "Passt zu deinem Schaden"-Badge nur zeigen, wenn die Liste unterscheidet
  // (einige passen, andere nicht) — sonst ist der Badge auf allen sinnlos
  // (passt=true ist Default bei fehlender Schadenskategorie / Vollservice).
  const zeigeBadge = werkstaetten.some((w) => w.passt) && werkstaetten.some((w) => !w.passt)

  return (
    <>
      {keineSpezialisierte && (
        <div className="mb-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
          Keine spezialisierte Werkstatt in der Nähe — hier die nächsten.
        </div>
      )}
      <ul className="space-y-3">
        {werkstaetten.map((w) => {
          const isSelected = selectedId === w.id
          const adresse = adresseZeile(w)
          const distanz = distanzLabel(w.distanz_km)
          // Fit-Chip: wenn fit vorhanden (claim-Kontext) → 3-Zustand; sonst altes passt-Heuristik.
          const fitChip: React.ReactNode =
            w.fit != null ? (
              w.fit === 'passt' ? (
                <div className="mt-1">
                  <StatusBadge tone="success" size="xs">
                    Passt zu deinem Schaden
                  </StatusBadge>
                </div>
              ) : w.fit === 'unbekannt' ? (
                <div className="mt-1">
                  <StatusBadge tone="neutral" size="xs">
                    Leistungen auf Anfrage
                  </StatusBadge>
                </div>
              ) : (
                <div className="mt-1">
                  <StatusBadge tone="warning" size="xs">
                    Bietet diese Arbeit nicht an
                  </StatusBadge>
                </div>
              )
            ) : zeigeBadge && w.passt ? (
              <div className="mt-1">
                <StatusBadge tone="success" size="xs">
                  Passt zu deinem Schaden
                </StatusBadge>
              </div>
            ) : null
          return (
            <li key={w.id}>
              <Card
                className={
                  isSelected
                    ? 'ring-2 ring-claimondo-navy'
                    : undefined
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-claimondo-navy truncate">
                      {w.name}
                    </p>
                    {fitChip}
                    {adresse ? (
                      <p className="mt-0.5 text-sm text-claimondo-ondo truncate">
                        {adresse}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-claimondo-ondo">
                      {distanz ? <span>{distanz}</span> : null}
                      {w.telefon ? <span>{w.telefon}</span> : null}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Button
                      variant={isSelected ? 'navy' : 'ghost'}
                      size="sm"
                      onClick={() => onSelect(w.id)}
                    >
                      {isSelected ? 'Ausgewählt' : 'Auswählen'}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </>
  )
}
