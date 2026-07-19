// Same-Row-Nachbesichtigung: eine gutachter_termine-Zeile -> Besichtigung (+ ggf. Nachbesichtigung).
import { basisTypVonGutachterTermin, type TerminTyp } from '@/lib/termine/termin-typ'

export type SvTerminRow = {
  id: string
  start_zeit: string | null
  status: string | null
  typ: string | null
  kanal: string | null
  fall_id: string | null
  claim_id: string | null
  nachbesichtigung_status: string | null
  nachbesichtigung_termin_datum: string | null
}

export type KundeTerminEntry = {
  id: string
  art: 'sv' | 'reparatur'
  terminTyp: TerminTyp
  start: string | null
  status: string | null
  claim_id: string | null
  fall_id: string | null
  kanal: string | null
  werkstatt_id: string | null
  // Roh-gutachter_termine.typ (backward-compat fuer bestehende KundeTermin-Consumer, z.B.
  // kunde-claim-view). Nur auf SV-Basis-Eintraegen gesetzt; null bei Nachbesichtigung/Reparatur.
  typ?: string | null
}

// Nachbesichtigung-Substatus -> gutachter_termine-Farbstatus (fuer TerminStatusBadge).
function nbStatusToTerminStatus(nb: string | null): string {
  if (nb === 'durchgefuehrt' || nb === 'ergebnis-eingegangen') return 'abgeschlossen'
  if (nb === 'termin-gewaehlt') return 'reserviert'
  return nb ?? 'reserviert'
}

export function deriveKundeTerminEntries(row: SvTerminRow): KundeTerminEntry[] {
  const besichtigung: KundeTerminEntry = {
    id: row.id,
    art: 'sv',
    terminTyp: basisTypVonGutachterTermin(row.typ),
    start: row.start_zeit,
    status: row.status,
    claim_id: row.claim_id,
    fall_id: row.fall_id,
    kanal: row.kanal,
    werkstatt_id: null,
    typ: row.typ,
  }
  const out = [besichtigung]

  if (row.nachbesichtigung_termin_datum) {
    out.push({
      id: `${row.id}:nb`,
      art: 'sv',
      terminTyp: 'nachbesichtigung',
      start: row.nachbesichtigung_termin_datum,
      status: nbStatusToTerminStatus(row.nachbesichtigung_status),
      claim_id: row.claim_id,
      fall_id: row.fall_id,
      kanal: row.kanal,
      werkstatt_id: null,
      typ: null,
    })
  }
  return out
}
