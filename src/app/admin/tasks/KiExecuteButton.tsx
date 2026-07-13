'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives/Button'
import { Modal } from '@/components/primitives/Modal'
import { executableTypeFor } from '@/lib/task-executor/registry'
import { starteKiAusfuehrung, bestaetigeKiAusfuehrung, brichAbKiAusfuehrung } from './ki-actions'
import type { PlanStep } from '@/lib/task-executor/types'

export type KiButtonTask = { id: string; typ: string | null; claim_id: string | null; status: string }

function stepPreview(step: PlanStep): string {
  const a = step.args as Record<string, unknown>
  switch (step.verb) {
    case 'sende_kommunikation':
      return `Nachricht an Kunde — Vorlage „${String(a.trigger ?? '')}"${a.variablen && Object.keys(a.variablen as object).length ? ` (${JSON.stringify(a.variablen)})` : ''}`
    case 'setze_status':
      return `Status setzen → „${String(a.neuer_status ?? '')}" (${String(a.grund ?? '')})`
    case 'interne_notiz':
      return `Interne Notiz: ${String(a.text ?? '')}`
    case 'task_schliessen':
      return `Aufgabe schließen: ${String(a.ergebnis ?? '')}`
    default:
      return step.verb
  }
}

export function KiExecuteButton({
  task,
  executorEnabled,
}: {
  task: KiButtonTask
  executorEnabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ execId: string; steps: PlanStep[]; begruendung: string } | null>(null)

  if (!executorEnabled || !executableTypeFor(task)) return null

  function starten() {
    setError(null)
    startTransition(async () => {
      const r = await starteKiAusfuehrung(task.id)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      if (r.execution?.status === 'warte_bestaetigung') {
        setPlan({ execId: r.execution.id, steps: r.execution.plan, begruendung: r.execution.begruendung })
      } else {
        router.refresh()
      }
    })
  }

  function bestaetigen() {
    if (!plan) return
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeKiAusfuehrung(plan.execId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      setPlan(null)
      router.refresh()
    })
  }

  function abbrechen() {
    const execId = plan?.execId
    setPlan(null)
    setError(null)
    if (!execId) return
    startTransition(async () => {
      const r = await brichAbKiAusfuehrung(execId)
      if (!r.ok) console.error('KI-Ausfuehrung abbrechen fehlgeschlagen:', r.error)
      router.refresh()
    })
  }

  return (
    <div
      className="mt-2 pt-2 border-t border-claimondo-border"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button
        variant="ghost"
        size="sm"
        fullWidth
        loading={pending}
        onClick={starten}
        ariaLabel="Aufgabe per KI erledigen"
      >
        ✨ Per KI erledigen
      </Button>
      {error && !plan && <p className="mt-1 text-danger text-body-xs">{error}</p>}

      {plan && (
        <Modal open onClose={abbrechen} maxWidth={480} ariaLabel="KI-Plan bestätigen">
          <div className="space-y-3">
            <h3 className="text-claimondo-navy font-semibold">KI-Plan bestätigen</h3>
            {plan.begruendung && (
              <p className="text-body-sm text-claimondo-ondo">{plan.begruendung}</p>
            )}
            <ul className="space-y-1.5 list-disc pl-4">
              {plan.steps.map((s, i) => (
                <li key={i} className="text-body-sm text-claimondo-navy">
                  {stepPreview(s)}
                </li>
              ))}
            </ul>
            {error && <p className="text-danger text-body-xs">{error}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={abbrechen} disabled={pending}>
                Abbrechen
              </Button>
              <Button variant="navy" onClick={bestaetigen} loading={pending}>
                Bestätigen &amp; ausführen
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
