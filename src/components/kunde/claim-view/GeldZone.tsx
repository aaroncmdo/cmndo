// P2/P3/P4 (Kunde-Detail-Rebuild): GeldZone — Geld, Reparatur & Regulierung, konsolidiert.
// „Alles erhalten, nur umbauen" (Aaron 10.07.): wrappt die bestehenden interaktiven Bestands-Cards
// 1:1 aus der Live-page.tsx (Gates + Props identisch), gespeist aus dem ViewModel (vm.geld/vm.fall/
// vm.kanzlei/vm.werkstatt). P4 ergaenzt die 6 Sidebar-Karten, die vorher kein Zonen-Home hatten:
// BankdatenBanner, MeineKanzleiCard, KanzleiPfadCard, SchadensfotoUploadCard, WerkstattCard,
// WerkstattFinderCard. Die Zone erscheint (kunde-zonen.ts) sobald eine dieser Karten Inhalt hat —
// so faellt in fruehen Phasen nichts weg (preserve-all).
//
// Server-Component: reicht die Server-Actions (updateZahlungsweg/saveBankdaten) an die
// 'use client'-Cards durch (keine eigene Client-Grenze noetig).

import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import ReparaturKostenCard from '@/components/kunde/ReparaturKostenCard'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import KostenvoranschlagCard from '@/components/kunde/KostenvoranschlagCard'
import FiktiveAbrechnungCard from '@/components/kunde/FiktiveAbrechnungCard'
import KundeAusfallEntschaedigungCard from '@/components/kunde/KundeAusfallEntschaedigungCard'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
import { AuszahlungsartWahlKunde } from '@/app/kunde/faelle/[id]/AuszahlungsartWahlKunde'
import KanzleiPfadCard from '@/components/kunde/KanzleiPfadCard'
import SchadensfotoUploadCard from '@/components/kunde/SchadensfotoUploadCard'
import WerkstattCard from '@/components/kunde/WerkstattCard'
import WerkstattFinderCard from '@/components/kunde/WerkstattFinderCard'
import WerkstattVermittlungHoldingCard from '@/components/kunde/WerkstattVermittlungHoldingCard'
import KaskoTarifCard from '@/components/kunde/KaskoTarifCard'
import KaskoBindungCard from '@/components/kunde/KaskoBindungCard'
import KaskoPruefungCard from '@/components/kunde/KaskoPruefungCard'
import { saveBankdaten, updateZahlungsweg } from '@/app/kunde/faelle/[id]/actions'

