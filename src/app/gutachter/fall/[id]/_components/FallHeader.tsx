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
import type { SvSubphase } from '@/lib/gutachter/subphase'
// AAR-746: Shared Identity-Header.
import { FallIdentityHeader } from '@/components/shared/fall-header'

type DrawerData = Parameters<typeof FallakteDrawer>[0]

export function FallHeader({
  fallNummer,
  kundenName,
  ort,
  drawer,
}: {
  fallNummer: string
  fallId: string
  kundenName: string
  ort: string
  subphase: SvSubphase
  drawer: DrawerData
  aktuellePhaseSnake: string | null
  abgeschlossenAm?: string | null
}) {
  // CMM-23: TaskAnlegenButton + Subphasen-Label entfernt — der SV
  // braucht keine eigene Task-Erstellung (KB-Pfad läuft via Chat,
  // AAR-861) und der Auftrags-Lifecycle steckt im 3-Phasen-Stepper
  // direkt darunter. FallakteDrawer bleibt als alternative Akten-Sicht.
  return (
    <FallIdentityHeader
      rolle="sv"
      fallNummer={fallNummer}
      kundenName={kundenName}
      ort={ort}
      backHref="/gutachter/faelle"
      backLabel="Zurück zu Fällen"
    >
      <FallakteDrawer {...drawer} />
    </FallIdentityHeader>
  )
}
