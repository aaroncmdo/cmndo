'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Admin-Tuning der Anspruchspruefer-Saetze (SSoT in der DB):
//  - nutzungsausfall_klasse_saetze (A-L Tagessaetze)
//  - anspruch_config (Schwellen, Reparaturdauern, Hoechstdauern, Pauschalen)
// Beide Tabellen sind public-readable (RLS SELECT allow-all), Schreibzugriff nur
// service-role -> Writes hier via createAdminClient, admin-gated.

const PFAD = '/admin/einstellungen/anspruch-saetze'

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins' }
  return { ok: true }
}

export async function updateKlasseSatz(
  klasse: string,
  euroProTag: number,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!Number.isFinite(euroProTag) || euroProTag < 0 || euroProTag > 100000) {
    return { ok: false, error: 'Ungültiger Tagessatz (0–100000 €)' }
  }

  const db = createAdminClient()
  // nutzungsausfall_klasse_saetze noch nicht in generierten Types (wie rates.ts) -> lokaler Cast.
  const q = db.from('nutzungsausfall_klasse_saetze' as never) as unknown as {
    update: (v: { euro_pro_tag: number }) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
  const { error } = await q.update({ euro_pro_tag: euroProTag }).eq('klasse', klasse)
  if (error) return { ok: false, error: error.message }

  revalidatePath(PFAD)
  return { ok: true }
}

export async function updateAnspruchConfigWert(
  key: string,
  wert: number,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!Number.isFinite(wert) || wert < 0) return { ok: false, error: 'Ungültiger Wert' }

  const db = createAdminClient()
  const { error } = await db.from('anspruch_config').update({ wert }).eq('key', key)
  if (error) return { ok: false, error: error.message }

  revalidatePath(PFAD)
  return { ok: true }
}
