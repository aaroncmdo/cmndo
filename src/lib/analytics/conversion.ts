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
  // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT via embed).
  let fallQuery = db.from('faelle').select('id, zahlung_eingegangen_am, claims:claim_id(gutachten(fertiggestellt_am))')
  if (filter?.startDate) fallQuery = fallQuery.gte('created_at', filter.startDate)
  if (filter?.endDate) fallQuery = fallQuery.lte('created_at', filter.endDate)
  const { data: faelle } = await fallQuery

  const allFaelle = faelle ?? []
  const mitGutachten = allFaelle.filter(f => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    return !!(g as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am
  })
  const mitZahlung = allFaelle.filter(f => f.zahlung_eingegangen_am)

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
    berechnetAus: 'leads (sa_unterschrieben, status) + faelle (gutachten.fertiggestellt_am, zahlung_eingegangen_am)',
  }
}
