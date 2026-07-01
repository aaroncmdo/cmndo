import { getDb, type AnalyticsFilter } from './shared'
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'

export type SvPerformance = {
  svId: string
  name: string
  typ: string
  uebernommen: number
  abgelehnt: number
  abgeschlossen: number
  avgBearbeitungsTage: number | null
  umsatz: number
  leadpreisGesamt: number
  fallIds: string[]
}

/**
 * Performance-Metriken pro Sachverständiger.
 * Berechnet aus: gutachter_termine (Übernahme/Ablehnung), faelle (Umsatz), claims.lead_preis_netto (Leadpreis).
 */
export async function getSvPerformanceList(filter?: AnalyticsFilter): Promise<{
  items: SvPerformance[]
  berechnetAus: string
}> {
  const db = getDb()

  // Alle aktiven SVs
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, gutachter_typ, ist_aktiv')
    .eq('ist_aktiv', true)

  if (!svs?.length) return { items: [], berechnetAus: 'sachverstaendige.status=aktiv' }

  // Profile-Namen laden
  const profileIds = svs.map(s => s.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await db.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }
  const nameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—']))

  const items: SvPerformance[] = []

  for (const sv of svs) {
    // Termine
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee
    let terminQuery = db.from('gutachter_termine').select('id, status, fall_id, created_at').eq('assignee_id', sv.id).eq('assignee_typ', 'sachverstaendiger')
    if (filter?.startDate) terminQuery = terminQuery.gte('created_at', filter.startDate)
    if (filter?.endDate) terminQuery = terminQuery.lte('created_at', filter.endDate)
    const { data: termine } = await terminQuery

    const uebernommen = termine?.filter(t => ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgeschlossen'].includes(t.status)).length ?? 0
    const abgelehnt = termine?.filter(t => t.status === 'abgelehnt').length ?? 0

    // Fälle
    // CMM-49 P1: Anker faelle -> claims geflippt (Reader-Repoint Richtung DROP).
    // sv_zugewiesen_am + sv_id leben claims-nativ (CMM-60/SP-B); gutachten via claims-Embed.
    // created_at-Filter claims-direkt. f ist jetzt die claims-Zeile -> claim_id == f.id.
    let fallQuery = db.from('claims').select('id, sv_zugewiesen_am, gutachten(gesamt_schadensbetrag, fertiggestellt_am)').eq('sv_id', sv.id)
    if (filter?.startDate) fallQuery = fallQuery.gte('created_at', filter.startDate)
    if (filter?.endDate) fallQuery = fallQuery.lte('created_at', filter.endDate)
    const { data: faelle } = await fallQuery

    // CMM-49 T1.2: abgeschlossen aus abgeleiteter Phase (v_claim_phase) statt faelle.status.
    // sub_phase 'erfolgreich_reguliert' == altes faelle.status 'abgeschlossen'.
    // CMM-49 P1: claims-Anker -> f.id IST die claim_id.
    const phaseMap = await getClaimPhaseMap(
      (faelle ?? []).map(f => f.id).filter((x): x is string => !!x),
    )
    const abgeschlossen = (faelle ?? []).filter(
      f => f.id && phaseMap.get(f.id)?.subPhase === 'erfolgreich_reguliert',
    ).length
    const umsatz = faelle?.reduce((sum, f) => {
      const g = Array.isArray((f as { gutachten?: unknown }).gutachten)
        ? ((f as { gutachten: unknown[] }).gutachten)[0]
        : (f as { gutachten?: unknown }).gutachten
      return sum + (Number((g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag) || 0)
    }, 0) ?? 0

    // Durchschnittliche Bearbeitungszeit (Zuweisung → Gutachten)
    let totalDays = 0
    let countDays = 0
    for (const f of faelle ?? []) {
      // CMM-49 P1: f ist die claims-Zeile -> sv_zugewiesen_am + gutachten direkt auf f.
      const svZugewiesenAm = (f as { sv_zugewiesen_am?: string | null }).sv_zugewiesen_am ?? null
      const gRaw = (f as { gutachten?: unknown }).gutachten
      const g = Array.isArray(gRaw)
        ? (gRaw as Array<{ fertiggestellt_am: string | null }>)[0] ?? null
        : (gRaw as { fertiggestellt_am: string | null } | null)
      const fertiggestelltAm = g?.fertiggestellt_am ?? null
      if (svZugewiesenAm && fertiggestelltAm) {
        const diff = (new Date(fertiggestelltAm).getTime() - new Date(svZugewiesenAm).getTime()) / (1000 * 60 * 60 * 24)
        totalDays += diff
        countDays++
      }
    }

    // Leadpreis aus claims-SSoT (Billing-Konsolidierung 2026-07-01, processCaseBilling)
    const { data: abr } = await db.from('claims').select('lead_preis_netto').eq('sv_id', sv.id).not('lead_preis_netto', 'is', null)
    const leadpreisGesamt = abr?.reduce((sum, a) => sum + (Number(a.lead_preis_netto) || 0), 0) ?? 0

    items.push({
      svId: sv.id,
      name: sv.profile_id ? (nameMap[sv.profile_id] ?? '—') : '—',
      typ: sv.gutachter_typ ?? 'kfz-gutachter',
      uebernommen,
      abgelehnt,
      abgeschlossen,
      avgBearbeitungsTage: countDays > 0 ? Math.round(totalDays / countDays) : null,
      umsatz,
      leadpreisGesamt,
      fallIds: faelle?.map(f => f.id) ?? [],
    })
  }

  items.sort((a, b) => b.umsatz - a.umsatz)

  return {
    items,
    berechnetAus: 'gutachter_termine (Übernahme/Ablehnung), faelle (Umsatz, Bearbeitungszeit), claims.lead_preis_netto (Leadpreis)',
  }
}
