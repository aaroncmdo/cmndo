'use client'

// AAR-164 / W4: Prozess-Tab — 8 Sections phase-dynamisch.
// AAR-543 (C6): Sichtbarkeits-Map aus den Daten-Triggern (vs_kuerzungs_typ,
// Auszahlungs-Split, usw.) — zentral berechnet.
// AAR-745 (Phase A): Wechsel auf section-visibility.ts mit rolle='admin';
// dieselbe Quelle nutzt jetzt auch die SV-Fallakte.

import { useFall } from '../FallContext'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
import { getVisibleFallSections } from '@/lib/fall/section-visibility'
import {
  KanzleiEakteSection,
  AsSection,
  VsReaktionSection,
  StellungnahmeSection,
  RuegeSection,
  NachbesichtigungSection,
  KlageSection,
  AuszahlungSection,
} from '../_prozess/Sections'

export default function ProzessTab({ subphase }: { subphase: SubphaseResult }) {
  const { fall, phase } = useFall()
  const visible = getVisibleFallSections(fall, 'admin', subphase)

  if (visible.length === 0) {
    return (
      <div className="bg-white rounded-ios-xl border border-claimondo-border p-5 space-y-2">
        <h2 className="text-sm font-semibold text-claimondo-navy">Prozess</h2>
        <p className="text-xs text-claimondo-ondo">
          Der Prozess-Tab zeigt Kanzlei, Anspruchsschreiben, VS-Reaktion, Rüge,
          Stellungnahme, Nachbesichtigung, Klage und Auszahlung — sobald der Fall
          die jeweilige Phase erreicht. Aktueller Status:{' '}
          <code className="text-[10px]">{phase}</code> (Subphase {subphase.subphase}).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {visible.includes('kanzlei') && <KanzleiEakteSection />}
      {visible.includes('as') && <AsSection />}
      {visible.includes('vs_reaktion') && <VsReaktionSection />}
      {visible.includes('stellungnahme') && <StellungnahmeSection />}
      {visible.includes('ruege') && <RuegeSection />}
      {visible.includes('nachbesichtigung') && <NachbesichtigungSection />}
      {visible.includes('klage') && <KlageSection />}
      {visible.includes('auszahlung') && <AuszahlungSection />}
    </div>
  )
}
