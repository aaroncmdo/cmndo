'use server'
// Duenner Server-Action-Wrapper um erstelleNetzwerkEinladung() fuer die EinladenForm-UI.
// Result-Object, kein throw.
import { createClient } from '@/lib/supabase/server'
import { erstelleNetzwerkEinladung } from '@/lib/netzwerk/einladung'
import type { EinladungZielRolle } from '@/lib/netzwerk/einladung-core'

const ERLAUBTE_ZIEL_ROLLEN: EinladungZielRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']

export async function sendeNetzwerkEinladung(
  email: string,
  zielRolle: EinladungZielRolle,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  if (!ERLAUBTE_ZIEL_ROLLEN.includes(zielRolle)) return { ok: false, error: 'Ungültige Zielrolle.' }
  const res = await erstelleNetzwerkEinladung(user.id, email, zielRolle)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}
