import { createAdminClient } from '@/lib/supabase/admin'

export type AufsichtRolle = 'dispatch' | 'sachverstaendiger' | 'kanzlei' | 'admin' | 'kunde' | 'unbekannt'

export type SlaRow = {
  id: string
  claim_id: string
  claim_nummer: string
  sla_typ: string
  status: 'pending' | 'breached' | 'completed'
  breach_at: string
  target_rolle: string | null
}

export type SlaRollenLage = {
  proRolle: Array<{
    rolle: AufsichtRolle
    breached: number
    impending: number
    pending: number
    kritischste: Array<{
      claim_id: string
      claim_nummer: string
      sla_typ: string
      ueberfaellig_std: number
    }>
  }>
  gesamt: {
    breached: number
    impending: number
    pending: number
  }
}

export const IMPENDING_FENSTER_STD = 6

const SLA_TYP_ROLLE: Record<string, AufsichtRolle> = {
  gutachter_zuweisung: 'dispatch',
  termin_bestaetigung: 'sachverstaendiger',
  besichtigung: 'sachverstaendiger',
  gutachten_upload: 'sachverstaendiger',
  qc_filmcheck: 'admin',
}

export function rolleForSla(row: Pick<SlaRow, 'sla_typ' | 'target_rolle'>): AufsichtRolle {
  // Priority: target_rolle (as AufsichtRolle) -> SLA_TYP_ROLLE[sla_typ] -> 'unbekannt'
  if (row.target_rolle) {
    const rolle = row.target_rolle as AufsichtRolle
    return rolle
  }
  return SLA_TYP_ROLLE[row.sla_typ] ?? 'unbekannt'
}

export function aggregiereSlaLage(rows: SlaRow[], now: Date): SlaRollenLage {
  // Group by rolle
  const byRolle = new Map<AufsichtRolle, SlaRow[]>()
  const allRows: SlaRow[] = []

  for (const row of rows) {
    const rolle = rolleForSla(row)
    if (!byRolle.has(rolle)) {
      byRolle.set(rolle, [])
    }
    byRolle.get(rolle)!.push(row)
    allRows.push(row)
  }

  // Aggregate per role
  const proRolle = Array.from(byRolle.entries()).map(([rolle, roleRows]) => {
    let breached = 0
    let impending = 0
    let pending = 0

    const allRowsForRole: Array<{
      row: SlaRow
      breachTime: Date
      isBreached: boolean
      isImpending: boolean
    }> = []

    for (const row of roleRows) {
      const breachTime = new Date(row.breach_at)
      const isBreached = row.status === 'breached'
      const hoursUntilBreach = (breachTime.getTime() - now.getTime()) / (1000 * 60 * 60)

      if (isBreached) {
        breached++
      } else if (row.status === 'pending') {
        if (hoursUntilBreach <= 0) {
          // Already breached but status is still pending (shouldn't happen but treat as breach-adjacent)
          breached++
        } else if (hoursUntilBreach <= IMPENDING_FENSTER_STD) {
          impending++
        } else {
          pending++
        }
      }

      allRowsForRole.push({
        row,
        breachTime,
        isBreached,
        isImpending: !isBreached && row.status === 'pending' && hoursUntilBreach <= IMPENDING_FENSTER_STD && hoursUntilBreach > 0,
      })
    }

    // Calculate kritischste: breached + impending, sorted by ueberfaellig_std desc, top 5
    const kritischsteCandidate = allRowsForRole.filter(
      (x) => x.isBreached || x.isImpending
    )

    const kritischste = kritischsteCandidate
      .map((x) => {
        const overdueMsec = now.getTime() - x.breachTime.getTime()
        const ueberfaellig_std = overdueMsec / (1000 * 60 * 60)
        return {
          claim_id: x.row.claim_id,
          claim_nummer: x.row.claim_nummer,
          sla_typ: x.row.sla_typ,
          ueberfaellig_std,
        }
      })
      .sort((a, b) => b.ueberfaellig_std - a.ueberfaellig_std)
      .slice(0, 5)

    return {
      rolle,
      breached,
      impending,
      pending,
      kritischste,
    }
  })

  // Calculate gesamt
  const gesamt = {
    breached: 0,
    impending: 0,
    pending: 0,
  }

  for (const role of proRolle) {
    gesamt.breached += role.breached
    gesamt.impending += role.impending
    gesamt.pending += role.pending
  }

  return {
    proRolle,
    gesamt,
  }
}

export async function ladeSlaRows(): Promise<SlaRow[]> {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('sla_tracking')
    .select('id, claim_id, sla_typ, status, breach_at, target_rolle, claims(claim_nummer)')
    .in('status', ['pending', 'breached'])

  if (error) {
    console.error('Error loading sla_rows:', error)
    return []
  }

  // Normalize nested FK: claims is an array, extract first
  return (data ?? []).map((row: any) => ({
    id: row.id,
    claim_id: row.claim_id,
    claim_nummer: Array.isArray(row.claims) ? row.claims[0]?.claim_nummer : row.claims?.claim_nummer,
    sla_typ: row.sla_typ,
    status: row.status,
    breach_at: row.breach_at,
    target_rolle: row.target_rolle,
  }))
}

export function summarizeSlaRollenLage(lage: SlaRollenLage): string {
  const lines: string[] = []

  lines.push('## SLA-Rollen-Lage')
  lines.push('')
  lines.push(`Gesamt: ${lage.gesamt.breached} überfällig, ${lage.gesamt.impending} bevorstehend, ${lage.gesamt.pending} offen`)
  lines.push('')

  for (const roleEntry of lage.proRolle) {
    lines.push(`### ${roleEntry.rolle}`)
    lines.push(`- Überfällig: ${roleEntry.breached}`)
    lines.push(`- Bevorstehend (<6h): ${roleEntry.impending}`)
    lines.push(`- Offen: ${roleEntry.pending}`)

    if (roleEntry.kritischste.length > 0) {
      lines.push('- Kritischste:')
      for (const item of roleEntry.kritischste) {
        lines.push(
          `  - ${item.claim_nummer} (${item.sla_typ}, ${item.ueberfaellig_std.toFixed(1)}h überfällig)`
        )
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
