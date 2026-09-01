'use client'

// Werkstatt-Finder — rangierte Distanz-Liste von Partner-Werkstaetten zu einem
// Schadenort. Bewusst simpel (kein Wizard, keine Karte): pro Werkstatt eine
// Card mit Name/Adresse/Distanz/Telefon + "Auswaehlen"-Button.

import { useEffect, useRef } from 'react'
import { Card, Button } from '@/components/primitives'
import EmptyState from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { Fit } from '@/lib/werkstatt/bedarf/types'
import { istBelastbareBewertung, type MatchGrund, type MatchGrundTyp } from '@/lib/werkstatt/matching/rank-vorschlaege'

type Props = {
  // Spec B (Aaron 14.07.): `gruende` kommt aus der Matching-Engine — "mit wirklichem Grund warum das
  // passt". Optional, damit die aelteren Consumer (Dispatch/Embed) unveraendert weiterlaufen; ohne
  // Gruende faellt die Card auf den bisherigen fit-Chip zurueck.
  werkstaetten: (WerkstattFinderRow & {
    fit?: Fit
    gruende?: MatchGrund[]
    google_rating?: number | null
    google_review_count?: number | null
  })[]
  onSelect: (id: string) => void
  selectedId?: string | null
  /** Mehrfach-Auswahl (SV-Empfehlung 1-3): wenn gesetzt, gewinnt es ueber selectedId. */
  selectedIds?: string[]
  loading?: boolean
  keineSpezialisierte?: boolean
  /** Embed: bei Auswahl (z.B. Map-Pin-Klick) die selektierte Card in den sichtbaren Bereich scrollen. */
  scrollToSelected?: boolean
}

// Nur Toene, die StatusBadge kennt (success/neutral/warning — wie die bestehenden Fit-Chips).
// Der Marken-Treffer hebt sich ohnehin ab: die Engine sortiert ihn IMMER als ersten Grund ein.
const GRUND_TONE: Record<MatchGrundTyp, 'success' | 'neutral'> = {
  marke: 'success',
  gewerk: 'success',
  klasse: 'success',
  trust: 'success',
  rating: 'success',
  distanz: 'neutral',
}

function adresseZeile(w: WerkstattFinderRow): string {
  const plzOrt = [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')
  return [w.adresse_strasse, plzOrt].filter(Boolean).join(', ')
}

// Aaron 14.07.: der Anker ist der FAHRZEUGSTANDORT (wo das Auto steht), nicht der Besichtigungsort —
// das sagen wir dem Kunden auch, sonst wundert er sich ueber die Entfernung.
function distanzLabel(distanz_km: number): string | null {
  if (!Number.isFinite(distanz_km)) return null
  return `${distanz_km.toFixed(1).replace('.', ',')} km vom Fahrzeugstandort`
}

export function WerkstattFinder({ werkstaetten, onSelect, selectedId, selectedIds, loading, keineSpezialisierte, scrollToSelected }: Props) {
  const listRef = useRef<HTMLUListElement | null>(null)
  // Embed (Aaron 27.07.): bei Auswahl (z.B. Map-Pin-Klick) die selektierte Card in den sichtbaren
  // Bereich scrollen — "die Auswahl springt darauf". block:'nearest' scrollt nur, wenn sie ausserhalb
  // liegt (kein Sprung, wenn schon sichtbar). Container-Query via data-Attribut statt geteiltem Ref
  // (robust gegen Ref-Wechsel zwischen Cards bei Auswahlwechsel).
  useEffect(() => {
    if (!scrollToSelected || !selectedId) return
    listRef.current
      ?.querySelector('[data-wf-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [scrollToSelected, selectedId])

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
      <ul ref={listRef} className="space-y-3">
        {werkstaetten.map((w) => {
          const isSelected = selectedIds ? selectedIds.includes(w.id) : selectedId === w.id
          const adresse = adresseZeile(w)
          const distanz = distanzLabel(w.distanz_km)
          // Spec B (Aaron 14.07.): Die Matching-Engine liefert die GRÜNDE mit ("BMW-Vertragswerkstatt",
          // "Repariert Karosserie + Lackierung", "Kann PKW", "Verifizierter Partner"). Der Kunde sieht
          // damit, WARUM gerade diese Werkstatt vorgeschlagen wird — statt einer anonymen Distanzliste.
          // 'distanz' und 'trust' lassen wir aus den Chips raus — beide stehen bereits in der Card
          // (Distanz-Zeile unten, "✓ Verifizierter Partner" neben dem Namen). Bleibt: WARUM diese
          // Werkstatt fachlich passt (Marke, Gewerke, Fahrzeugklasse) — PLUS 'rating'.
          // ⚠ 'rating' (GBP-★-Chip) MUSS durchkommen: er hat keine separate Render-Stelle in der
          // Card. Er lief bis 19.07. als typ 'trust' und wurde hier still verschluckt — deshalb war
          // der ★-Chip auf prod unsichtbar, obwohl 13 Werkstaetten chip-faehige GBP-Daten hatten.
          // Wer diesen Filter erweitert: nur Typen ausschliessen, die WOANDERS gerendert werden.
          const grundChips = (w.gruende ?? []).filter(
            (g) => g.typ !== 'distanz' && g.typ !== 'trust',
          )

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
            <li key={w.id} data-wf-selected={isSelected ? 'true' : undefined}>
              <Card
                className={
                  isSelected
                    ? 'ring-2 ring-claimondo-navy'
                    : undefined
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-claimondo-navy truncate">
                        {w.name}
                      </p>
                      {w.verifiziert ? (
                        <StatusBadge tone="success" size="xs">✓ Verifizierter Partner</StatusBadge>
                      ) : null}
                    </div>
                    {grundChips.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {grundChips.map((g, i) => (
                          <StatusBadge key={`${g.typ}-${i}`} tone={GRUND_TONE[g.typ]} size="xs">
                            {g.text}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      fitChip
                    )}
                    {istBelastbareBewertung(w.google_rating, w.google_review_count) ? (
                      <div className="mt-1.5">
                        <GoogleBewertungBadge durchschnitt={w.google_rating ?? null} anzahl={w.google_review_count ?? null} size="sm" />
                      </div>
                    ) : null}
                    {adresse ? (
                      // Mobil-Audit 31.08. (375 px): `truncate` schnitt die Adresse
                      // mitten im Ort ab — „Ernst-Reuter-Straße 42A, 41836 Hückelh…".
                      // Der Kunde soll eine Werkstatt WÄHLEN und sah den Ort nicht;
                      // zusammen mit der fehlenden Entfernung blieb ihm kein
                      // Kriterium ausser dem Namen. Ab `sm` bleibt die kompakte
                      // Einzeiler-Darstellung.
                      <p className="mt-0.5 text-sm text-claimondo-ondo sm:truncate">
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
