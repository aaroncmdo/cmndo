'use client'
// Kontakt-Manager: bestehende Freunde (entfernen/blockieren) + Verzeichnis-Suche ("Vernetzen")
// + Kalt-Einladung (EinladenForm, T6).
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { entferneVerbindung } from '@/lib/netzwerk/verbindungen-actions'
import type { VerbindungAnzeige } from '@/lib/netzwerk/verbindungen-queries'
import type { NetzwerkRolle } from '@/lib/netzwerk/types'
import { VerzeichnisSuche } from './VerzeichnisSuche'
import { EinladenForm } from './EinladenForm'

type Result = { ok: boolean; error?: string }

const ROLLE_LABEL: Record<NetzwerkRolle, string> = {
  sachverstaendiger: 'Sachverständiger',
  werkstatt: 'Werkstatt',
  flottenmanager: 'Flotte',
  makler: 'Makler',
}

export function VerbindungenTab({ verbindungen }: { verbindungen: VerbindungAnzeige[] }) {
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
      <SectionCard title="Meine Verbindungen">
        {verbindungen.length === 0 ? (
          <p className="text-body-sm text-claimondo-shield">
            Noch keine Verbindungen — nutze die Suche unten, um Partner zu finden.
          </p>
        ) : (
          <div className="divide-y divide-claimondo-border">
            {verbindungen.map((v) => (
              <div key={v.verbindungId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-claimondo-navy truncate">{v.partner.name}</p>
                  <p className="text-caption text-claimondo-shield">
                    {ROLLE_LABEL[v.partner.rolle]}
                    {v.partner.ort ? ` · ${v.partner.ort}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={() => run(() => entferneVerbindung(v.verbindungId))}
                  >
                    Entfernen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <VerzeichnisSuche />
      <EinladenForm />
    </div>
  )
}
