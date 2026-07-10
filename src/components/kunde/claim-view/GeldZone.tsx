// P2/P3 (Kunde-Detail-Rebuild): GeldZone — Forderung/Auszahlung/KVA/Ausfall, konsolidiert.
// „Alles erhalten, nur umbauen" (Aaron 10.07.): wrappt die bestehenden interaktiven Bestands-Cards
// (SaeuleMeinGeld/AuszahlungCard/KostenvoranschlagCard/FiktiveAbrechnungCard/
// KundeAusfallEntschaedigungCard) — Gates + Props 1:1 aus der Live-page.tsx, gespeist aus dem
// ViewModel (vm.geld + vm.fall). Server-Component: reicht die updateZahlungsweg-Action an die
// 'use client'-Card durch (keine eigene Client-Grenze noetig).

import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import KostenvoranschlagCard from '@/components/kunde/KostenvoranschlagCard'
import FiktiveAbrechnungCard from '@/components/kunde/FiktiveAbrechnungCard'
import KundeAusfallEntschaedigungCard from '@/components/kunde/KundeAusfallEntschaedigungCard'
import { updateZahlungsweg } from '@/app/kunde/faelle/[id]/actions'

export function GeldZone({ vm }: { vm: KundeClaimViewModel }) {
  const { geld } = vm
  const gw = geld.gutachtenWerte
  const kvaSichtbar = geld.reparaturWerkstattId != null && (geld.kvaNetto != null || geld.kvaBrutto != null)

  return (
    <div className="space-y-4">
      <SaeuleMeinGeld
        fallId={vm.fallId}
        status={(vm.fall.status as string | null) ?? ''}
        schadens_hoehe_netto={geld.forderungNetto}
        totalschaden={!!vm.fall.totalschaden}
        zahlungsweg={(vm.fall.zahlungsweg as string | null) ?? null}
        onZahlungswegSave={updateZahlungsweg}
        gutachtenWerte={
          gw
            ? {
                reparaturkosten_brutto: gw.reparaturkostenBrutto,
                minderwert: gw.minderwert,
                wiederbeschaffungswert: gw.wiederbeschaffungswert,
                restwert: gw.restwert,
                ocr_processed_at: gw.ocrProcessedAt,
              }
            : null
        }
      />

      {/* AAR-558 (C9): Auszahlungs-Card — nur Netto-Kunden-Anteil (faelle_kunde_view-Row existiert). */}
      {geld.auszahlungCardSichtbar && (
        <AuszahlungCard
          betrag={geld.auszahlungNetto}
          eingegangenAm={geld.auszahlungEingegangenAm}
          zahlungsweg={geld.auszahlungZahlungsweg}
        />
      )}

      {/* KVA-Loop (Kunde-Seite): Kostenvoranschlag-Card — Reparatur-Claim (Werkstatt) mit KVA. */}
      {kvaSichtbar && (
        <KostenvoranschlagCard
          claimId={vm.claimId}
          kostenvoranschlagNetto={geld.kvaNetto}
          kostenvoranschlagBrutto={geld.kvaBrutto}
          freigegebenAm={(vm.fall.reparatur_freigegeben_am as string | null) ?? null}
          pdfUrl={geld.kvaPdfUrl}
          reparaturdauerTage={geld.reparaturdauerTageKva}
        />
      )}

      {/* SP4c: Fiktive-Abrechnung-Card — voraussichtliche Auszahlung auf Gutachten-Basis. */}
      {geld.reparaturwunsch === 'fiktiv' && (
        <FiktiveAbrechnungCard
          reparaturkostenNetto={gw?.reparaturkostenNetto ?? null}
          minderwert={gw?.minderwert ?? null}
          totalschaden={gw?.totalschaden ?? null}
          wiederbeschaffungswert={gw?.wiederbeschaffungswert ?? null}
          restwert={gw?.restwert ?? null}
        />
      )}

      {/* Mietwagen-/Nutzungsausfall-Card (XOR) — Card entscheidet Sichtbarkeit selbst. */}
      {geld.ausfall && <KundeAusfallEntschaedigungCard {...geld.ausfall} />}
    </div>
  )
}
