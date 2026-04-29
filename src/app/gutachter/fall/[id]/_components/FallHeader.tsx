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
  kennzeichen,
  fahrzeug,
  drawer,
}: {
  fallNummer: string
  fallId: string
  kundenName: string
  ort: string
  /** CMM-32 Walkthrough: Kennzeichen prominent statt Unfallort. */
  kennzeichen?: string | null
  /** CMM-32 Walkthrough: Marke + Modell als Subline (z.B. „BMW 320i"). */
  fahrzeug?: string | null
  subphase: SvSubphase
  drawer: DrawerData
  aktuellePhaseSnake: string | null
  abgeschlossenAm?: string | null
}) {
  void ort // CMM-32 Walkthrough: Unfallort wandert aus dem Header in Stammdaten/Briefing.
  return (
    <FallIdentityHeader
      rolle="sv"
      fallNummer={fallNummer}
      kundenName={kundenName}
      kennzeichen={kennzeichen ?? null}
      fahrzeug={fahrzeug ?? null}
      backHref="/gutachter/faelle"
      backLabel="Zurück zu Fällen"
    >
      <FallakteDrawer {...drawer} />
    </FallIdentityHeader>
  )
}
