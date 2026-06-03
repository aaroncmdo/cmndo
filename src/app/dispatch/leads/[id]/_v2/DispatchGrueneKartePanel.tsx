'use client'

// P4-D: Grüne-Karte-Anfrage-Panel (dispatcher-only, Mechanismus B, unfall-Sektion).
// Erscheint nur bei auslandskennzeichen='true'. Trackt die DE-Eintrittsversicherungs-
// Anfrage beim Deutschen Büro Grüne Karte + legt den KB-Reminder-Task (+10 Tage) an.

import { useState, useTransition } from 'react'
import { GlobeIcon, ExternalLinkIcon, CheckCircleIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button/Button.web'
import { formatDatum } from '@/lib/format'
import { setGrueneKarteAngefragt } from '../_actions/gruene-karte'

export function DispatchGrueneKartePanel({
  leadId,
  initialAngefragtAm,
}: {
  leadId: string
  initialAngefragtAm: string | null
}) {
  const [angefragtAm, setAngefragtAm] = useState<string | null>(initialAngefragtAm)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function anfragen() {
    setError(null)
    start(async () => {
      const r = await setGrueneKarteAngefragt(leadId)
      if (!r.success) {
        setError(r.error ?? 'Konnte nicht gespeichert werden.')
        return
      }
      setAngefragtAm(new Date().toISOString().slice(0, 10))
    })
  }

  return (
    <SectionCard title="Auslandskennzeichen — Grüne Karte">
      <p className="mb-3 text-xs text-claimondo-ondo">
        DE-Eintrittsversicherung beim{' '}
        <a
          href="https://www.gruene-karte.de/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-claimondo-ondo underline hover:text-claimondo-navy"
        >
          Deutschen Büro Grüne Karte <ExternalLinkIcon className="h-3 w-3" />
        </a>{' '}
        anfragen, dann hier festhalten — der KB wird nach 10 Tagen erinnert.
      </p>

      {angefragtAm ? (
        <div className="flex items-center gap-2 rounded-ios-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          Grüne Karte angefragt am {formatDatum(angefragtAm)} — KB-Reminder läuft (+10 Tage).
        </div>
      ) : (
        <Button
          variant="ondo"
          size="md"
          onClick={anfragen}
          loading={pending}
          iconLeft={<GlobeIcon className="h-4 w-4" />}
        >
          Grüne Karte angefragt
        </Button>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </SectionCard>
  )
}
