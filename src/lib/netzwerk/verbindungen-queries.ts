// Server-Query für Server-Components (kein 'use server'). Die Kanten des eingeloggten Users laden
// (RLS-Client -> nur eigene Kanten) + Gegenseite service-role auflösen (fremde profiles sind per RLS
// nicht lesbar; Auflösung ist auf die eigenen Kanten gescopt).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bauePartnerAnzeige, type PartnerAnzeige } from './verbindungen-display'

export type VerbindungAnzeige = { verbindungId: string; partner: PartnerAnzeige }
export type AnfrageAnzeige = VerbindungAnzeige & { richtung: 'eingehend' | 'ausgehend' }

async function ladeAnzeigen(
  admin: ReturnType<typeof createAdminClient>,
  profilIds: string[],
): Promise<Map<string, PartnerAnzeige>> {
  const out = new Map<string, PartnerAnzeige>()
  if (profilIds.length === 0) return out
  const [{ data: profile }, { data: svs }, { data: wks }, { data: flotten }] = await Promise.all([
    admin.from('profiles').select('id, rolle, anzeigename, vorname, nachname, firma, ort').in('id', profilIds),
    admin.from('sachverstaendige').select('profile_id, firmenname').in('profile_id', profilIds),
    admin.from('werkstaetten').select('user_id, name, adresse_ort').in('user_id', profilIds),
    admin.from('firmen_flotten_konten').select('user_id, firmen(name)').in('user_id', profilIds),
  ])
  const svByProfil = new Map((svs ?? []).map((s: { profile_id: string }) => [s.profile_id, s]))
  const wkByProfil = new Map((wks ?? []).map((w: { user_id: string }) => [w.user_id, w]))
  // Nested-FK (firmen_flotten_konten.firma_id -> firmen): je nach Cardinality Objekt ODER Array -> normalisieren.
  const flotteByProfil = new Map(
    (flotten ?? []).map((f: { user_id: string; firmen: { name: string | null } | { name: string | null }[] | null }) => {
      const firma = Array.isArray(f.firmen) ? f.firmen[0] : f.firmen
      return [f.user_id, firma?.name ?? null] as [string, string | null]
    }),
  )
  for (const p of (profile ?? []) as Array<Parameters<typeof bauePartnerAnzeige>[0]>)
    out.set(
      p.id,
      bauePartnerAnzeige(
        p,
        (svByProfil.get(p.id) as never) ?? null,
        (wkByProfil.get(p.id) as never) ?? null,
        flotteByProfil.get(p.id) ?? null,
      ),
    )
  return out
}

export async function ladeMeineVerbindungen(): Promise<VerbindungAnzeige[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data: kanten } = await supabase
    .from('netzwerk_verbindungen')
    .select('id, anfrager_id, empfaenger_id')
    .eq('status', 'angenommen')
  const admin = createAdminClient()
  const gegen = (kanten ?? []).map((k: { id: string; anfrager_id: string; empfaenger_id: string }) => ({
    id: k.id,
    other: k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id,
  }))
  const anzeigen = await ladeAnzeigen(admin, gegen.map((g) => g.other))
  return gegen.flatMap((g) => {
    const p = anzeigen.get(g.other)
    return p ? [{ verbindungId: g.id, partner: p }] : []
  })
}

export async function ladeMeineAnfragen(): Promise<{ eingehend: AnfrageAnzeige[]; ausgehend: AnfrageAnzeige[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { eingehend: [], ausgehend: [] }
  const { data: kanten } = await supabase
    .from('netzwerk_verbindungen')
    .select('id, anfrager_id, empfaenger_id')
    .eq('status', 'offen')
  const admin = createAdminClient()
  const rows = (kanten ?? []) as Array<{ id: string; anfrager_id: string; empfaenger_id: string }>
  const otherIds = rows.map((k) => (k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id))
  const anzeigen = await ladeAnzeigen(admin, otherIds)
  const eingehend: AnfrageAnzeige[] = []
  const ausgehend: AnfrageAnzeige[] = []
  for (const k of rows) {
    const otherId = k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id
    const p = anzeigen.get(otherId)
    if (!p) continue
    if (k.empfaenger_id === user.id) eingehend.push({ verbindungId: k.id, partner: p, richtung: 'eingehend' })
    else ausgehend.push({ verbindungId: k.id, partner: p, richtung: 'ausgehend' })
  }
  return { eingehend, ausgehend }
}
