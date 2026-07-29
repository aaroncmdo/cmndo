// Profi-Verzeichnis-Suche über die leak-sichere DEFINER-RPC (nur sichere Anzeige-Felder).
// RLS-Client -> auth.uid() im RPC = der Caller (Selbst-Gate im Body).
import { createClient } from '@/lib/supabase/server'
import type { NetzwerkRolle } from './types'

export type VerzeichnisTreffer = {
  profilId: string
  rolle: NetzwerkRolle
  name: string
  ort: string | null
  avatarUrl: string | null
}

export async function sucheVerzeichnis(q: string, zielRolle?: NetzwerkRolle): Promise<VerzeichnisTreffer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('netzwerk_verzeichnis_suche' as never, {
    q,
    ziel_rolle: zielRolle ?? null,
  } as never)
  if (error) {
    console.error('[sucheVerzeichnis]', error.message)
    return []
  }
  return ((data ?? []) as Array<{
    profil_id: string
    rolle: NetzwerkRolle
    anzeige_name: string
    ort: string | null
    avatar_url: string | null
  }>).map((r) => ({
    profilId: r.profil_id,
    rolle: r.rolle,
    name: r.anzeige_name,
    ort: r.ort ?? null,
    avatarUrl: r.avatar_url ?? null,
  }))
}
