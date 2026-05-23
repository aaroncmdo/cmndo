import { getDb, type AnalyticsFilter, type DrillDownItem } from './shared'

/**
 * Umsatz für einen Zeitraum.
 * Berechnet aus: gutachten_betrag aus faelle mit zahlung_eingegangen_am oder gutachten_eingegangen_am im Zeitraum.
 */
export async function getUmsatz(filter: AnalyticsFilter): Promise<{
  betrag: number
  anzahl: number
  fallIds: string[]
  drillDown: DrillDownItem[]
  berechnetAus: string
}> {
  const db = getDb()
  // CMM-44 SP-G PR2: gutachten_betrag/gutachten_eingegangen_am → gutachten.gesamt_schadensbetrag/fertiggestellt_am (SSoT).
  // CMM-44 SP-J Bucket A: zahlung_eingegangen_am → claim_payments.zahlungseingang_am via Nested-Embed.
  let query = db.from('faelle')
    .select('id, claims:claim_id(claim_nummer, gutachten(gesamt_schadensbetrag, fertiggestellt_am), claim_payments(zahlungseingang_am))')

  if (filter.startDate) query = query.gte('created_at', filter.startDate)
  if (filter.endDate) query = query.lte('created_at', filter.endDate)
  if (filter.svId) query = query.eq('sv_id', filter.svId)

  const { data: faelleRaw } = await query

  // Nur Fälle mit einem Gutachten-Betrag einbeziehen.
  const faelle = (faelleRaw ?? []).filter(f => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    return (g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag != null
  })
  function getFinanzBetrag(f: typeof faelle[number]): number {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    return Number((g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag) || 0
  }
  function getFinanzDatum(f: typeof faelle[number]): string | null {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    // CMM-44 SP-J Bucket A: jüngstes zahlungseingang_am aus claim_payments (1:N).
    const cps = (c as { claim_payments?: unknown } | null)?.claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    const zahlungseingang = cpArr
      .map(p => (p as { zahlungseingang_am?: string | null })?.zahlungseingang_am)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null
    return zahlungseingang ?? (g as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am ?? null
  }
  const betrag = faelle.reduce((sum, f) => sum + getFinanzBetrag(f), 0)
  const fallIds = faelle.map(f => f.id)
  const drillDown = faelle.map(f => ({
    id: f.id,
    label: (Array.isArray(f.claims) ? f.claims[0] : f.claims)?.claim_nummer ?? f.id.slice(0, 8),
    betrag: getFinanzBetrag(f),
    datum: getFinanzDatum(f) ?? undefined,
    link: `/faelle/${f.id}`,
  }))

  return {
    betrag, anzahl: fallIds.length, fallIds, drillDown,
    berechnetAus: 'Summe gutachten.gesamt_schadensbetrag (nicht NULL)',
  }
}

/**
 * Kosten-Aufschlüsselung für einen Zeitraum.
 */
export async function getKosten(filter: AnalyticsFilter): Promise<{
  svKosten: number
  kanzleiKosten: number
  marketingKosten: number
  gesamt: number
  svDrillDown: DrillDownItem[]
  berechnetAus: string
}> {
  const db = getDb()

  // SV-Kosten aus gutachter_abrechnungen
  let svQuery = db.from('gutachter_abrechnungen').select('id, fall_id, sv_id, leadpreis, monat')
  if (filter.startDate) svQuery = svQuery.gte('created_at', filter.startDate)
  if (filter.endDate) svQuery = svQuery.lte('created_at', filter.endDate)
  const { data: svAbr } = await svQuery

  const svKosten = svAbr?.reduce((sum, a) => sum + (Number(a.leadpreis) || 0), 0) ?? 0
  const svDrillDown = (svAbr ?? []).map(a => ({
    id: a.fall_id ?? a.id,
    label: `SV-Abr. ${a.monat ?? ''}`,
    betrag: Number(a.leadpreis) || 0,
    link: a.fall_id ? `/faelle/${a.fall_id}` : undefined,
  }))

  // Kanzlei-Kosten aus faelle.kanzlei_honorar
  let kQuery = db.from('faelle').select('id, kanzlei_honorar').not('kanzlei_honorar', 'is', null)
  if (filter.startDate) kQuery = kQuery.gte('created_at', filter.startDate)
  if (filter.endDate) kQuery = kQuery.lte('created_at', filter.endDate)
  const { data: kFaelle } = await kQuery
  const kanzleiKosten = kFaelle?.reduce((sum, f) => sum + (Number(f.kanzlei_honorar) || 0), 0) ?? 0

  // Marketing-Provision aus faelle.marketing_provision
  let mQuery = db.from('faelle').select('id, marketing_provision').not('marketing_provision', 'is', null)
  if (filter.startDate) mQuery = mQuery.gte('created_at', filter.startDate)
  if (filter.endDate) mQuery = mQuery.lte('created_at', filter.endDate)
  const { data: mFaelle } = await mQuery
  const marketingKosten = mFaelle?.reduce((sum, f) => sum + (Number(f.marketing_provision) || 0), 0) ?? 0

  return {
    svKosten, kanzleiKosten, marketingKosten,
    gesamt: svKosten + kanzleiKosten + marketingKosten,
    svDrillDown,
    berechnetAus: 'SV: gutachter_abrechnungen.leadpreis | Kanzlei: faelle.kanzlei_honorar | Marketing: faelle.marketing_provision',
  }
}

/**
 * Cash-Flow Status: Erwartet vs Eingegangen vs Überfällig.
 */
export async function getCashFlow(filter: AnalyticsFilter): Promise<{
  erwartet: { betrag: number; anzahl: number; fallIds: string[] }
  eingegangen: { betrag: number; anzahl: number; fallIds: string[] }
  ueberfaellig: { betrag: number; anzahl: number; fallIds: string[] }
  berechnetAus: string
}> {
  const db = getDb()

  // Eingegangen
  const { data: eing } = await db.from('zahlungseingaenge').select('id, fall_id, gesamtbetrag')
  const eingBetrag = eing?.reduce((sum, z) => sum + (Number(z.gesamtbetrag) || 0), 0) ?? 0
  const eingIds = [...new Set(eing?.map(z => z.fall_id).filter(Boolean) ?? [])]

  // Erwartet (regulierung_am gesetzt aber keine Zahlung)
  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT) via Embed.
  // CMM-44 SP-J Bucket A: "keine Zahlung" = keine claim_payments-Row mit
  // zahlungseingang_am. Der .is(zahlung_eingegangen_am, null)-Filter laesst sich
  // nicht auf dem Embed ausdruecken → Zahlungs-Pruefung passiert in JS.
  // CMM-44 SP-I3: regulierung_am lebt auf kanzlei_faelle (1:1). Weil
  // claim_payments NICHT in v_faelle_mit_aktuellem_termin steckt (und hier
  // gebraucht wird), bleibt from('faelle') stehen; regulierung_am kommt via
  // top-level kanzlei_faelle-Embed und der "gesetzt"-Filter laeuft clientseitig.
  let erwQuery = db.from('faelle').select('id, kanzlei_faelle(regulierung_am), claims:claim_id(regulierungs_betrag, claim_payments(zahlungseingang_am))')
  if (filter.startDate) erwQuery = erwQuery.gte('created_at', filter.startDate)
  if (filter.endDate) erwQuery = erwQuery.lte('created_at', filter.endDate)
  const { data: erwFaelleRaw } = await erwQuery
  const claimBetrag = (f: { claims: unknown }): number => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return Number((c as { regulierungs_betrag?: number | null } | null)?.regulierungs_betrag) || 0
  }
  const hatZahlung = (f: { claims: unknown }): boolean => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    const cps = (c as { claim_payments?: unknown } | null)?.claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    return cpArr.some(p => !!(p as { zahlungseingang_am?: string | null })?.zahlungseingang_am)
  }
  // CMM-44 SP-I3: regulierung_am aus dem kanzlei_faelle-Embed (1:1, Array-normalisiert).
  const hatReguliert = (f: { kanzlei_faelle: unknown }): boolean => {
    const kf = Array.isArray(f.kanzlei_faelle) ? f.kanzlei_faelle[0] : f.kanzlei_faelle
    return !!(kf as { regulierung_am?: string | null } | null)?.regulierung_am
  }
  const erwFaelle = (erwFaelleRaw ?? []).filter(f => hatReguliert(f) && !hatZahlung(f))
  const erwBetrag = erwFaelle.reduce((sum, f) => sum + claimBetrag(f), 0)

  // Überfällig: hing an faelle.zahlung_erwartet_am.
  // CMM-44 SP-J Bucket C: zahlung_erwartet_am ist nicht migriert (Phase-6-DROP)
  // und damit nicht mehr ableitbar (pre-launch 0-cov). Bucket bleibt leer, bis
  // ein Faelligkeits-Signal auf claims/claim_payments existiert.
  const uebFaelle: { id: string }[] = []
  const uebBetrag = 0

  return {
    erwartet: { betrag: erwBetrag, anzahl: erwFaelle.length, fallIds: erwFaelle.map(f => f.id) },
    eingegangen: { betrag: eingBetrag, anzahl: eingIds.length, fallIds: eingIds as string[] },
    ueberfaellig: { betrag: uebBetrag, anzahl: uebFaelle.length, fallIds: uebFaelle.map(f => f.id) },
    berechnetAus: 'Eingegangen: zahlungseingaenge.betrag | Erwartet: regulierung_am gesetzt ohne claim_payments-Eingang | Überfällig: deaktiviert (zahlung_erwartet_am Phase-6-DROP)',
  }
}