export function GeldZone({ vm }: { vm: KundeClaimViewModel }) {
  const { geld, kanzlei, werkstatt, flags } = vm
  const gw = geld.gutachtenWerte
  const kvaSichtbar = geld.reparaturWerkstattId != null && (geld.kvaNetto != null || geld.kvaBrutto != null)

  return (
    <div className="space-y-4">
      {/* Bankdaten-Abfrage — self-gated (nur in Payout-Phasen & noch nicht hinterlegt). Oben als
          actionable CTA. Kritisch fuer die Auszahlung. */}
      <BankdatenBanner
        fallId={vm.fallId}
        status={(vm.fall.status as string | null) ?? ''}
        bankdatenHinterlegt={!!vm.fall.bankdaten_hinterlegt_am}
        saveBankdaten={saveBankdaten}
      />

      {/* ── Reparatur-Strecke (Selbstzahler/Kasko-frei) — nur bei Werkstatt-Reparatur-Weg ─────── */}
      {/* WS3: Schadenfotos — kein SV macht Fotos, der Kunde liefert sie fuer die Werkstatt. */}
      {flags.istReparaturRoute && (
        <SchadensfotoUploadCard claimId={vm.claimId} fotos={werkstatt.schadensfotoUrls.map((url) => ({ url }))} />
      )}
      {/* Werkstatt-Finder — Kunde ohne vermittelte Werkstatt (kanonischer brauchtWerkstattVermittlung-Gate). */}
      {/* Kasko-WB Phase 1: erst Tariffrage, dann Finder; gebunden -> Info, keine Vermittlung. */}
      {flags.kaskoBindungOffen && flags.reparaturPhaseErreicht && <KaskoTarifCard claimId={vm.claimId} />}
      {flags.kaskoGebunden && <KaskoBindungCard claimId={vm.claimId} />}
      {/* Kasko-WB Phase 2 (Soll-Blatt 05.09.): Bindung ungeklaert -> dauerhafte Pruef-Card ueber dem Finder. */}
      {flags.kaskoBindungUngeklaert && flags.reparaturPhaseErreicht && <KaskoPruefungCard claimId={vm.claimId} />}
      {!flags.kaskoBindungOffen && werkstatt.brauchtVermittlung && flags.reparaturPhaseErreicht && <WerkstattFinderCard claimId={vm.claimId} />}
      {/* Werkstatt-Card — bei hinterlegter Werkstatt (+ Reparaturtermin-Status). */}
      {werkstatt.data && <WerkstattCard claimId={vm.claimId} werkstatt={werkstatt.data} termin={werkstatt.reparaturTermin} />}
      {/* R3 (Vermittlungs-Blind-Window): Finder aus (brauchtVermittlung=false, z.B. Dispatch/KB
          brokert schon) UND noch keine Werkstatt zugewiesen → sonst rendert hier NICHTS, obwohl der
          Stepper „Werkstatt" zeigt. Holding-State fuellt die Luecke. */}
      {flags.istReparaturRoute &&
        flags.reparaturPhaseErreicht &&
        !werkstatt.brauchtVermittlung &&
        !werkstatt.data &&
        !flags.kaskoGebunden &&
        !flags.kaskoBindungOffen && <WerkstattVermittlungHoldingCard />}
      {/* KVA-Loop — Reparatur-Claim (Werkstatt) mit hochgeladenem Kostenvoranschlag. */}
      {kvaSichtbar && (
        <KostenvoranschlagCard
          claimId={vm.claimId}
          kostenvoranschlagNetto={geld.kvaNetto}
          kostenvoranschlagBrutto={geld.kvaBrutto}
          freigegebenAm={(vm.fall.reparatur_freigegeben_am as string | null) ?? null}
          pdfUrl={geld.kvaPdfUrl}
          reparaturdauerTage={geld.reparaturdauerTageKva}
          abgelehntAm={geld.kvaAbgelehntAm}
          abgelehntGrund={geld.kvaAbgelehntGrund}
        />
      )}

      {/* ── Geld ─────────────────────────────────────────────────────────────────────────────── */}
      {/* Audit-Fund b2: bei der Reparatur-Route (Kasko/Selbstzahler) gibt es NIE ein Gutachten —
          die Säule zeigte dort „sobald das Gutachten vorliegt…" (falsche Botschaft). R4: die
          Reparatur-Route bekommt stattdessen das Kosten-Framing (was zahlt der Kunde selbst/Kasko). */}
      {vm.flags.istReparaturRoute && (
        <ReparaturKostenCard
          abrechnungsweg={flags.abrechnungsweg}
          kvaNetto={geld.kvaNetto}
          kvaBrutto={geld.kvaBrutto}
          schlussrechnungUrl={werkstatt.schlussrechnungUrl}
        />
      )}
      {!vm.flags.istReparaturRoute && (
      <SaeuleMeinGeld
        fallId={vm.fallId}
        status={(vm.fall.status as string | null) ?? ''}
        schadens_hoehe_netto={geld.forderungNetto}
        totalschaden={!!vm.fall.totalschaden}
        zahlungsweg={(vm.fall.zahlungsweg as string | null) ?? null}
        onZahlungswegSave={updateZahlungsweg}
        svGeprueft={gw?.manuellUeberschrieben ?? false}
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
      )}

      {/* AAR-558 (C9): Auszahlungs-Card — nur Netto-Kunden-Anteil (faelle_kunde_view-Row existiert). */}
      {geld.auszahlungCardSichtbar && (
        <AuszahlungCard betrag={geld.auszahlungNetto} eingegangenAm={geld.auszahlungEingegangenAm} zahlungsweg={geld.auszahlungZahlungsweg} />
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

      {/* Aaron 30.08.: Der Kunde darf seine Abrechnungsart aendern — es ist seine
          Geldentscheidung, und sie kann sich aendern, solange das Gutachten aussteht.
          Bewusst AUCH sichtbar, wenn noch nichts gesetzt ist (dann ist es die Erst-Wahl) und
          im gesperrten Zustand (dann als Anzeige mit Begruendung, statt wortlos zu fehlen). */}
      <div className="rounded-ios-xl border border-claimondo-border bg-white px-4 py-4">
        <p className="text-body-sm font-semibold text-claimondo-navy">Abrechnungsart</p>
        {/* Lesbarkeits-Audit 01.09.: stand auf `text-caption` — das ist der OVERLINE-Token
            (10 px, weight 600, letter-spacing), gedacht fuer Labels wie „AUS GUTACHTEN".
            Fuer einen ganzen Satz ist er die falsche Stufe; gemessen kamen 10 px an. */}
        <p className="text-body-sm text-claimondo-ondo mt-0.5">
          Reparatur in der Werkstatt oder Auszahlung auf Gutachtenbasis.
        </p>
        <AuszahlungsartWahlKunde
          fallId={vm.claimId}
          aktuell={geld.reparaturwunsch}
          gesperrt={geld.auszahlungsartGesperrt}
          gesperrtSeit={geld.auszahlungsartGesperrtSeit}
        />
      </div>

      {/* Mietwagen-/Nutzungsausfall-Card (XOR) — Card entscheidet Sichtbarkeit selbst. */}
      {geld.ausfall && <KundeAusfallEntschaedigungCard {...geld.ausfall} />}

      {/* ── Kanzlei / Regulierung — nur mit Mandat (nicht bei nur_gutachter) ──────────────────── */}
      {/* MeineKanzleiCard self-gated (nur bei Kanzlei-/Ansprechpartner-Verbindung). */}
      {!flags.istNurGutachter && (
        <MeineKanzleiCard
          kanzlei={kanzlei.row}
          ansprechpartner={{
            name: kanzlei.ansprechpartnerName,
            position: null,
            email: kanzlei.ansprechpartnerEmail,
            telefon: kanzlei.ansprechpartnerTelefon,
          }}
          vollmachtSigniertAm={kanzlei.vollmachtSigniertAm}
          uebergebenAm={kanzlei.uebergebenAm}
        />
      )}
      {/* KanzleiPfadCard — Switch je nach kanzlei_wunsch (rendert null ausser bei 'eigene_kanzlei'). */}
      {!flags.istNurGutachter && (
        <KanzleiPfadCard
          claimId={vm.claimId}
          kanzleiWunsch={(kanzlei.wunsch as React.ComponentProps<typeof KanzleiPfadCard>['kanzleiWunsch']) ?? null}
          kanzleiName={kanzlei.ansprechpartnerName}
          kanzleiEmail={kanzlei.ansprechpartnerEmail}
          kanzleiTelefon={kanzlei.ansprechpartnerTelefon}
          kanzleiUebergebenAm={kanzlei.uebergebenAm}
          gutachtenFreigegeben={vm.status.gutachtenFreigegeben}
          gutachtenUrl={kanzlei.gutachtenUrlRaw}
        />
      )}
    </div>
  )
}
