'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'
import { erzeugePlanlink, widerrufePlanlink } from '@/lib/levelup/praesentation'
import type { Db } from '@/lib/anreicherung/schreiben'

export type PlanAntwort =
  | { ok: true; token: string; gueltigBis: string }
  | { ok: false; error: string }

/**
 * Gibt den Plan fuer den Sachverstaendigen frei.
 *
 * ⚠ Das Staff-Gate steht HIER, nicht nur im Seiten-Rendering. Eine Server
 * Action ist ein oeffentlicher Endpunkt: wer ihre Kennung kennt, ruft sie
 * direkt auf. Ein Gate allein in der Seite waere Dekoration.
 */
export async function planFreigeben(checkId: string, auswertungsToken: string): Promise<PlanAntwort> {
  const sitzung = await createClient()
  const staff = await pruefeStaff(sitzung as unknown as StaffDb)
  if (!staff.ok) return { ok: false, error: 'Nicht berechtigt.' }

  const db = createAdminClient() as unknown as Db
  const r = await erzeugePlanlink(db, checkId, staff.userId, new Date())
  if (r.ok) revalidatePath(`/auswertung/${auswertungsToken}`)
  return r
}

export async function planZurueckziehen(
  planToken: string,
  auswertungsToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const sitzung = await createClient()
  const staff = await pruefeStaff(sitzung as unknown as StaffDb)
  if (!staff.ok) return { ok: false, error: 'Nicht berechtigt.' }

  const db = createAdminClient() as unknown as Db
  const r = await widerrufePlanlink(db, planToken, new Date())
  if (r.ok) revalidatePath(`/auswertung/${auswertungsToken}`)
  return r
}
