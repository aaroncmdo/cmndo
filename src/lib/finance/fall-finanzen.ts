import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getClaimPayments, type ClaimPaymentRow } from '@/lib/faelle/claim-payments'

export type FallFinanzen = {
  // Umsatz
  schadenhoehe: number | null
  schadens_hoehe_netto: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  reparaturkosten: number | null
  wertminderung: number | null
  nutzungsausfallGesamt: number | null

  // Kosten
  svHonorar: number | null
  svLeadpreis: number | null
  svPreistyp: string | null
  kanzleiHonorar: number | null
  marketingProvision: number | null

  // Marge
  nettoMarge: number | null

  // Zahlungen
  zahlungErwartet: number | null
  zahlungEingegangen: number | null
  zahlungStatus: 'offen' | 'erwartet' | 'eingegangen' | 'ueberfaellig'
  zahlungEingegangenAm: string | null

  // Forderungspositionen
  forderungenGesamt: number | null
  forderungenAnzahl: number
}

/**
 * KFZ-140: Single source of truth für Fall-Finanzen.
 * Wird von Fallakte UND Finance-Tab genutzt.
 */
export async function getFallFinanzen(fallId: string): Promise<FallFinanzen> {
  const db = createAdminClient()

  // CMM-49 Reader-Sweep: claims-direkt via resolveClaimId (faelle-Anker raus, ueberlebt
  // den faelle-DROP). sv_id = claims.sv_id (CMM-60, 0-diff 79/0). regulierung_am via
  // kanzlei_faelle-Embed (kanzlei_faelle.claim_id-FK → claims, 1:1).
  //
  // accept-loss (Aaron 11.06. ratifiziert; prod 0-coverage ueber alle 79 Faelle verifiziert):
  //   wertminderung + nutzungsausfall_tagessatz waren nur faelle-nativ, kein claims/Entity-Home
  //   → Read entfaellt, Werte null (wert-neutral, da prod immer null/0). nutzungsausfallGesamt
  //   faellt damit ebenfalls auf null.
  //
  // Restliche Werte sind bereits claim_id-gekeyt: F+G aus v_gutachten_werte,
  // schadens_hoehe_netto/marketing_provision/kanzlei_honorar aus claims (CMM-44 SP-B /
  // CMM-65 Part B / CMM-61), gutachten.gesamt_schadensbetrag (SP-G), claim_payments (SP-J),
  // forderungspositionen + zahlungseingaenge claim-gekeyt.
  const claimId = await resolveClaimId(db, fallId)
  if (!claimId) {
    return emptyFinanzen()
  }
  const { data: claim } = await db.from('claims')
    .select('sv_id, kanzlei_faelle(regulierung_am)')
    .eq('id', claimId)
    .single()

  if (!claim) {
    return emptyFinanzen()
  }

  // CMM-44 SP-I3: regulierung_am aus dem kanzlei_faelle-Embed (1:1, Array-normalisiert).
  const claimKf = Array.isArray((claim as { kanzlei_faelle?: unknown }).kanzlei_faelle)
    ? (claim as { kanzlei_faelle: unknown[] }).kanzlei_faelle[0]
    : (claim as { kanzlei_faelle?: unknown }).kanzlei_faelle
  const regulierungAm = (claimKf as { regulierung_am?: string | null } | null)?.regulierung_am ?? null

  // F+G-Werte aus v_gutachten_werte + schadens_hoehe_netto aus claims
  // (CMM-44 SP-B PR2c). claimId via resolveClaimId immer gesetzt → unconditional.
  // CMM-44 SP-G PR2: gesamt_schadensbetrag aus gutachten (SSoT) statt faelle.gutachten_betrag.
  let gutachtenWerte: {
    wiederbeschaffungswert: number | null
    restwert: number | null
    reparaturkosten_netto: number | null
    reparaturkosten_brutto: number | null
    nutzungsausfall_tage: number | null
  } | null = null
  let schadensHoeheNetto: number | null = null
  let gesamtSchadensbetrag: number | null = null
  // CMM-65 Part B: marketing_provision lebt jetzt auf claims (SSoT) — aus dem claims-Read.
  let claimMarketingProvision: number | null = null
  // CMM-61: kanzlei_honorar lebt jetzt auf claims (SSoT) — aus dem claims-Read.
  let claimKanzleiHonorar: number | null = null
  // CMM-44 SP-J Bucket A: aktuelle claim_payments-Row (zahlungseingang_am/
  // erhaltener_betrag) — ersetzt die alten faelle.zahlung_*-Reads.
  let currentPayment: ClaimPaymentRow | null = null
  {
    const [{ data }, { data: claimRow }, { data: gutachtenRow }, claimPayment] = await Promise.all([
      db.from('v_gutachten_werte')
        .select('wiederbeschaffungswert, restwert, reparaturkosten_netto, reparaturkosten_brutto, nutzungsausfall_tage')
        .eq('claim_id', claimId)
        .maybeSingle(),
      db.from('claims')
        .select('schadens_hoehe_netto, marketing_provision, kanzlei_honorar')
        .eq('id', claimId)
        .maybeSingle(),
      db.from('gutachten')
        .select('gesamt_schadensbetrag')
        .eq('claim_id', claimId)
        .maybeSingle(),
      getClaimPayments(db, claimId),
    ])
    gutachtenWerte = data
    schadensHoeheNetto = (claimRow?.schadens_hoehe_netto as number | null) ?? null
    claimMarketingProvision = (claimRow?.marketing_provision as number | null) ?? null
    claimKanzleiHonorar = (claimRow?.kanzlei_honorar as number | null) ?? null
    gesamtSchadensbetrag = (gutachtenRow as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag ?? null
    currentPayment = claimPayment.vs
  }

  // SV-Abrechnung
  let svHonorar: number | null = null
  let svLeadpreis: number | null = null
  let svPreistyp: string | null = null
  if (claim.sv_id) {
    // Billing-Konsolidierung 2026-07-01: Leadpreis aus claims-SSoT (lead_preis_netto/-typ,
    // processCaseBilling) statt aus der retireten gutachter_abrechnungen-Tabelle.
    const { data: cLead } = await db.from('claims')
      .select('lead_preis_netto, lead_preis_typ')
      .eq('id', claimId)
      .maybeSingle()
    if (cLead?.lead_preis_netto != null) {
      svLeadpreis = Number(cLead.lead_preis_netto) || null
      svPreistyp = cLead.lead_preis_typ
      svHonorar = svLeadpreis
    }
  }

  // Forderungspositionen
  // CMM-49: forderungspositionen ist claim-gekeyt — Reader auf claimId (immer gesetzt).
  const { data: forderungen } = await db.from('forderungspositionen')
    .select('betrag_gefordert')
    .eq('claim_id', claimId)
  const forderungenGesamt = forderungen?.reduce((sum, f) => sum + (Number(f.betrag_gefordert) || 0), 0) ?? null
  const forderungenAnzahl = forderungen?.length ?? 0

  // Zahlungseingaenge
  // CMM-49: zahlungseingaenge ist claim-gekeyt — Reader auf claimId.
  const { data: zahlungen } = await db.from('zahlungseingaenge')
    .select('gesamtbetrag')
    .eq('claim_id', claimId)
  const zahlungEingegangen = zahlungen?.reduce((sum, z) => sum + (Number(z.gesamtbetrag) || 0), 0) ?? null

  // Nutzungsausfall: nutzungsausfall_tagessatz ist accept-loss (s.o.) → kein Tagessatz mehr,
  // daher kein berechneter Gesamtwert (prod 0-coverage, war ohnehin immer null).
  const nutzungsausfallGesamt: number | null = null

  // Schadenhoehe (bester Wert) — gutachten.gesamt_schadensbetrag (CMM-44 SP-G PR2) hat Vorrang
  // als geprüfter Gutachtenwert; schadens_hoehe_netto aus claims (CMM-44 SP-B PR2c) ist Fallback.
  const schadenhoehe = Number(gesamtSchadensbetrag) || Number(schadensHoeheNetto) || null

  // Kosten
  // CMM-61: kanzlei_honorar aus claims (s.o.), nicht mehr faelle.
  const kanzleiHonorar = Number(claimKanzleiHonorar) || null
  // CMM-65 Part B: marketing_provision aus claims (s.o.), nicht mehr faelle.
  const marketingProvision = Number(claimMarketingProvision) || null

  // Netto-Marge
  let nettoMarge: number | null = null
  if (schadenhoehe != null) {
    const kosten = (svHonorar ?? 0) + (kanzleiHonorar ?? 0) + (marketingProvision ?? 0)
    nettoMarge = schadenhoehe - kosten
  }

  // Zahlungs-Status
  // BUG-79 fix: NUR zahlungseingaenge summieren, NICHT + zahlung_betrag (war Doppelzaehlung)
  // CMM-44 SP-J Bucket A: zahlung_betrag/zahlung_eingegangen_am aus claim_payments.
  const eingegangen = zahlungEingegangen ?? (Number(currentPayment?.erhaltener_betrag) || 0)
  // CMM-44 SP-J Bucket C: zahlung_erwartet_am ist nicht migriert (Phase-6-DROP) —
  // kein Erwartet-Datum mehr verfuegbar, daher faellt der 'ueberfaellig'-Status
  // weg; 'erwartet' wird nur noch ueber regulierung_am abgeleitet.
  let zahlungStatus: FallFinanzen['zahlungStatus'] = 'offen'
  if (eingegangen > 0 || currentPayment?.zahlungseingang_am) {
    zahlungStatus = 'eingegangen'
  } else if (regulierungAm) {
    // CMM-44 SP-I3: regulierung_am aus kanzlei_faelle (s.o.).
    zahlungStatus = 'erwartet'
  }

  // Reparaturkosten: bevorzugt netto (kann je nach Mwst-Pflicht relevanter sein), Fallback brutto
  const reparaturkostenView = gutachtenWerte?.reparaturkosten_netto ?? gutachtenWerte?.reparaturkosten_brutto ?? null

  return {
    schadenhoehe,
    schadens_hoehe_netto: Number(schadensHoeheNetto) || null,
    wiederbeschaffungswert: Number(gutachtenWerte?.wiederbeschaffungswert) || null,
    restwert: Number(gutachtenWerte?.restwert) || null,
    reparaturkosten: Number(reparaturkostenView) || null,
    // accept-loss (s.o.): wertminderung war faelle-nativ, prod 0-coverage → null.
    wertminderung: null,
    nutzungsausfallGesamt,
    svHonorar,
    svLeadpreis,
    svPreistyp,
    kanzleiHonorar,
    marketingProvision,
    nettoMarge,
    zahlungErwartet: forderungenGesamt,
    zahlungEingegangen: eingegangen > 0 ? eingegangen : null,
    zahlungStatus,
    zahlungEingegangenAm: currentPayment?.zahlungseingang_am ?? null,
    forderungenGesamt: forderungenGesamt && forderungenGesamt > 0 ? forderungenGesamt : null,
    forderungenAnzahl,
  }
}

function emptyFinanzen(): FallFinanzen {
  return {
    schadenhoehe: null, schadens_hoehe_netto: null, wiederbeschaffungswert: null,
    restwert: null, reparaturkosten: null, wertminderung: null, nutzungsausfallGesamt: null,
    svHonorar: null, svLeadpreis: null, svPreistyp: null, kanzleiHonorar: null, marketingProvision: null,
    nettoMarge: null, zahlungErwartet: null, zahlungEingegangen: null,
    zahlungStatus: 'offen', zahlungEingegangenAm: null, forderungenGesamt: null, forderungenAnzahl: 0,
  }
}
