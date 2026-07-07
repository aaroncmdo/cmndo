import { getDb, type AnalyticsFilter } from './shared'

export type ConversionFunnel = {
  leads: { anzahl: number; ids: string[] }
  saUnterschrieben: { anzahl: number; ids: string[] }
  fallErstellt: { anzahl: number; ids: string[] }
  gutachtenErhalten: { anzahl: number; ids: string[] }
  zahlungErhalten: { anzahl: number; ids: string[] }
  dropOff: {
    leadToSa: number
    saToFall: number
    fallToGutachten: number
    gutachtenToZahlung: number
  }
  berechnetAus: string
}

/**
 * Conversion-Funnel Lead → SA → Fall → Gutachten → Zahlung.
 * Berechnet aus: leads + faelle Tabellen.
 */
export async function getConversionFunnel(filter?: AnalyticsFilter): Promise<ConversionFunnel> {
  const db = getDb()

  // Leads
  let leadQuery = db.from('leads').select('id, status, sa_unterschrieben')
  if (filter?.startDate) leadQuery = leadQuery.gte('created_at', filter.startDate)
  if (filter?.endDate) leadQuery = leadQuery.lte('created_at', filter.endDate)
  const { data: leads } = await leadQuery

  const allLeads = leads ?? []
  const saLeads = allLeads.filter(l => l.sa_unterschrieben || l.status === 'umgewandelt')

  // Fälle
  // CMM-49 P1: Anker faelle -> claims geflippt (Reader-Repoint Richtung DROP).
  // Daten kamen eh nur aus dem claims-Embed; jetzt direkt aus claims (SSoT) — kein
  // faelle-Tabellenzugriff mehr. created_at-Filter claims-direkt. gutachten/claim_payments via
  // claims-Embed (gutachten.claim_id / claim_payments.claim_id). `faelle`-Variablenname
  // bleibt (= jetzt claims-Zeile; Funnel zaehlt Faelle = Claims, SSoT).
  let fallQuery = db.from('claims').select('id, gutachten(fertiggestellt_am), claim_payments(partei, zahlungseingang_am)')
  if (filter?.startDate) fallQuery = fallQuery.gte('created_at', filter.startDate)
  if (filter?.endDate) fallQuery = fallQuery.lte('created_at', filter.endDate)
  const { data: faelle } = await fallQuery

  const allFaelle = faelle ?? []
  // CMM-49 P1: f ist jetzt die claims-Zeile -> gutachten/claim_payments direkt auf f.
  const mitGutachten = allFaelle.filter(f => {
    const g = Array.isArray((f as { gutachten?: unknown }).gutachten)
      ? ((f as { gutachten: unknown[] }).gutachten)[0]
      : (f as { gutachten?: unknown }).gutachten
    return !!(g as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am
  })
  // CMM-44 SP-J Bucket A: "mit Zahlung" = es existiert eine claim_payments-Row
  // mit gesetztem zahlungseingang_am (1:N → Array normalisieren).
  const mitZahlung = allFaelle.filter(f => {
    const cps = (f as { claim_payments?: unknown }).claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    // Payment-Ledger: "mit Zahlung" = VS-Eingang (partei='vs'), keine Kunde-/SV-Auszahlung.
    return cpArr.some(p => {
      const pp = p as { partei?: string | null; zahlungseingang_am?: string | null }
      return (pp?.partei ?? 'vs') === 'vs' && !!pp?.zahlungseingang_am
    })
  })

  const leadsCount = allLeads.length
  const saCount = saLeads.length
  const faelleCount = allFaelle.length
  const gutachtenCount = mitGutachten.length
  const zahlungCount = mitZahlung.length

  return {
    leads: { anzahl: leadsCount, ids: allLeads.map(l => l.id) },
    saUnterschrieben: { anzahl: saCount, ids: saLeads.map(l => l.id) },
    fallErstellt: { anzahl: faelleCount, ids: allFaelle.map(f => f.id) },
    gutachtenErhalten: { anzahl: gutachtenCount, ids: mitGutachten.map(f => f.id) },
    zahlungErhalten: { anzahl: zahlungCount, ids: mitZahlung.map(f => f.id) },
    dropOff: {
      leadToSa: leadsCount > 0 ? Math.round((1 - saCount / leadsCount) * 100) : 0,
      saToFall: saCount > 0 ? Math.round((1 - faelleCount / saCount) * 100) : 0,
      fallToGutachten: faelleCount > 0 ? Math.round((1 - gutachtenCount / faelleCount) * 100) : 0,
      gutachtenToZahlung: gutachtenCount > 0 ? Math.round((1 - zahlungCount / gutachtenCount) * 100) : 0,
    },
    berechnetAus: 'leads (sa_unterschrieben, status) + faelle (gutachten.fertiggestellt_am) + claim_payments.zahlungseingang_am',
  }
}
