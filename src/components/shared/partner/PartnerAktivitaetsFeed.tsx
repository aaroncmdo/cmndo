'use client'
// Praesentationaler Aktivitaets-Feed (Cockpit). Kein eigenes Fetching -> bekommt rows vom
// PartnerCockpitPanel. Typ->Label/Farbe ueber die Status-Registry (statusBadgeView), nie inline.
import { useState } from 'react'
import { Card } from '@/components/primitives'
import { statusBadgeView } from '@/lib/status/resolve'
import type { PartnerAktivitaetRow } from '@/lib/partner/aktivitaet-types'

function relativOderDatum(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  if (diffMin < 1440) return `vor ${Math.round(diffMin / 60)} Std.`
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PartnerAktivitaetsFeed({
  rows,
  loading = false,
  compact = false,
}: {
  rows: PartnerAktivitaetRow[]
  loading?: boolean
  compact?: boolean
}) {
  const [alleAnzeigen, setAlleAnzeigen] = useState(false)
  const sichtbar = compact && !alleAnzeigen ? rows.slice(0, 5) : rows

  if (loading) {
    return <p className="text-caption text-claimondo-ondo/60">Aktivitäten werden geladen…</p>
  }
  if (rows.length === 0) {
    return <p className="text-caption text-claimondo-ondo/60">Noch keine Aktivitäten erfasst.</p>
  }

  return (
    <div className="space-y-2">
      {sichtbar.map((r) => {
        const badge = statusBadgeView('partner-aktivitaet', r.typ)
        const autorName =
          r.ist_system
            ? 'System'
            : (r.meta && typeof r.meta['autor_name'] === 'string' ? (r.meta['autor_name'] as string) : 'Team')
        return (
          <Card key={r.id} p={3} radius="md">
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-ios-sm px-2 py-0.5 text-caption font-medium ${badge.slotClass}`}>
                {badge.label}
              </span>
              <span className="text-caption text-claimondo-ondo/60">{relativOderDatum(r.erstellt_am)}</span>
            </div>
            <p className="mt-1 text-sm text-claimondo-navy break-words whitespace-pre-wrap">{r.text}</p>
            <p className="mt-1 text-caption text-claimondo-ondo/60">{autorName}</p>
          </Card>
        )
      })}
      {compact && !alleAnzeigen && rows.length > 5 && (
        <button
          type="button"
          onClick={() => setAlleAnzeigen(true)}
          className="text-caption text-claimondo-ondo underline"
        >
          {rows.length - 5} weitere anzeigen
        </button>
      )}
    </div>
  )
}
