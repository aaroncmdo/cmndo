'use client'

// Vertrieb-Cockpit Phase C: Drawer-Wrapper fuer die Firmen-Flotte (B2B). Laedt die Konten
// on-mount via getFirmenFlottenKontenDaten und rendert FirmenFlotteAdminClient AS-IS (Liste +
// Anlage). Muster wie QrPoolDrawerContent.
// Hinweis: FirmenFlotteAdminClient ruft nach erfolgreicher Anlage intern router.refresh() auf —
// das aktualisiert die Cockpit-Route (harmlos), NICHT die hier client-seitig geladene Liste.
// Ein neu angelegtes Konto erscheint daher erst beim erneuten Oeffnen des Drawers (bewusster
// Tradeoff: Komponente wird unveraendert eingebettet, kein onDone-Hook wie bei den eigenen Wizards).
import { useCallback, useEffect, useState } from 'react'
import FirmenFlotteAdminClient, {
  type FlottenKontoRow,
} from '@/app/admin/firmen-flotte/FirmenFlotteAdminClient'
import { getFirmenFlottenKontenDaten } from '../_actions/firmen-flotten-daten'

export default function FirmenFlottenDrawerContent() {
  const [konten, setKonten] = useState<FlottenKontoRow[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const res = await getFirmenFlottenKontenDaten()
    if (res.ok) {
      setKonten(res.konten)
      setFehler(null)
    } else {
      setFehler(res.error)
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  if (fehler) {
    return <p className="p-6 text-body-sm text-danger">{fehler}</p>
  }

  if (!konten) {
    return (
      <p className="p-6 text-body-sm text-claimondo-ondo/60">Firmen-Flotten-Konten werden geladen…</p>
    )
  }

  return <FirmenFlotteAdminClient konten={konten} />
}
