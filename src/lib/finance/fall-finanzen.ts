import { createAdminClient } from '@/lib/supabase/admin'

export type FallFinanzen = {
  // Umsatz
  schadenhoehe: number | null
  schadenhoehe_netto: number | null
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

  // Fall-Daten
  const { data: fall } = await db.from('faelle')
    .select('gutachten_betrag, schadenhoehe_netto, wiederbeschaffungswert, restwert, reparaturkosten, wertminderung, nutzungsausfall_tage, nutzungsausfall_tagessatz, kanzlei_honorar, marketing_provision, marketing_quelle, zahlung_betrag, zahlung_eingegangen_am, zahlung_erwartet_am, regulierung_betrag, regulierung_am, sv_id')
    .eq('id', fallId)
    .single()

  if (!fall) {
    return emptyFinanzen()
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
    .select('betrag')
    .eq('fall_id', fallId)
  const forderungenGesamt = forderungen?.reduce((sum, f) => sum + (Number(f.betrag) || 0), 0) ?? null
  const forderungenAnzahl = forderungen?.length ?? 0

  // Zahlungseingaenge
  const { data: zahlungen } = await db.from('zahlungseingaenge')
    .select('betrag')
    .eq('fall_id', fallId)
  const zahlungEingegangen = zahlungen?.reduce((sum, z) => sum + (Number(z.betrag) || 0), 0) ?? null

  // Nutzungsausfall berechnen
  const nutzungsausfallGesamt = (fall.nutzungsausfall_tage && fall.nutzungsausfall_tagessatz)
    ? Number(fall.nutzungsausfall_tage) * Number(fall.nutzungsausfall_tagessatz)
    : null

  // Schadenhoehe (bester Wert)
  const schadenhoehe = Number(fall.gutachten_betrag) || Number(fall.schadenhoehe_netto) || null

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
  const eingegangen = (zahlungEingegangen ?? 0) + (Number(fall.zahlung_betrag) || 0)
  const erwartetDatum = fall.zahlung_erwartet_am ? new Date(fall.zahlung_erwartet_am) : null
  let zahlungStatus: FallFinanzen['zahlungStatus'] = 'offen'
  if (eingegangen > 0 || fall.zahlung_eingegangen_am) {
    zahlungStatus = 'eingegangen'
  } else if (erwartetDatum && erwartetDatum < new Date()) {
    zahlungStatus = 'ueberfaellig'
  } else if (erwartetDatum || fall.regulierung_am) {
    zahlungStatus = 'erwartet'
  }

  return {
    schadenhoehe,
    schadenhoehe_netto: Number(fall.schadenhoehe_netto) || null,
    wiederbeschaffungswert: Number(fall.wiederbeschaffungswert) || null,
    restwert: Number(fall.restwert) || null,
    reparaturkosten: Number(fall.reparaturkosten) || null,
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
    schadenhoehe: null, schadenhoehe_netto: null, wiederbeschaffungswert: null,
    restwert: null, reparaturkosten: null, wertminderung: null, nutzungsausfallGesamt: null,
    svHonorar: null, svLeadpreis: null, svPreistyp: null, kanzleiHonorar: null, marketingProvision: null,
    nettoMarge: null, zahlungErwartet: null, zahlungEingegangen: null,
    zahlungStatus: 'offen', zahlungEingegangenAm: null, forderungenGesamt: null, forderungenAnzahl: 0,
  }
}
