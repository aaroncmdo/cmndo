import { getDb, type AnalyticsFilter, type DrillDownItem } from './shared'
import { vsBetragAusEmbed } from '@/lib/faelle/claim-payment-read'

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
  // CMM-49 P1: Anker faelle -> claims geflippt (Reader-Repoint Richtung DROP). Daten kamen
  // eh nur aus dem claims-Embed; jetzt direkt aus claims (SSoT). created_at/sv_id claims-
  // direkt (sv_id claims-nativ, CMM-60). gutachten/claim_payments via claims-Embed.
  // `f`/`faelle`-Namen bleiben (= jetzt claims-Zeile).
  let query = db.from('claims')
    .select('id, claim_nummer, created_at, gutachten(gesamt_schadensbetrag, fertiggestellt_am), claim_payments(partei, zahlungseingang_am)')

  if (filter.startDate) query = query.gte('created_at', filter.startDate)
  if (filter.endDate) query = query.lte('created_at', filter.endDate)
  if (filter.svId) query = query.eq('sv_id', filter.svId)

  const { data: faelleRaw } = await query

  // Nur Fälle mit einem Gutachten-Betrag einbeziehen.
  // CMM-49 P1: f ist jetzt die claims-Zeile -> gutachten/claim_payments/claim_nummer direkt auf f.
  const faelle = (faelleRaw ?? []).filter(f => {
    const g = Array.isArray((f as { gutachten?: unknown }).gutachten)
      ? ((f as { gutachten: unknown[] }).gutachten)[0]
      : (f as { gutachten?: unknown }).gutachten
    return (g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag != null
  })
  function getFinanzBetrag(f: typeof faelle[number]): number {
    const g = Array.isArray((f as { gutachten?: unknown }).gutachten)
      ? ((f as { gutachten: unknown[] }).gutachten)[0]
      : (f as { gutachten?: unknown }).gutachten
    return Number((g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag) || 0
  }
  function getFinanzDatum(f: typeof faelle[number]): string | null {
    const g = Array.isArray((f as { gutachten?: unknown }).gutachten)
      ? ((f as { gutachten: unknown[] }).gutachten)[0]
      : (f as { gutachten?: unknown }).gutachten
    // CMM-44 SP-J Bucket A: jüngstes zahlungseingang_am aus claim_payments (1:N).
    const cps = (f as { claim_payments?: unknown }).claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    // Payment-Ledger: nur VS-Eingang zaehlt als Finanz-Datum (kunde/sv sind Auszahlungen).
    const zahlungseingang = cpArr
      .filter(p => (((p as { partei?: string | null })?.partei) ?? 'vs') === 'vs')
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
    label: (f as { claim_nummer?: string | null }).claim_nummer ?? f.id.slice(0, 8),
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

  // SV-Kosten aus claims.lead_preis_netto (Billing-Konsolidierung 2026-07-01, SSoT —
  // processCaseBilling; loest die retirete gutachter_abrechnungen-Tabelle ab). Service-Client
  // (getDb) -> claims-Tabelle direkt (RLS-Bypass; die Definer-View liefert unter service_role 0).
  // fall_id fuer den Drilldown-Link via faelle_claim_bridge (claims.id != fall_id post-CMM-49).
  let svQuery = db.from('claims').select('id, sv_id, lead_preis_netto, lead_preis_berechnet_am, faelle_claim_bridge(fall_id)').not('lead_preis_netto', 'is', null)
  if (filter.startDate) svQuery = svQuery.gte('lead_preis_berechnet_am', filter.startDate)
  if (filter.endDate) svQuery = svQuery.lte('lead_preis_berechnet_am', filter.endDate)
  const { data: svAbr } = await svQuery

  const svKosten = svAbr?.reduce((sum, a) => sum + (Number(a.lead_preis_netto) || 0), 0) ?? 0
  const svDrillDown = (svAbr ?? []).map(a => {
    const bridge = Array.isArray(a.faelle_claim_bridge) ? a.faelle_claim_bridge[0] : a.faelle_claim_bridge
    const fallId = (bridge as { fall_id?: string | null } | null)?.fall_id ?? a.id
    return {
      id: fallId,
      label: `SV-Abr. ${a.lead_preis_berechnet_am ? new Date(a.lead_preis_berechnet_am).toISOString().slice(0, 7) : ''}`,
      betrag: Number(a.lead_preis_netto) || 0,
      link: `/faelle/${fallId}`,
    }
  })

  // Kanzlei-Kosten aus claims.kanzlei_honorar (CMM-61: kanzlei_honorar lebt jetzt
  // claims-nativ; claim-globaler Finanz-Aggregat -> from('claims'), created_at-Filter direkt).
  let kQuery = db.from('claims').select('id, kanzlei_honorar').not('kanzlei_honorar', 'is', null)
  if (filter.startDate) kQuery = kQuery.gte('created_at', filter.startDate)
  if (filter.endDate) kQuery = kQuery.lte('created_at', filter.endDate)
  const { data: kClaims } = await kQuery
  const kanzleiKosten = kClaims?.reduce((sum, c) => sum + (Number(c.kanzlei_honorar) || 0), 0) ?? 0

  // Marketing-Provision aus claims.marketing_provision (CMM-65 Part B: marketing_provision
  // lebt jetzt claims-nativ; claim-globaler Finanz-Aggregat -> from('claims'), created_at-Filter direkt).
  let mQuery = db.from('claims').select('id, marketing_provision').not('marketing_provision', 'is', null)
  if (filter.startDate) mQuery = mQuery.gte('created_at', filter.startDate)
  if (filter.endDate) mQuery = mQuery.lte('created_at', filter.endDate)
  const { data: mClaims } = await mQuery
  const marketingKosten = mClaims?.reduce((sum, c) => sum + (Number(c.marketing_provision) || 0), 0) ?? 0

  return {
    svKosten, kanzleiKosten, marketingKosten,
    gesamt: svKosten + kanzleiKosten + marketingKosten,
    svDrillDown,
    berechnetAus: 'SV: claims.lead_preis_netto | Kanzlei: claims.kanzlei_honorar | Marketing: claims.marketing_provision',
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
  // CMM-49: zahlungseingaenge ist claim-gekeyt — Select + Dedup auf claim_id.
  const { data: eing } = await db.from('zahlungseingaenge').select('id, claim_id, gesamtbetrag')
  const eingBetrag = eing?.reduce((sum, z) => sum + (Number(z.gesamtbetrag) || 0), 0) ?? 0
  const eingIds = [...new Set(eing?.map(z => z.claim_id).filter(Boolean) ?? [])]

  // Erwartet (regulierung_am gesetzt aber keine Zahlung)
  // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT) via Embed.
  // CMM-44 SP-J Bucket A: "keine Zahlung" = keine claim_payments-Row mit
  // zahlungseingang_am. Der .is(zahlung_eingegangen_am, null)-Filter laesst sich
  // nicht auf dem Embed ausdruecken → Zahlungs-Pruefung passiert in JS.
  // CMM-44 SP-I3: regulierung_am lebt auf kanzlei_faelle (1:1). CMM-49 P1: Anker faelle ->
  // claims geflippt (Reader-Repoint Richtung DROP); kanzlei_faelle jetzt via claims-Embed
  // (kanzlei_faelle.claim_id), regulierungs_betrag/created_at/claim_payments top-level auf
  // claims. created_at-Filter claims-direkt; "gesetzt"-Filter (regulierung_am, Zahlung) clientseitig.
  // Payment-Ledger Phase 3 (Collapse): regulierung_betrag aus dem (claim,'vs')-Ledger
  // (Ist-first: erhaltener_betrag ?? forderungsbetrag) statt dem entfallenden claims.regulierungs_betrag-Cache.
  let erwQuery = db.from('claims').select('id, created_at, kanzlei_faelle(regulierung_am), claim_payments(partei, forderungsbetrag, erhaltener_betrag, zahlungseingang_am)')
  if (filter.startDate) erwQuery = erwQuery.gte('created_at', filter.startDate)
  if (filter.endDate) erwQuery = erwQuery.lte('created_at', filter.endDate)
  const { data: erwFaelleRaw } = await erwQuery
  // CMM-49 P1: f ist jetzt die claims-Zeile; der VS-Betrag kommt aus der (claim,'vs')-Ledger-Row.
  const claimBetrag = (f: { claim_payments?: unknown }): number =>
    Number(vsBetragAusEmbed(f?.claim_payments)) || 0
  const hatZahlung = (f: { claim_payments?: unknown }): boolean => {
    const cps = f?.claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    return cpArr.some(p => {
      const pp = p as { partei?: string | null; zahlungseingang_am?: string | null }
      return (pp?.partei ?? 'vs') === 'vs' && !!pp?.zahlungseingang_am
    })
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
