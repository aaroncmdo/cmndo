'use client'

// Kanzlei-Wahl im ClaimStepper — der Ort, den `KanzleiPfadCard` seit CMM-32 verspricht
// („die Frage lebt jetzt im lila Top-Banner des ClaimSteppers"), der aber nie gebaut wurde.
//
// ⭐ ROOT CAUSE (Git-Historie, 31.08.): `KanzleiWunschModal` WAR eingebunden — in
// `src/app/schaden-melden/schritt-4/SignupClient.tsx` (03.05.). AAR-904 loeschte am 14.05. den
// alten 4-Step-Wizard („-5000 LOC") und damit den EINZIGEN Consumer. Das Modal blieb als Datei
// zurueck; der Barrel-Export `shared/claims/index.ts` haelt es fuer knip „benutzt", deshalb hat
// nie ein Dead-Code-Waechter angeschlagen. Sechs Wochen spaeter schrieb #3287 „bleibt dort
// (KanzleiWunschModal im Kunde-Portal)" — eine Absicht, kein Ist-Zustand.
//
// Folge auf prod (Messung 31.08.): 11 Komplettservice-Claims mit `kanzlei_wunsch='nicht_gefragt'`,
// 3 davon bereits abgeschlossen — sie wurden NIE gefragt.
//
// Diese Komponente baut nur den fehlenden AUSLOESER. Modal, Formular, Action
// (`setKanzleiWunsch`) und der Audit-Trail (`gefragt_in_phase`) existieren seit AAR-841.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScaleIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button'
import { KanzleiWunschModal } from '@/components/shared/claims'

export function KanzleiWahlBanner({
  claimId,
  /** Steuert Text + Audit-Trail: vor dem Gutachten neutral, danach „Dein Gutachten ist da". */
  phase = 'lead_konvertierung',
}: {
  claimId: string
  phase?: 'lead_konvertierung' | 'phase_4_re_frage'
}) {
  const [offen, setOffen] = useState(false)
  const router = useRouter()
  const nachGutachten = phase === 'phase_4_re_frage'

  return (
    <>
      <div className="border-b border-claimondo-shield/20 bg-claimondo-shield/5 px-4 sm:px-6 py-3">
        <div className="flex items-start gap-3">
          <ScaleIcon className="w-5 h-5 text-claimondo-ondo shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-claimondo-navy">
              Möchtest du eine Kanzlei einbinden?
            </p>
            <p className="text-caption text-claimondo-ondo mt-0.5">
              {nachGutachten ? 'Dein Gutachten ist da. ' : ''}
              Eine Kanzlei vertritt deine Ansprüche gegenüber der Versicherung — für dich
              kostenfrei, wenn der Gegner haftet.
            </p>
          </div>
          {/* primitives.Button statt handgerolltem <button> — AGENTS.md §Komponenten-Set.
              1:1 uebersetzt: bg-claimondo-navy + text-white = variant 'navy' (Default),
              px-4/py-2 mit text-body-sm = size 'sm' (36px). `shrink-0` bleibt ueber die
              className-Escape-Hatch erhalten, sonst schrumpft der Button im flex-Row. */}
          <Button variant="navy" size="sm" className="shrink-0" onClick={() => setOffen(true)}>
            Auswählen
          </Button>
        </div>
      </div>

      <KanzleiWunschModal
        open={offen}
        claimId={claimId}
        gefragtInPhase={phase}
        onClose={(gespeichert) => {
          setOffen(false)
          // Auch bei „Später fragen" neu laden: die Action schreibt dann
          // wunsch='noch_unentschieden' + gefragt_in_phase, das Banner verschwindet.
          if (gespeichert) router.refresh()
        }}
      />
    </>
  )
}
