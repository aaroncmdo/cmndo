// P3 (Kunde-Detail-Rebuild): DoksTermineZone — Pflichtdokumente + KB-Termin + Gutachten-Download/
// -Weiterleitung + FallDetailSections (Übersicht/Dokumente-Tabs). „Alles erhalten, nur umbauen"
// (Aaron 10.07.): wrappt die Bestands-Komponenten 1:1 aus der Live-page.tsx, gespeist aus
// vm.doks/vm.fall/vm.team. Server-Component (getTranslations); die interaktiven Kinder sind
// 'use client'. Der SV-Begutachtungstermin lebt im ClaimStepper (StatusZone) — hier NUR der
// KB-Beratungstermin (keine Doppel-Card, wie in der Live-page.tsx).

import { getTranslations } from 'next-intl/server'
import { Card } from '@/components/primitives'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import PflichtdokumenteSection from '@/components/fall/PflichtdokumenteSection'
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
import GutachtenPdfButton from '@/components/kunde/GutachtenPdfButton'
import GutachtenWeiterleitungButton from '@/components/kunde/GutachtenWeiterleitungButton'
import FallDetailSections from '@/app/kunde/faelle/[id]/FallDetailSections'
import { BelegePaketCard } from './BelegePaketCard'
import { UnfallskizzeCard } from '@/components/kunde/UnfallskizzeCard'

export async function DoksTermineZone({ vm }: { vm: KundeClaimViewModel }) {
  const t = await getTranslations('kunde.fall')
  const { doks } = vm

  return (
    <div id="doks-termine" className="space-y-4">
      {/* Pflichtdokumente — waehrend QC (Besichtigung/Gutachten, nicht freigegeben) ausgeblendet. */}
      {!doks.qcLaeuft && (
        <PflichtdokumenteSection
          slots={vm.pflichtdokumente.slots}
          fallId={vm.fallId}
          rolle="kunde"
          variant="banner"
        />
      )}

      {/* D2: Die automatisch erzeugte Unfallskizze — als Entwurf, mit Korrekturmoeglichkeit.
          Steht bei den Dokumenten, weil sie genau das wird: ein Beleg im Gutachten. */}
      {vm.unfallskizze && <UnfallskizzeCard claimId={vm.fallId} svg={vm.unfallskizze.svg} />}

      {/* KB-Beratungstermin als eigene Card (SV-Termin lebt im ClaimStepper der StatusZone). */}
      {doks.kbTerminCard && <TerminSectionCard {...doks.kbTerminCard} />}

      {/* Gutachten-Download + Opt-in-Weiterleitung — nur wenn das Gutachten vorliegt. */}
      {vm.flags.gutachtenVerfuegbar && (
        <Card p={4} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-claimondo-navy">{t('gutachtenWeiterleitung.titel')}</p>
            <p className="text-xs text-claimondo-ondo mt-0.5">{t('gutachtenWeiterleitung.text')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GutachtenPdfButton claimId={vm.claimId} />
            <GutachtenWeiterleitungButton fallId={vm.fallId} defaultEmail={vm.defaultEmail} />
          </div>
        </Card>
      )}

      {/* Beleg-Download-Paket — KVA+Schlussrechnung+Fotos (Reparatur) bzw. Gutachten (Normal/SV). */}
      <BelegePaketCard vm={vm} />

      {/* Fall-Details — Übersicht/Dokumente-Tabs (Stammdaten, Kontakte, Download-Liste). */}
      <FallDetailSections
        fall={vm.fall}
        svName={vm.team.sv?.name ?? null}
        dokumente={doks.dokumente}
        aktiverTermin={doks.aktiverTermin}
      />
    </div>
  )
}
