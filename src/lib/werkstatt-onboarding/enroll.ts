// Werkstatt-Onboarding-Drip — idempotente Enrollment-Anlage.
// Aufruf an den 3 Onboarding-Punkten (Partner-Lead-Konvertierung, Werkstatt-Self-Signup,
// Admin-Anlage), jeweils NACH dem erfolgreichen Setzen von werkstaetten.status='aktiv'.
// Idempotent per DB-UNIQUE(werkstatt_id) + onConflict/ignoreDuplicates — ein zweiter Aufruf
// fuer dieselbe Werkstatt (z.B. Retry) legt KEIN zweites Enrollment an und ueberschreibt
// auch keinen bereits laufenden Fortschritt (aktueller_step/next_send_at bleiben unberuehrt).
//
// Anker der Sequenz = erstellt_am (DB-Default now()) dieser Zeile — next_send_at hier ist
// bewusst "jetzt + Step-1-offset_tage" (identisch zur Anker-Semantik in advance.ts), NICHT
// werkstaetten.aktiviert_am. Der Cron (Task 13) rechnet alle Folge-Offsets ebenfalls gegen
// enrollment.erstellt_am — Onboarding- und Backfill-Enrollments verhalten sich dadurch
// identisch (ein Backfill "enrolled" faktisch zum Backfill-Zeitpunkt, nicht rueckwirkend).
import type { SupabaseClient } from '@supabase/supabase-js'

const TAG_MS = 24 * 60 * 60 * 1000

export async function enrolleWerkstatt(
  db: SupabaseClient,
  werkstattId: string,
): Promise<{ ok: boolean }> {
  const { data: step1 } = await db
    .from('werkstatt_onboarding_steps')
    .select('offset_tage')
    .eq('position', 1)
    .single()
  const offset = (step1 as { offset_tage: number } | null)?.offset_tage ?? 0
  const nextSend = new Date(Date.now() + offset * TAG_MS)

  const { error } = await db.from('werkstatt_onboarding_enrollments').upsert(
    {
      werkstatt_id: werkstattId,
      aktueller_step: 0,
      next_send_at: nextSend.toISOString(),
      status: 'aktiv',
    },
    { onConflict: 'werkstatt_id', ignoreDuplicates: true },
  )
  return { ok: !error }
}
