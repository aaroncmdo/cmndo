'use client'
// Eingehende Anfragen (annehmen/ablehnen) + gesendete Anfragen (ausstehend, read-only).
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { nimmAnfrageAn, lehneAnfrageAb, blockiereVerbindung } from '@/lib/netzwerk/verbindungen-actions'
import type { AnfrageAnzeige } from '@/lib/netzwerk/verbindungen-queries'

type Result = { ok: boolean; error?: string }

export function AnfragenTab({
  eingehend,
  ausgehend,
}: {
  eingehend: AnfrageAnzeige[]
  ausgehend: AnfrageAnzeige[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) toast.error(res.error ?? 'Fehler')
      else router.refresh()
    })

  return (
    <div className="space-y-6">
      <SectionCard title="Eingehende Anfragen">
        {eingehend.length === 0 ? (
          <p className="text-body-sm text-claimondo-shield">Keine offenen Anfragen.</p>
        ) : (
          eingehend.map((a) => (
            <div key={a.verbindungId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-body-sm text-claimondo-navy">
                {a.partner.name}
                {a.partner.ort ? ` · ${a.partner.ort}` : ''}
              </span>
              <div className="flex gap-2">
                <Button variant="navy" loading={pending} onClick={() => run(() => nimmAnfrageAn(a.verbindungId))}>
                  Annehmen
                </Button>
                <Button variant="ghost" loading={pending} onClick={() => run(() => lehneAnfrageAb(a.verbindungId))}>
                  Ablehnen
                </Button>
                <Button variant="danger" loading={pending} onClick={() => run(() => blockiereVerbindung(a.verbindungId))}>
                  Blockieren
                </Button>
              </div>
            </div>
          ))
        )}
      </SectionCard>
      <SectionCard title="Gesendete Anfragen">
        {ausgehend.length === 0 ? (
          <p className="text-body-sm text-claimondo-shield">Keine ausstehenden Anfragen.</p>
        ) : (
          ausgehend.map((a) => (
            <p key={a.verbindungId} className="text-body-sm text-claimondo-navy py-1">
              {a.partner.name} — ausstehend
            </p>
          ))
        )}
      </SectionCard>
    </div>
  )
}
