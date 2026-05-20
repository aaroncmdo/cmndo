import { createAdminClient } from '@/lib/supabase/admin'

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

  // Cluster F+G PR-2b: faelle nur noch für Lifecycle/Honorar-Felder, die F+G-Werte
  // (wiederbeschaffungswert, restwert, nutzungsausfall_tage, reparaturkosten) kommen
  // aus v_gutachten_werte (Single-Source Gutachten-Tabelle nach PR-2b-Drop).
  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag aus dem Select entfernt — war
  // ungenutzt (Dead-Select), kein Reader-Wechsel noetig.
  // CMM-44 SP-B PR2c: schadens_hoehe_netto lebt auf claims (SSoT) — aus dem
  // faelle-Select entfernt, wird unten separat aus claims geladen.
  // CMM-44 SP-G PR2: gutachten_betrag → gutachten.gesamt_schadensbetrag (SSoT).
  // gutachten_betrag aus Select entfernt; Wert kommt unten aus gutachten-Tabelle.
  const { data: fall } = await db.from('faelle')
    .select('claim_id, wertminderung, nutzungsausfall_tagessatz, kanzlei_honorar, marketing_provision, marketing_quelle, zahlung_betrag, zahlung_eingegangen_am, zahlung_erwartet_am, regulierung_am, sv_id')
    .eq('id', fallId)
    .single()

  if (!fall) {
    return emptyFinanzen()
  }

  // F+G-Werte aus v_gutachten_werte + schadens_hoehe_netto aus claims
  // (CMM-44 SP-B PR2c) — beides geht nur wenn claim_id verknüpft ist.
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
  if (fall.claim_id) {
    const [{ data }, { data: claimRow }, { data: gutachtenRow }] = await Promise.all([
      db.from('v_gutachten_werte')
        .select('wiederbeschaffungswert, restwert, reparaturkosten_netto, reparaturkosten_brutto, nutzungsausfall_tage')
        .eq('claim_id', fall.claim_id as string)
        .maybeSingle(),
      db.from('claims')
        .select('schadens_hoehe_netto')
        .eq('id', fall.claim_id as string)
        .maybeSingle(),
      db.from('gutachten')
        .select('gesamt_schadensbetrag')
        .eq('claim_id', fall.claim_id as string)
        .maybeSingle(),
    ])
    gutachtenWerte = data
    schadensHoeheNetto = (claimRow?.schadens_hoehe_netto as number | null) ?? null
    gesamtSchadensbetrag = (gutachtenRow as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag ?? null
  }

  // SV-Abrechnung
  let svHonorar: number | null = null
  let svLeadpreis: number | null = null
  let svPreistyp: string | null = null
  if (fall.sv_id) {
    const { data: abr } = await db.from('gutachter_abrechnungen')
      .select('leadpreis, preistyp')
      .eq('fall_id', fallId)
      .eq('sv_id', fall.sv_id)
      .limit(1)
      .maybeSingle()
    if (abr) {
      svLeadpreis = Number(abr.leadpreis) || null
      svPreistyp = abr.preistyp
      svHonorar = svLeadpreis
    }
  }

  // Forderungspositionen
  const { data: forderungen } = await db.from('forderungspositionen')
    .select('betrag_gefordert')
    .eq('fall_id', fallId)
  const forderungenGesamt = forderungen?.reduce((sum, f) => sum + (Number(f.betrag_gefordert) || 0), 0) ?? null
  const forderungenAnzahl = forderungen?.length ?? 0

  // Zahlungseingaenge
  const { data: zahlungen } = await db.from('zahlungseingaenge')
    .select('gesamtbetrag')
    .eq('fall_id', fallId)
  const zahlungEingegangen = zahlungen?.reduce((sum, z) => sum + (Number(z.gesamtbetrag) || 0), 0) ?? null

  // Nutzungsausfall berechnen — Tage aus Gutachten-View, Tagessatz bleibt auf faelle
  const nutzungsausfallGesamt = (gutachtenWerte?.nutzungsausfall_tage && fall.nutzungsausfall_tagessatz)
    ? Number(gutachtenWerte.nutzungsausfall_tage) * Number(fall.nutzungsausfall_tagessatz)
    : null

  // Schadenhoehe (bester Wert) — schadens_hoehe_netto aus claims (CMM-44 SP-B PR2c),
  // Fallback auf gutachten.gesamt_schadensbetrag (CMM-44 SP-G PR2).
  const schadenhoehe = Number(gesamtSchadensbetrag) || Number(schadensHoeheNetto) || null

  // Kosten
  const kanzleiHonorar = Number(fall.kanzlei_honorar) || null
  const marketingProvision = Number(fall.marketing_provision) || null

  // Netto-Marge
  let nettoMarge: number | null = null
  if (schadenhoehe != null) {
    const kosten = (svHonorar ?? 0) + (kanzleiHonorar ?? 0) + (marketingProvision ?? 0)
    nettoMarge = schadenhoehe - kosten
  }

  // Zahlungs-Status
  // BUG-79 fix: NUR zahlungseingaenge summieren, NICHT + fall.zahlung_betrag (war Doppelzaehlung)
  const eingegangen = zahlungEingegangen ?? (Number(fall.zahlung_betrag) || 0)
  const erwartetDatum = fall.zahlung_erwartet_am ? new Date(fall.zahlung_erwartet_am) : null
  let zahlungStatus: FallFinanzen['zahlungStatus'] = 'offen'
  if (eingegangen > 0 || fall.zahlung_eingegangen_am) {
    zahlungStatus = 'eingegangen'
  } else if (erwartetDatum && erwartetDatum < new Date()) {
    zahlungStatus = 'ueberfaellig'
  } else if (erwartetDatum || fall.regulierung_am) {
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
    wertminderung: Number(fall.wertminderung) || null,
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
    zahlungEingegangenAm: fall.zahlung_eingegangen_am ?? null,
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
