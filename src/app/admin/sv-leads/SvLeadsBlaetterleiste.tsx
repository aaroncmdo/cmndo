'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { filterUrl, type SvLeadFilter } from '@/lib/sv-leads/liste-filter'

/**
 * Blättern durch die Trefferliste.
 *
 * ⚠ Die Leiste nennt IMMER die Gesamtzahl, auch auf Seite 1 von 1. Genau das
 * fehlte: eine Liste, die 200 von 4.644 zeigte, sah aus wie eine vollständige
 * Liste mit 200 Einträgen. Dieselbe Klasse hatte die Admin-Aufgabenliste
 * (#5457) — „947 von 1000", wobei 1000 das Limit war und niemand es als solches
 * las.
 */
export default function SvLeadsBlaetterleiste({
  filter,
  seite,
  seiten,
  gesamt,
  proSeite,
}: {
  filter: SvLeadFilter
  seite: number
  seiten: number
  gesamt: number
  proSeite: number
}) {
  const router = useRouter()

  const von = gesamt === 0 ? 0 : (seite - 1) * proSeite + 1
  const bis = Math.min(seite * proSeite, gesamt)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-claimondo-ondo">
        {gesamt === 0
          ? 'Keine Einträge'
          : `${von.toLocaleString('de-DE')}–${bis.toLocaleString('de-DE')} von ${gesamt.toLocaleString('de-DE')}`}
      </p>

      {seiten > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={seite <= 1}
            onClick={() => router.push(filterUrl(filter, { seite: seite - 1 }))}
            iconLeft={<ChevronLeftIcon className="h-4 w-4" />}
          >
            Zurück
          </Button>
          <span className="text-sm text-claimondo-ondo">
            Seite {seite.toLocaleString('de-DE')} von {seiten.toLocaleString('de-DE')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={seite >= seiten}
            onClick={() => router.push(filterUrl(filter, { seite: seite + 1 }))}
            iconRight={<ChevronRightIcon className="h-4 w-4" />}
          >
            Weiter
          </Button>
        </div>
      )}
    </div>
  )
}
