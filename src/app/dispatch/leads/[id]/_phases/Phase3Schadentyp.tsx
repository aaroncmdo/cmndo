'use client'

// AAR-139 / W5: Phase 3 — Schadentyp. Dünner Wrapper um SchadentypPicker.
// AAR-268: Weiter-Button + router.refresh() nach Save damit Qualification-
// Engine den neuen schadentyp sieht und Phase 4 freischaltet.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SchadentypPicker from '../SchadentypPicker'
import { useDispatchPhase } from '../_lib/phase-context'

export default function Phase3Schadentyp() {
  const { lead, qualification, setPhase } = useDispatchPhase()
  const router = useRouter()
  const l = lead as unknown as {
    schadentyp?: string | null
    schadentyp_freitext?: string | null
    gegner_kennzeichen?: string | null
    parkplatz_kamera?: boolean | null
    polizei_vor_ort?: boolean | null
  }
  // AAR-268: Lokal nachhalten — sobald Save durch ist, zeigen wir den Weiter-
  // Button auch wenn die Qualification-Engine noch nicht refresht ist.
  // q4_schadentyp ist immer boolean (kein null/undefined möglich).
  const [showWeiter, setShowWeiter] = useState<boolean>(qualification.q4_schadentyp)

  return (
    <div className="space-y-3">
      {/* CMM-23: BkatAnalysePanel ist nach Phase 4 (Stammdaten) gewandert,
         da der Kunde-Polizeibericht-Upload den Auto-OCR-Trigger jetzt im
         Onboarding feuert (uploadPflichtdokument). Phase 3 fokussiert sich
         auf Schadentyp-Auswahl. */}
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
      {/* AAR-617: Zurück-/Weiter-Row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPhase(2)}
          className="flex-1 px-4 py-2.5 rounded-ios-xl border border-claimondo-border text-claimondo-navy hover:bg-claimondo-bg text-sm font-semibold flex items-center justify-center gap-2"
        >
          ← Zurück zu Phase 2
        </button>
        {showWeiter && (
          <button
            type="button"
            onClick={() => setPhase(4)}
            className="flex-1 px-4 py-2.5 rounded-ios-xl bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-shield flex items-center justify-center gap-2"
          >
            Weiter zu Phase 4 →
          </button>
        )}
      </div>
    </div>
  )
}
