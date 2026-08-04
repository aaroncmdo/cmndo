'use server'

// Admin-Server-Actions fuer die Werkstatt-Staffelung (Meilenstein-Boni).
// admin-gated; CRUD + award-RPC via service-role-Client (createAdminClient).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return p?.rolle === 'admin'
}

export async function setWerkstattStaffel(
  werkstattId: string,
  stufen: { schwelle: number; bonus_betrag_netto: number }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen die Staffelung ändern.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }

  // Validierung
  const clean: { schwelle: number; bonus_betrag_netto: number }[] = []
  const seen = new Set<number>()
  for (const s of stufen) {
    const schwelle = Math.trunc(Number(s.schwelle))
    const betrag = Number(s.bonus_betrag_netto)
    if (!Number.isFinite(schwelle) || schwelle <= 0) return { ok: false, error: 'Schwelle muss eine positive ganze Zahl sein.' }
    if (!Number.isFinite(betrag) || betrag < 0) return { ok: false, error: 'Bonus-Betrag muss 0 oder größer sein.' }
    if (seen.has(schwelle)) return { ok: false, error: `Schwelle ${schwelle} ist doppelt.` }
    seen.add(schwelle)
    clean.push({ schwelle, bonus_betrag_netto: betrag })
  }

  const admin = createAdminClient()
  // Replace-Semantik: alle Stufen der Werkstatt loeschen + neu einfuegen.
  // Vergebene Boni bleiben (snapshot + ON DELETE SET NULL auf stufe_id).
  const { error: delErr } = await admin.from('werkstatt_staffel_stufen').delete().eq('werkstatt_id', werkstattId)
  if (delErr) return { ok: false, error: delErr.message }
  if (clean.length > 0) {
    const { error: insErr } = await admin
      .from('werkstatt_staffel_stufen')
      .insert(clean.map((c) => ({ werkstatt_id: werkstattId, schwelle: c.schwelle, bonus_betrag_netto: c.bonus_betrag_netto })))
    if (insErr) return { ok: false, error: insErr.message }
  }
  // Bereits ueberschrittene neue Stufen sofort vergeben
  await admin.rpc('award_werkstatt_staffel_boni', { p_werkstatt_id: werkstattId })

  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
