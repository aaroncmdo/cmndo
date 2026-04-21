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
  let query = db.from('faelle')
    .select('id, fall_nummer, gutachten_betrag, zahlung_eingegangen_am, gutachten_eingegangen_am')
    .not('gutachten_betrag', 'is', null)

  if (filter.startDate) query = query.gte('created_at', filter.startDate)
  if (filter.endDate) query = query.lte('created_at', filter.endDate)
  if (filter.svId) query = query.eq('sv_id', filter.svId)

  const { data: faelle } = await query

  const betrag = faelle?.reduce((sum, f) => sum + (Number(f.gutachten_betrag) || 0), 0) ?? 0
  const fallIds = faelle?.map(f => f.id) ?? []
  const drillDown = (faelle ?? []).map(f => ({
    id: f.id,
    label: f.fall_nummer ?? f.id.slice(0, 8),
    betrag: Number(f.gutachten_betrag) || 0,
    datum: f.zahlung_eingegangen_am ?? f.gutachten_eingegangen_am,
    link: `/faelle/${f.id}`,
  }))

  return {
    betrag, anzahl: fallIds.length, fallIds, drillDown,
    berechnetAus: 'Summe faelle.gutachten_betrag (nicht NULL)',
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
  let kQuery = db.from('faelle').select('id, fall_nummer, kanzlei_honorar').not('kanzlei_honorar', 'is', null)
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
  const now = new Date().toISOString()

  // Eingegangen
  const { data: eing } = await db.from('zahlungseingaenge').select('id, fall_id, gesamtbetrag')
  const eingBetrag = eing?.reduce((sum, z) => sum + (Number(z.gesamtbetrag) || 0), 0) ?? 0
  const eingIds = [...new Set(eing?.map(z => z.fall_id).filter(Boolean) ?? [])]

  // Erwartet (regulierung_am gesetzt aber keine Zahlung)
  let erwQuery = db.from('faelle').select('id, regulierung_betrag')
    .not('regulierung_am', 'is', null)
    .is('zahlung_eingegangen_am', null)
  if (filter.startDate) erwQuery = erwQuery.gte('created_at', filter.startDate)
  if (filter.endDate) erwQuery = erwQuery.lte('created_at', filter.endDate)
  const { data: erwFaelle } = await erwQuery
  const erwBetrag = erwFaelle?.reduce((sum, f) => sum + (Number(f.regulierung_betrag) || 0), 0) ?? 0

  // Überfällig (zahlung_erwartet_am < now, keine Zahlung)
  const { data: uebFaelle } = await db.from('faelle').select('id, regulierung_betrag')
    .lt('zahlung_erwartet_am', now)
    .is('zahlung_eingegangen_am', null)
  const uebBetrag = uebFaelle?.reduce((sum, f) => sum + (Number(f.regulierung_betrag) || 0), 0) ?? 0

  return {
    erwartet: { betrag: erwBetrag, anzahl: erwFaelle?.length ?? 0, fallIds: erwFaelle?.map(f => f.id) ?? [] },
    eingegangen: { betrag: eingBetrag, anzahl: eingIds.length, fallIds: eingIds as string[] },
    ueberfaellig: { betrag: uebBetrag, anzahl: uebFaelle?.length ?? 0, fallIds: uebFaelle?.map(f => f.id) ?? [] },
    berechnetAus: 'Eingegangen: zahlungseingaenge.betrag | Erwartet: faelle mit regulierung_am ohne zahlung | Überfällig: zahlung_erwartet_am < now',
  }
}
