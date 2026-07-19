// P0 (Kunde-Detail-Rebuild): EIN Kunde-Termin-Loader, der die SV-Begutachtungstermine
// (gutachter_termine, fall_id-verankert — claim_id ist dort meist NULL) UND die
// Werkstatt-Reparaturtermine (reparatur_termine, claim_id-verankert) vereint. Behebt den
// Gap, dass Selbstzahler/Kasko-Kunden ihren Reparaturtermin nirgends sahen. Diskriminiert
// per `art`; nach `start` absteigend sortiert. Nur READS (Termin-Lifecycle bleibt 6c630247).
//
// Termine-Hub (17.07.): bezug-aware Filter (bezugInExpr — .in-Variante, skaliert kompakt) statt
// naivem .in('fall_id') -> bezug-native Termine sichtbar; nachbesichtigung_* im Select; Typ-
// Ableitung + Nachbesichtigung-Split via deriveKundeTerminEntries. Rueckgabe = KundeTerminEntry[].

import type { SupabaseClient } from '@supabase/supabase-js'
import { bezugInExpr } from '@/lib/termine/bezug-filter'
import { deriveKundeTerminEntries, type KundeTerminEntry, type SvTerminRow } from './kunde-termin-entries'

export type { KundeTerminEntry } from './kunde-termin-entries'
// Backward-compat: bestehende Consumer (z.B. kunde-claim-view) importieren `KundeTermin`.
export type KundeTermin = KundeTerminEntry

type Ids = { fallIds: string[]; claimIds: string[] }

// SV-Status, die serverseitig ausgeschlossen werden (superseded/abgesagt) — parity zur
// bestehenden kunde/termine-Page.
const SV_AUSGESCHLOSSEN = '(verschoben,verlegt,storniert,abgesagt)'

export async function getKundeTermine(
  admin: SupabaseClient,
  { fallIds, claimIds }: Ids,
): Promise<KundeTerminEntry[]> {
  if (fallIds.length === 0 && claimIds.length === 0) return []

  const [svRes, repRes] = await Promise.all([
    fallIds.length > 0
      ? admin
          .from('gutachter_termine')
          .select('id, start_zeit, status, typ, kanal, fall_id, claim_id, nachbesichtigung_status, nachbesichtigung_termin_datum')
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

  const sv: KundeTerminEntry[] = ((svRes.data ?? []) as SvTerminRow[]).flatMap(deriveKundeTerminEntries)

  const rep: KundeTerminEntry[] = ((repRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    art: 'reparatur',
    terminTyp: 'reparatur',
    start: (r.bestaetigter_termin as string | null) ?? (r.wunschtermin as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    claim_id: (r.claim_id as string | null) ?? null,
    fall_id: null,
    kanal: null,
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
