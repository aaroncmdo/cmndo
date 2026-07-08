import { createClient } from '@/lib/supabase/server'

// Rollen-agnostischer DSGVO-Loeschantrag-Query — genutzt von Kunde- UND Partner-Portalen
// (Makler/Werkstatt/SV), damit jeder eingeloggte User seinen offenen/letzten Antrag sieht.
// Kein 'use server' (reiner Server-Query fuer Server-Components; Typ darf exportiert werden).

export type LoeschAntrag = {
  id: string
  status: 'eingereicht' | 'bestaetigt' | 'ausgefuehrt'
  eingereicht_am: string
  bestaetigt_am: string | null
  grund: string | null
} | null

export async function getMyLoeschAntrag(): Promise<LoeschAntrag> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('dsgvo_loeschauftraege')
    .select('id, status, eingereicht_am, bestaetigt_am, grund')
    .eq('user_id', user.id)
    .in('status', ['eingereicht', 'bestaetigt', 'ausgefuehrt'])
    .order('eingereicht_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    status: data.status as 'eingereicht' | 'bestaetigt' | 'ausgefuehrt',
    eingereicht_am: data.eingereicht_am as string,
    bestaetigt_am: data.bestaetigt_am as string | null,
    grund: data.grund as string | null,
  }
}
