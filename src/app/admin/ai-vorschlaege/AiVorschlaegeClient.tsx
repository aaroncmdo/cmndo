'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import type { AiProposal } from '@/lib/orchestrator/types'
import { annehmenVorschlag, verwerfenVorschlag } from './actions'

const TYP_LABEL: Record<string, string> = {
  task: 'Aufgabe',
  escalation: 'Eskalation',
  next_step: 'Nächster Schritt',
}

const ROLLE_LABEL: Record<string, string> = {
  sachverstaendiger: 'Sachverständiger',
  kundenbetreuer: 'Kundenbetreuer',
  admin: 'Admin',
}

function payloadHaupttext(
  payload: Record<string, unknown>,
): string {
  const titel = payload.titel
  const hinweis = payload.hinweis
  const grund = payload.grund
  if (typeof titel === 'string' && titel) return titel
  if (typeof hinweis === 'string' && hinweis) return hinweis
  if (typeof grund === 'string' && grund) return grund
  return '—'
}

export function AiVorschlaegeClient({
  vorschlaege,
  headerless = false,
}: {
  vorschlaege: AiProposal[]
  headerless?: boolean
}) {
  // Per-Zeile Pending: nur der gerade bearbeitete Vorschlag laedt/disabled,
  // die anderen Zeilen bleiben klickbar.
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Fall-ID, deren „Verwerfen" gerade nach einem Grund fragt.
  const [begruendetId, setBegruendetId] = useState<string | null>(null)
  const VERWERF_GRUENDE = ['Schon erledigt', 'Nicht relevant', 'Unpräzise/falsch'] as const
  const [, startTransition] = useTransition()

  const run = (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) => {
    setPendingId(id)
    startTransition(async () => {
      const r = await action()
      if (r.ok) toast.success(okMsg)
      else toast.error(r.error ?? 'Fehler')
      setPendingId(null)
    })
  }

  if (!vorschlaege.length) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        {!headerless && <h1 className="text-heading-md text-claimondo-navy mb-4">KI-Vorschläge</h1>}
        <p className="text-body-sm text-claimondo-ondo">Keine offenen KI-Vorschläge.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-5 space-y-4">
      {!headerless && <h1 className="text-heading-md text-claimondo-navy">KI-Vorschläge</h1>}
      <p className="text-body-sm text-claimondo-ondo">
        {vorschlaege.length} offener{vorschlaege.length !== 1 ? 'e' : ''} Vorschlag{vorschlaege.length !== 1 ? 'e' : ''}
      </p>
      {vorschlaege.map((v) => (
        <SectionCard key={v.id} bodyClassName="space-y-2">
          {/* Typ + Zielrolle */}
          <div className="flex items-center gap-2">
            <span className="text-caption uppercase text-claimondo-ondo font-semibold">
              {TYP_LABEL[v.vorschlag_typ] ?? v.vorschlag_typ}
            </span>
            {v.ziel_rolle && (
              <>
                <span className="text-caption text-claimondo-ondo">·</span>
                <span className="text-caption text-claimondo-ondo">
                  {ROLLE_LABEL[v.ziel_rolle] ?? v.ziel_rolle}
                </span>
              </>
            )}
          </div>

          {/* Haupttext aus Payload */}
          <p className="font-semibold text-claimondo-navy">
            {payloadHaupttext(v.payload)}
          </p>

          {/* Begründung */}
          <p className="text-body-sm text-claimondo-ondo">{v.begruendung}</p>

          {/* Datum */}
          <p className="text-caption text-claimondo-ondo/70">
            {new Date(v.erstellt_am).toLocaleString('de-DE', {
              timeZone: 'Europe/Berlin',
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>

          {/* Aktionen */}
          {begruendetId === v.id ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-caption text-claimondo-ondo">Grund:</span>
              {VERWERF_GRUENDE.map((grund) => (
                <Button
                  key={grund}
                  variant="ghost"
                  size="sm"
                  loading={pendingId === v.id}
                  onClick={() => {
                    setBegruendetId(null)
                    run(v.id, () => verwerfenVorschlag(v.id, grund), 'Vorschlag verworfen')
                  }}
                >
                  {grund}
                </Button>
              ))}
              <Button variant="bare" size="sm" onClick={() => setBegruendetId(null)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <Button
                variant="navy"
                size="sm"
                loading={pendingId === v.id}
                onClick={() => run(v.id, () => annehmenVorschlag(v.id), 'Vorschlag angenommen')}
              >
                Annehmen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={pendingId === v.id}
                onClick={() => setBegruendetId(v.id)}
              >
                Verwerfen
              </Button>
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  )
}
