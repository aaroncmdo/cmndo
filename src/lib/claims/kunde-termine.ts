// P0 (Kunde-Detail-Rebuild): EIN Kunde-Termin-Loader, der die SV-Begutachtungstermine
// (gutachter_termine, fall_id-verankert — claim_id ist dort meist NULL) UND die
// Werkstatt-Reparaturtermine (reparatur_termine, claim_id-verankert) vereint. Behebt den
// Gap, dass Selbstzahler/Kasko-Kunden ihren Reparaturtermin nirgends sahen. Diskriminiert
// per `art`; nach `start` absteigend sortiert. Nur READS (Termin-Lifecycle bleibt 6c630247).

import type { SupabaseClient } from '@supabase/supabase-js'
import { bezugInExpr } from '@/lib/termine/bezug-filter'

export type KundeTermin = {
  id: string
  art: 'sv' | 'reparatur'
  start: string | null // ISO; SV: start_zeit, Reparatur: bestaetigter_termin ?? wunschtermin
  status: string | null
  claim_id: string | null
  fall_id?: string | null
  // SV-only
  kanal?: string | null
  typ?: string | null
  // Reparatur-only
  werkstatt_id?: string | null
}

type Ids = { fallIds: string[]; claimIds: string[] }

// SV-Status, die serverseitig ausgeschlossen werden (superseded/abgesagt) — parity zur
// bestehenden kunde/termine-Page.
const SV_AUSGESCHLOSSEN = '(verschoben,verlegt,storniert,abgesagt)'

export async function getKundeTermine(
  admin: SupabaseClient,
  { fallIds, claimIds }: Ids,
): Promise<KundeTermin[]> {
  if (fallIds.length === 0 && claimIds.length === 0) return []

  const [svRes, repRes] = await Promise.all([
    fallIds.length > 0
      ? admin
          .from('gutachter_termine')
          .select('id, start_zeit, status, typ, kanal, fall_id, claim_id')
          .or(bezugInExpr('fall', fallIds))
          .is('cancelled_at', null)
          .not('status', 'in', SV_AUSGESCHLOSSEN)
          .order('start_zeit', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    claimIds.length > 0
      ? admin
          .from('reparatur_termine')
          .select('id, status, wunschtermin, bestaetigter_termin, claim_id, werkstatt_id')
          .in('claim_id', claimIds)
          .neq('status', 'storniert')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const sv: KundeTermin[] = ((svRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    art: 'sv',
    start: (r.start_zeit as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    claim_id: (r.claim_id as string | null) ?? null,
    fall_id: (r.fall_id as string | null) ?? null,
    kanal: (r.kanal as string | null) ?? null,
    typ: (r.typ as string | null) ?? null,
  }))

  const rep: KundeTermin[] = ((repRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    art: 'reparatur',
    start: (r.bestaetigter_termin as string | null) ?? (r.wunschtermin as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    claim_id: (r.claim_id as string | null) ?? null,
    werkstatt_id: (r.werkstatt_id as string | null) ?? null,
  }))

  // Nach start absteigend (nulls last).
  return [...sv, ...rep].sort((a, b) => {
    if (a.start === b.start) return 0
    if (a.start == null) return 1
    if (b.start == null) return -1
    return a.start < b.start ? 1 : -1
  })
}
