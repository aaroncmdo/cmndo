'use server'

// Admin-Server-Actions fuer die Makler-Staffelung (Meilenstein-Boni).
// admin-gated; CRUD + award-RPC via service-role-Client (createAdminClient).
// 1:1 gespiegelt von src/app/admin/werkstaetten/staffel-actions.ts.

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

export async function getMaklerStaffel(
  maklerId: string,
): Promise<{ ok: true; stufen: { schwelle: number; bonus_betrag_netto: number }[] } | { ok: false; error: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins.' }
  if (!maklerId) return { ok: false, error: 'Keine Makler-ID.' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('makler_staffel_stufen')
    .select('schwelle, bonus_betrag_netto')
    .eq('makler_id', maklerId)
    .order('schwelle', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    stufen: (data ?? []).map((r) => ({
      schwelle: Number(r.schwelle),
      bonus_betrag_netto: Number(r.bonus_betrag_netto),
    })),
  }
}

export async function setMaklerStaffel(
  maklerId: string,
  stufen: { schwelle: number; bonus_betrag_netto: number }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen die Staffelung ändern.' }
  if (!maklerId) return { ok: false, error: 'Keine Makler-ID.' }

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
  // Replace-Semantik: alle Stufen des Maklers loeschen + neu einfuegen.
  // Vergebene Boni bleiben (snapshot + ON DELETE SET NULL auf stufe_id).
  const { error: delErr } = await admin.from('makler_staffel_stufen').delete().eq('makler_id', maklerId)
  if (delErr) return { ok: false, error: delErr.message }
  if (clean.length > 0) {
    const { error: insErr } = await admin
      .from('makler_staffel_stufen')
      .insert(clean.map((c) => ({ makler_id: maklerId, schwelle: c.schwelle, bonus_betrag_netto: c.bonus_betrag_netto })))
    if (insErr) return { ok: false, error: insErr.message }
  }
  // Bereits ueberschrittene neue Stufen sofort vergeben
  await admin.rpc('award_makler_staffel_boni', { p_makler_id: maklerId })

  revalidatePath('/admin/makler')
  return { ok: true }
}
