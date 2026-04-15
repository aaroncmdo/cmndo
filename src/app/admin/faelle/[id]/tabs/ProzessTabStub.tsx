'use client'

// AAR-162 / W2: Prozess-Tab-Stub — die echten 8 Sections folgen in W4 (AAR-164).
// Aktuell nur ein Platzhalter damit die Shell alle 5 Tabs anbieten kann.

export default function ProzessTabStub() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">Prozess</h2>
      <p className="text-xs text-gray-500">
        VS-Regulierung + Kanzlei-Prozess — Anspruchsschreiben, Rüge,
        technische Stellungnahme, Nachbesichtigung, Klage, Auszahlung. Wird in
        W4 (AAR-164) implementiert. Die bestehenden Components (VsRegulierungTab,
        LexDriveTriggerPanel) bleiben bis dahin über den Monolith-Fallback
        erreichbar.
      </p>
    </div>
  )
}
