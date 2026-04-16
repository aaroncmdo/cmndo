'use client'

// AAR-139 / W5: Phase 3 — Schadentyp. Dünner Wrapper um SchadentypPicker.
// AAR-268: Weiter-Button + router.refresh() nach Save damit Qualification-
// Engine den neuen schadentyp sieht und Phase 4 freischaltet.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SchadentypPicker from '../SchadentypPicker'
import { useDispatchPhase } from '../lib/phase-context'

export default function Phase3Schadentyp() {
  const { lead, qualification, setPhase } = useDispatchPhase()
  const router = useRouter()
  const l = lead as unknown as {
    schadentyp?: string | null
    schadentyp_freitext?: string | null
    gegner_kennzeichen?: string | null
    parkplatz_kamera?: boolean | null
  }
  // AAR-268: Lokal nachhalten — sobald Save durch ist, zeigen wir den Weiter-
  // Button auch wenn die Qualification-Engine noch nicht refresht ist.
  const [showWeiter, setShowWeiter] = useState<boolean>(qualification.q4_schadentyp ?? false)

  return (
    <div className="space-y-3">
      <SchadentypPicker
        leadId={lead.id}
        initialTyp={l.schadentyp as Parameters<typeof SchadentypPicker>[0]['initialTyp']}
        initialFreitext={l.schadentyp_freitext ?? null}
        gegnerKennzeichen={l.gegner_kennzeichen ?? null}
        initialKamera={l.parkplatz_kamera ?? null}
        onSaved={() => {
          setShowWeiter(true)
          router.refresh()
        }}
      />
      {showWeiter && (
        <button
          type="button"
          onClick={() => setPhase(4)}
          className="w-full px-4 py-2.5 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F] flex items-center justify-center gap-2"
        >
          Weiter zu Phase 4 →
        </button>
      )}
    </div>
  )
}
