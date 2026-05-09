'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type RueckrufInput = {
  name: string
  telefon: string
  zeitfenster?: string | null
  nachricht?: string | null
  quelle: string
}

// Rückruf-Anfrage von einer öffentlichen Marketing-Seite.
// Schreibt in `mitteilungen` für alle Dispatch-User, damit sie
// sofort in der Dispatch-Inbox + auf /dispatch/rueckrufe auftaucht.
export async function erstelleOeffentlichenRueckruf(
  input: RueckrufInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim()
  const telefon = input.telefon.trim()
  if (!name || name.length < 2) return { ok: false, error: 'Name fehlt' }
  if (!telefon || telefon.length < 5) return { ok: false, error: 'Telefon fehlt' }

  const admin = createAdminClient()

  const { data: dispatchUser } = await admin
    .from('profiles')
    .select('id')
    .eq('rolle', 'dispatch')

  if (!dispatchUser || dispatchUser.length === 0) {
    return { ok: false, error: 'Aktuell ist kein Dispatch-Mitarbeiter erreichbar.' }
  }

  const inhalt = [
    `Tel: ${telefon}`,
    input.zeitfenster ? `Zeit: ${input.zeitfenster}` : null,
    input.nachricht ? `Nachricht: ${input.nachricht}` : null,
    `Quelle: ${input.quelle}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
    empfaenger_id: u.id,
    empfaenger_rolle: 'dispatch' as const,
    kategorie: 'anruf' as const,
    titel: `Rückrufwunsch: ${name}`,
    inhalt,
    prioritaet: 'hoch' as const,
    icon: '📞',
    route_url: '/dispatch/rueckrufe',
  }))

  const { error } = await admin.from('mitteilungen').insert(mitteilungen)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dispatch/dashboard')
  revalidatePath('/dispatch/rueckrufe')
  return { ok: true }
}
