'use client'

// AAR-139 / W5: Phase 3 — Schadentyp. Dünner Wrapper um SchadentypPicker.
// Der existierende Picker (SchadentypPicker.tsx, 5 Buttons + Parkplatz-Kamera-
// Check + Sonstiges-Freitext) ist bereits fertig und getestet. W5 fügt hier
// nur einen Phase-Frame herum, ändert den Picker aber nicht.

import SchadentypPicker from '../SchadentypPicker'
import { useDispatchPhase } from '../lib/phase-context'

export default function Phase3Schadentyp() {
  const { lead } = useDispatchPhase()
  const l = lead as unknown as {
    schadentyp?: string | null
    schadentyp_freitext?: string | null
    gegner_kennzeichen?: string | null
    parkplatz_kamera?: boolean | null
  }
  return (
    <SchadentypPicker
      leadId={lead.id}
      initialTyp={l.schadentyp as Parameters<typeof SchadentypPicker>[0]['initialTyp']}
      initialFreitext={l.schadentyp_freitext ?? null}
      gegnerKennzeichen={l.gegner_kennzeichen ?? null}
      initialKamera={l.parkplatz_kamera ?? null}
    />
  )
}
