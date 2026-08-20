'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'
import { erzeugeAuswertungslink, type LinkErgebnis } from '@/lib/levelup/auswertung'
import type { Db } from '@/lib/anreicherung/schreiben'

/**
 * Holt den Auswertungslink eines Checks — oder legt ihn an.
 *
 * ⚠ Das Staff-Gate steht HIER, nicht nur auf der Seite. Eine Server Action ist
 * ein oeffentlicher Endpunkt: wer ihre Kennung kennt, ruft sie direkt auf,
 * ohne je die Seite zu sehen. Ein Gate allein im Seiten-Rendering waere
 * Dekoration.
 */
export async function linkHolen(checkId: string): Promise<LinkErgebnis> {
  const sitzung = await createClient()
  const staff = await pruefeStaff(sitzung as unknown as StaffDb)
  if (!staff.ok) return { ok: false, error: 'Nicht berechtigt.' }

  const db = createAdminClient() as unknown as Db
  return erzeugeAuswertungslink(db, checkId, staff.userId)
}
