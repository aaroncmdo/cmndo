'use client'

// AAR-841 Frontend: Modal-Wrapper um KanzleiWunschForm.
//
// Drei Caller (Aaron-Architektur):
//   1. Schritt4Client nach signupAndConvertLead-Success → 'lead_konvertierung'
//   2. Dispatcher Lead-Detail nach Konversion              → 'lead_konvertierung'
//   3. Re-Frage-Hook in kunde/faelle/[id]                  → 'phase_4_re_frage'
//
// Pattern: onClose ist IMMER Redirect-/Close-Trigger, egal ob der Kunde
// gespeichert hat. "Später fragen" persistiert wunsch='noch_unentschieden'
// + gefragt_in_phase, damit Audit-Trail komplett ist und der Re-Frage-Hook
// nicht doppelt triggert.

import { useTransition } from 'react'
import { toast } from 'sonner'
import { ScaleIcon } from 'lucide-react'
import { Modal } from '@/components/primitives'
import { setKanzleiWunsch } from '@/lib/kanzlei/actions'
import { KanzleiWunschForm } from './KanzleiWunschForm'

type Props = {
  open: boolean
  claimId: string
  gefragtInPhase: 'lead_konvertierung' | 'phase_4_re_frage'
  /** Wird nach Speichern ODER "Später fragen" ODER ESC aufgerufen */
  onClose: (savedWish: boolean) => void
  /** Optional: Headline für phase_4_re_frage anders als für lead_konvertierung */
  headline?: string
  description?: string
}

export function KanzleiWunschModal({
  open,
  claimId,
  gefragtInPhase,
  onClose,
  headline,
  description,
}: Props) {
  const [isPending, startTransition] = useTransition()

  const defaultHeadline    = gefragtInPhase === 'phase_4_re_frage'
    ? 'Möchtest du jetzt eine Kanzlei einbinden?'
    : 'Möchtest du eine Kanzlei einbinden?'
  const defaultDescription = gefragtInPhase === 'phase_4_re_frage'
    ? 'Dein Gutachten ist da. Eine Kanzlei vertritt deine Ansprüche gegenüber der Versicherung.'
    : 'Eine Kanzlei vertritt deine Ansprüche gegenüber der Versicherung — falls die VS Probleme macht.'

  function handleSpaeterFragen() {
    startTransition(async () => {
      // Audit-Trail: gefragt_in_phase wird gesetzt, damit Hook nicht erneut triggert
      const res = await setKanzleiWunsch({
        claim_id:         claimId,
        wunsch:           'noch_unentschieden',
        gefragt_in_phase: gefragtInPhase,
      })
      if (!res.ok) {
        // Fehler nicht blocken — wir lassen den Kunden trotzdem rauskommen,
        // der Cron schlägt später nochmal zu
        console.error('[AAR-841] Später-fragen-Persistenz fehlgeschlagen:', res.error)
      }
      onClose(false)
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      ariaLabel="Kanzlei-Wunsch"
      maxWidth={520}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#0D1B3E]/10 flex items-center justify-center shrink-0">
            <ScaleIcon className="w-5 h-5 text-[#0D1B3E]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#0D1B3E]">{headline ?? defaultHeadline}</h2>
            <p className="text-xs text-[#7BA3CC] mt-0.5">{description ?? defaultDescription}</p>
          </div>
        </div>

        <KanzleiWunschForm
          claimId={claimId}
          gefragtInPhase={gefragtInPhase}
          submitLabel="Speichern"
          variant="plain"
          onSuccess={() => onClose(true)}
        />

        <div className="border-t border-[#E2E8F3] pt-3">
          <button
            type="button"
            onClick={handleSpaeterFragen}
            disabled={isPending}
            className="w-full px-4 py-2 rounded-lg border border-[#E2E8F3] text-sm text-[#7BA3CC] hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Wird gespeichert…' : 'Später fragen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
