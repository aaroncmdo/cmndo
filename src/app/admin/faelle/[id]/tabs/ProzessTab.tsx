'use client'

// AAR-164 / W4: Prozess-Tab — 8 Sections phase-dynamisch.
// Ersetzt den ProzessTabStub aus W2. Sichtbarkeit je Section folgt der
// visibleSections-Map aus phase-config.ts — ab akte-uebergeben zeigt sich
// Kanzlei+E-Akte, ab as-vorbereitung AS, ab vs-kuerzt Kürzung+Rüge+Stellung-
// nahme, etc.
//
// Section-Components liegen in ../prozess/Sections.tsx.

import { useFall } from '../FallContext'
import {
  KanzleiEakteSection,
  AsSection,
  VsReaktionSection,
  StellungnahmeSection,
  RuegeSection,
  NachbesichtigungSection,
  KlageSection,
  AuszahlungSection,
} from '../prozess/Sections'

export default function ProzessTab() {
  const { visibleSections, phase } = useFall()

  // Kanzlei+E-Akte erscheint ab „as-status" (war ab akte-uebergeben in der
  // Spec — Alias-Mapping via phase-config visibleSections).
  const showKanzlei = visibleSections.includes('as-status') || visibleSections.includes('kernwerte')
  const showAs = visibleSections.includes('as-status')
  const showVsReaktion = visibleSections.includes('kuerzung') ||
    visibleSections.includes('regulierung')
  const showStellungnahme = visibleSections.includes('stellungnahme')
  const showRuege = visibleSections.includes('ruege')
  const showNachbesichtigung = visibleSections.includes('nachbesichtigung')
  const showKlage = visibleSections.includes('klage')
  const showAuszahlung = visibleSections.includes('auszahlung') ||
    visibleSections.includes('regulierung')

  const anythingVisible =
    showKanzlei || showAs || showVsReaktion || showStellungnahme || showRuege ||
    showNachbesichtigung || showKlage || showAuszahlung

  if (!anythingVisible) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Prozess</h2>
        <p className="text-xs text-gray-500">
          Der Prozess-Tab zeigt Kanzlei, Anspruchsschreiben, VS-Reaktion, Rüge,
          Stellungnahme, Nachbesichtigung, Klage und Auszahlung — sobald der Fall
          die jeweilige Phase erreicht. Aktueller Status:{' '}
          <code className="text-[10px]">{phase}</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showKanzlei && <KanzleiEakteSection />}
      {showAs && <AsSection />}
      {showVsReaktion && <VsReaktionSection />}
      {showStellungnahme && <StellungnahmeSection />}
      {showRuege && <RuegeSection />}
      {showNachbesichtigung && <NachbesichtigungSection />}
      {showKlage && <KlageSection />}
      {showAuszahlung && <AuszahlungSection />}
    </div>
  )
}
