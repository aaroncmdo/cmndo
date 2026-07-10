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
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { getStorageUrl } from '@/lib/storage/url'

export type KundeGutachtenWerte = {
  totalschaden: boolean | null
  reparaturkostenNetto: number | null
  reparaturkostenBrutto: number | null
  minderwert: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  nutzungsausfallTage: number | null
  wiederbeschaffungsdauerTage: number | null
  // P3 (GeldZone): fuer SaeuleMeinGeld.gutachtenWerte.ocr_processed_at + Ausfall-Card.
  ocrProcessedAt: string | null
  nutzungsausfallTagessatzEur: number | null
  mietwagenTagessatzEur: number | null
}

// P3 (GeldZone): Props-Basis fuer KundeAusfallEntschaedigungCard (Nutzungsausfall/Mietwagen, XOR).
// Spiegelt die page.tsx-lokale `ausfallProps`-Berechnung (mietwagen_* claims-nativ + tagessaetze/
// tage aus v_gutachten_werte).
export type KundeAusfallDaten = {
  totalschaden: boolean | null
  ocrVerarbeitet: boolean
  mietwagenHat: boolean
  mietwagenSeitDatum: string | null
  mietwagenVermieter: string | null
  mietwagenLimitTage: number | null
  mietwagenRechnungVorhanden: boolean
  nutzungsausfallTage: number | null
  wiederbeschaffungsdauerTage: number | null
  nutzungsausfallTagessatzEur: number | null
  mietwagenTagessatzEur: number | null
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
    // P3 (GeldZone): AuszahlungCard — eingegangenAm/zahlungsweg + Sichtbarkeit (faelle_kunde_view-Row).
    auszahlungEingegangenAm: string | null
    auszahlungZahlungsweg: string | null
    auszahlungCardSichtbar: boolean
    kvaNetto: number | null
    kvaBrutto: number | null
    // P3 (GeldZone): KostenvoranschlagCard — signierte PDF-URL + Werkstatt-Gate.
    kvaPdfUrl: string | null
    reparaturWerkstattId: string | null
    reparaturdauerTageKva: number | null
    // P3 (GeldZone): FiktiveAbrechnungCard-Gate (claims.reparaturwunsch === 'fiktiv').
    reparaturwunsch: string | null
    gutachtenWerte: KundeGutachtenWerte | null
    // P3 (GeldZone): KundeAusfallEntschaedigungCard (null wenn keine Gutachten-/claims-Basis).
    ausfall: KundeAusfallDaten | null
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

  const [bundle, termine, kb, sv, payoutRes, gwRes, pflichtSlots, kundeViewRes, claimExtraRes, kvaDocRes] =
    await Promise.all([
      getClaimLifecycleForClaim(admin, fallId),
      getKundeTermine(admin, { fallIds: [fallId], claimIds: [resolvedClaimId] }),
      getKbKontakt(admin, (fall.kundenbetreuer_id as string | null) ?? null),
      getSvKontakt(admin, (fall.sv_id as string | null) ?? null),
      // Netto-Kunden-Auszahlbetrag: kanonische SSoT kanzlei_faelle.vs_quote_betrag_ausgezahlt
      // (Aaron 02.07.); nur_gutachter/direkt-Zahlung -> keine kanzlei_faelle-Row -> null.
      admin
        .from('kanzlei_faelle')
        .select('vs_quote_betrag_ausgezahlt, ausgezahlt_am')
        .eq('fall_id', fallId)
        .maybeSingle(),
      // Gutachten-F+G-Werte aus der Dual-Source-View v_gutachten_werte (P3: +ocr/tagessaetze fuer GeldZone).
      admin
        .from('v_gutachten_werte')
        .select('totalschaden, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, wiederbeschaffungsdauer_tage, gutachten_ocr_processed_at, gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur')
        .eq('claim_id', resolvedClaimId)
        .maybeSingle(),
      getPflichtdokumenteForFall(admin, resolvedClaimId, 'kunde'),
      // P3 (GeldZone): Kunden-Zahlungsweg der Auszahlung (faelle_kunde_view) — Card-Gate = Row existiert.
      admin
        .from('faelle_kunde_view')
        .select('auszahlung_zahlungsweg')
        .eq('id', fallId)
        .maybeSingle(),
      // P3 (GeldZone): claims-native Extras (Reparatur-Route-Gate + Mietwagen fuer die Ausfall-Card).
      admin
        .from('claims')
        .select('reparaturwunsch, reparatur_werkstatt_id, hat_mietwagen, mietwagen_seit_datum, mietwagen_vermieter, mietwagen_limit_tage, mietwagen_rechnung_vorhanden')
        .eq('id', resolvedClaimId)
        .maybeSingle(),
      // P3 (GeldZone): juengstes KVA-PDF (Werkstatt/Kunde laden dokument_typ='kostenvoranschlag' sichtbar_fuer kunde).
      admin
        .from('fall_dokumente')
        .select('storage_path')
        .eq('fall_id', fallId)
        .eq('dokument_typ', 'kostenvoranschlag')
        .is('geloescht_am', null)
        .is('abgelehnt_am', null)
        .order('hochgeladen_am', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const kvaStoragePath = (kvaDocRes.data as { storage_path: string | null } | null)?.storage_path ?? null
  const kvaPdfUrl = kvaStoragePath ? await getStorageUrl(admin, 'fall-dokumente', kvaStoragePath) : null

  const abrechnungsweg = (fall.abrechnungsweg as string | null) ?? null
  const reparaturFreigegeben = !!fall.reparatur_freigegeben_am
  const mainPhase = bundle.lifecycle.mainPhase
  const istGeldPhase = mainPhase === 'regulierung' || mainPhase === 'abschluss'

  const payout = payoutRes.data as { vs_quote_betrag_ausgezahlt: number | null; ausgezahlt_am: string | null } | null
  const kundeView = kundeViewRes.data as { auszahlung_zahlungsweg: string | null } | null
  const claimExtra = claimExtraRes.data as Record<string, unknown> | null
  const gw = gwRes.data as Record<string, unknown> | null
  const gutachtenWerte: KundeGutachtenWerte | null = gw
    ? {
        totalschaden: (gw.totalschaden as boolean | null) ?? null,
        reparaturkostenNetto: num(gw.reparaturkosten_netto),
        reparaturkostenBrutto: num(gw.reparaturkosten_brutto),
        minderwert: num(gw.minderwert),
        wiederbeschaffungswert: num(gw.wiederbeschaffungswert),
        restwert: num(gw.restwert),
        nutzungsausfallTage: num(gw.nutzungsausfall_tage),
        wiederbeschaffungsdauerTage: num(gw.wiederbeschaffungsdauer_tage),
        ocrProcessedAt: (gw.gutachten_ocr_processed_at as string | null) ?? null,
        nutzungsausfallTagessatzEur: num(gw.gutachten_nutzungsausfall_tagessatz_eur),
        mietwagenTagessatzEur: num(gw.gutachten_mietwagen_tagessatz_eur),
      }
    : null
  // Ausfall-Card-Basis (spiegelt page.tsx `ausfallProps`): gerendert sobald claim-/gutachten-Daten
  // existieren; die Card selbst entscheidet Sichtbarkeit (ocrVerarbeitet/Totalschaden/Mietwagen).
  const ausfall: KundeAusfallDaten | null =
    gw || claimExtra
      ? {
          totalschaden: (gw?.totalschaden as boolean | null) ?? null,
          ocrVerarbeitet: !!(gw?.gutachten_ocr_processed_at as string | null),
          mietwagenHat: !!(claimExtra?.hat_mietwagen as boolean | null),
          mietwagenSeitDatum: (claimExtra?.mietwagen_seit_datum as string | null) ?? null,
          mietwagenVermieter: (claimExtra?.mietwagen_vermieter as string | null) ?? null,
          mietwagenLimitTage: num(claimExtra?.mietwagen_limit_tage),
          mietwagenRechnungVorhanden: !!(claimExtra?.mietwagen_rechnung_vorhanden as boolean | null),
          nutzungsausfallTage: num(gw?.nutzungsausfall_tage),
          wiederbeschaffungsdauerTage: num(gw?.wiederbeschaffungsdauer_tage),
          nutzungsausfallTagessatzEur: num(gw?.gutachten_nutzungsausfall_tagessatz_eur),
          mietwagenTagessatzEur: num(gw?.gutachten_mietwagen_tagessatz_eur),
        }
      : null
  const pflichtOffen = pflichtSlots.filter((s) => s.status === 'offen').length

  return {
    claimId: resolvedClaimId,
    fallId,
    fall,
    lifecycle: bundle.lifecycle,
    termine,
    team: { kb, sv },
    geld: {
      forderungNetto: num(fall.schadens_hoehe_netto),
      auszahlungNetto: num(payout?.vs_quote_betrag_ausgezahlt),
      auszahlungEingegangenAm: payout?.ausgezahlt_am ?? null,
      auszahlungZahlungsweg: kundeView?.auszahlung_zahlungsweg ?? null,
      auszahlungCardSichtbar: !!kundeView,
      kvaNetto: num(fall.kostenvoranschlag_netto),
      kvaBrutto: num(fall.kostenvoranschlag_brutto),
      kvaPdfUrl,
      reparaturWerkstattId: (claimExtra?.reparatur_werkstatt_id as string | null) ?? null,
      reparaturdauerTageKva: num(fall.reparaturdauer_tage_kva),
      reparaturwunsch: (claimExtra?.reparaturwunsch as string | null) ?? null,
      gutachtenWerte,
      ausfall,
    },
    pflichtdokumente: { offen: pflichtOffen },
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
