'use client'

// AAR-289 / AAR-568 (V2): Header für die SV-Fallakte. Breadcrumb + Titel +
// Phasen-Leiste + Akte-Button.
// AAR-727 (fallphasen-glass): Phasen-Leiste nutzt shared FallPhasenPanel
// (variant='header-strip', glass-light). Terminal 'storniert' rendert den
// Badge innerhalb desselben Glass-Panels; 'abgeschlossen' zeigt wie bisher
// die vollständig done-Pipeline.
// AAR-746 (Phase B): Identity-Zeile (Fallnummer + Kunde + Ort + Subphase +
// Actions) ist jetzt shared via FallIdentityHeader. Phasen-Strip bleibt
// als Composition drunter, das ist SV-spezifisch.

import { FallakteDrawer } from './FallakteDrawer'
// AAR-307: Ad-hoc Task-Anlegen aus dem FallHeader
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
import type { SvSubphase } from '@/lib/gutachter/subphase'
// AAR-727: Shared Glass-Panel — ersetzt direkte PhasePipeline + terminal-Pill.
import { FallPhasenPanel } from '@/components/shared/fall-phases'
// AAR-746: Shared Identity-Header.
import { FallIdentityHeader } from '@/components/shared/fall-header'

type DrawerData = Parameters<typeof FallakteDrawer>[0]

export function FallHeader({
  fallNummer,
  fallId,
  kundenName,
  ort,
  subphase,
  drawer,
  aktuellePhaseSnake,
  abgeschlossenAm = null,
}: {
  fallNummer: string
  fallId: string
  kundenName: string
  ort: string
  subphase: SvSubphase
  drawer: DrawerData
  aktuellePhaseSnake: string | null
  /** Optional: abgeschlossen_am für korrekte Phase-10-Markierung im Panel. */
  abgeschlossenAm?: string | null
}) {
  const terminal: 'storniert' | null =
    subphase.code === 'storniert' ? 'storniert' : null

  const subphaseLabel = `Phase ${subphase.phase} ${subphase.phaseLabel} · ${subphase.label}`

  return (
    <div>
      <FallIdentityHeader
        rolle="sv"
        fallNummer={fallNummer}
        kundenName={kundenName}
        ort={ort}
        subphaseLabel={subphaseLabel}
        backHref="/gutachter/faelle"
        backLabel="Zurück zu Fällen"
      >
        <TaskAnlegenButton fallId={fallId} rolle="sachverstaendiger" label="Task" />
        <FallakteDrawer {...drawer} />
      </FallIdentityHeader>

      <div className="px-4 sm:px-6 pb-3 border-b border-claimondo-border">
        <FallPhasenPanel
          fall={{
            id: fallId,
            aktuelle_phase: aktuellePhaseSnake,
            phase_nummer: subphase.phase,
            abgeschlossen_am: abgeschlossenAm,
          }}
          rolle="sv"
          variant="header-strip"
          terminal={terminal}
        />
      </div>
    </div>
  )
}
