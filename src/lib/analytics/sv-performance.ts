import { getDb, type AnalyticsFilter } from './shared'

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
 * Berechnet aus: gutachter_termine (Übernahme/Ablehnung), faelle (Umsatz), gutachter_abrechnungen (Leadpreis).
 */
export async function getSvPerformanceList(filter?: AnalyticsFilter): Promise<{
  items: SvPerformance[]
  berechnetAus: string
}> {
  const db = getDb()

  // Alle aktiven SVs
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, gutachter_typ, status')
    .eq('status', 'aktiv')

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
    let terminQuery = db.from('gutachter_termine').select('id, status, fall_id, created_at').eq('sv_id', sv.id)
    if (filter?.startDate) terminQuery = terminQuery.gte('created_at', filter.startDate)
    if (filter?.endDate) terminQuery = terminQuery.lte('created_at', filter.endDate)
    const { data: termine } = await terminQuery

    const uebernommen = termine?.filter(t => ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgeschlossen'].includes(t.status)).length ?? 0
    const abgelehnt = termine?.filter(t => t.status === 'abgelehnt').length ?? 0

    // Fälle
    // CMM-44 SP-B PR2a: sv_zugewiesen_am lebt auf claims (SSoT) — via claims-Embed.
    let fallQuery = db.from('faelle').select('id, claim_id, gutachten_betrag, status, gutachten_eingegangen_am, claims:claim_id(sv_zugewiesen_am)').eq('sv_id', sv.id)
    if (filter?.startDate) fallQuery = fallQuery.gte('created_at', filter.startDate)
    if (filter?.endDate) fallQuery = fallQuery.lte('created_at', filter.endDate)
    const { data: faelle } = await fallQuery

    const abgeschlossen = faelle?.filter(f => f.status === 'abgeschlossen').length ?? 0
    const umsatz = faelle?.reduce((sum, f) => sum + (Number(f.gutachten_betrag) || 0), 0) ?? 0

    // Durchschnittliche Bearbeitungszeit (Zuweisung → Gutachten)
    let totalDays = 0
    let countDays = 0
    for (const f of faelle ?? []) {
      const fClaimRaw = (f as { claims?: unknown }).claims ?? null
      const fClaim = Array.isArray(fClaimRaw)
        ? (fClaimRaw as Array<{ sv_zugewiesen_am: string | null }>)[0] ?? null
        : (fClaimRaw as { sv_zugewiesen_am: string | null } | null)
      const svZugewiesenAm = fClaim?.sv_zugewiesen_am ?? null
      if (svZugewiesenAm && f.gutachten_eingegangen_am) {
        const diff = (new Date(f.gutachten_eingegangen_am).getTime() - new Date(svZugewiesenAm).getTime()) / (1000 * 60 * 60 * 24)
        totalDays += diff
        countDays++
      }
    }

    // Leadpreis
    const { data: abr } = await db.from('gutachter_abrechnungen').select('leadpreis').eq('sv_id', sv.id)
    const leadpreisGesamt = abr?.reduce((sum, a) => sum + (Number(a.leadpreis) || 0), 0) ?? 0

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
    berechnetAus: 'gutachter_termine (Übernahme/Ablehnung), faelle (Umsatz, Bearbeitungszeit), gutachter_abrechnungen (Leadpreis)',
  }
}
