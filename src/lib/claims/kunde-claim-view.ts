// P0 (Kunde-Detail-Rebuild): EIN konsolidierter Server-Loader → EIN typisiertes ViewModel.
// Ersetzt die 24 verstreuten Loader der alten page.tsx. Nutzt die geteilte Phasen-SSoT
// (getClaimLifecycleForClaim, lifecycle.ts — NICHT v_claim_workstate, das ist 470d55c9-Ops)
// + kunde-only-Loader. Die reine Zonen-/Aufgaben-Ableitung (kunde-zonen.ts) konsumiert dieses
// ViewModel — dort liegt die getestete „vollständig DB-getrieben"-Logik.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getKundeFallDetailRecord } from '@/lib/claims/get-kunde-faelle'
import { getSvKontakt, getKbKontakt, type SvKontakt, type KbKontakt } from '@/lib/kunde/get-kontakt'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import { getKundeTermine, type KundeTermin } from '@/lib/claims/kunde-termine'

export type KundeGutachtenWerte = {
  totalschaden: boolean | null
  reparaturkostenNetto: number | null
  reparaturkostenBrutto: number | null
  minderwert: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  nutzungsausfallTage: number | null
  wiederbeschaffungsdauerTage: number | null
}

export type KundeClaimViewModel = {
  claimId: string
  fallId: string
  fall: Record<string, unknown> // flacher getKundeFallDetailRecord-Record (bestehend)
  lifecycle: ClaimLifecycle
  termine: KundeTermin[]
  team: { kb: KbKontakt | null; sv: SvKontakt | null }
  geld: {
    forderungNetto: number | null
    auszahlungNetto: number | null
    kvaNetto: number | null
    kvaBrutto: number | null
    reparaturdauerTageKva: number | null
    gutachtenWerte: KundeGutachtenWerte | null
  }
  pflichtdokumente: { offen: number }
  flags: {
    abrechnungsweg: string | null
    istReparaturRoute: boolean
    bankdatenOffen: boolean
    gutachtenVerfuegbar: boolean
    reparaturFreigegeben: boolean
  }
}

function num(v: unknown): number | null {
  return v != null ? Number(v) : null
}

export async function getKundeClaimView(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null,
  claimId: string,
): Promise<KundeClaimViewModel | null> {
  const fall = await getKundeFallDetailRecord(admin, userId, userEmail, claimId)
  if (!fall) return null

  const fallId = fall.id as string
  const resolvedClaimId = (fall.claim_id as string | null) ?? claimId

  const [bundle, termine, kb, sv] = await Promise.all([
    getClaimLifecycleForClaim(admin, fallId),
    getKundeTermine(admin, { fallIds: [fallId], claimIds: [resolvedClaimId] }),
    getKbKontakt(admin, (fall.kundenbetreuer_id as string | null) ?? null),
    getSvKontakt(admin, (fall.sv_id as string | null) ?? null),
  ])

  const abrechnungsweg = (fall.abrechnungsweg as string | null) ?? null
  const reparaturFreigegeben = !!fall.reparatur_freigegeben_am
  const mainPhase = bundle.lifecycle.mainPhase
  const istGeldPhase = mainPhase === 'regulierung' || mainPhase === 'abschluss'

  return {
    claimId: resolvedClaimId,
    fallId,
    fall,
    lifecycle: bundle.lifecycle,
    termine,
    team: { kb, sv },
    geld: {
      forderungNetto: num(fall.schadens_hoehe_netto),
      // P1: auszahlungNetto aus faelle_kunde_view beim UI-Wiring nachziehen.
      auszahlungNetto: null,
      kvaNetto: num(fall.kostenvoranschlag_netto),
      kvaBrutto: num(fall.kostenvoranschlag_brutto),
      reparaturdauerTageKva: num(fall.reparaturdauer_tage_kva),
      // P1: gutachtenWerte aus v_gutachten_werte (Dual-Source, 10 F+G-Werte) beim UI-Wiring.
      gutachtenWerte: null,
    },
    // P1: offene Pflichtdok-Anzahl aus getPflichtdokumenteForFall beim UI-Wiring.
    pflichtdokumente: { offen: 0 },
    flags: {
      abrechnungsweg,
      istReparaturRoute: istWerkstattReparaturWeg(abrechnungsweg),
      // bankdatenOffen: Geld-Phase erreicht + noch keine Bankdaten hinterlegt (lifecycle-getrieben).
      bankdatenOffen: istGeldPhase && !fall.bankdaten_hinterlegt_am,
      gutachtenVerfuegbar: !!fall.gutachten_eingegangen_am,
      reparaturFreigegeben,
    },
  }
}
