// Server-Loader fuer die SV-Netzwerk-Karte: eigener Standort + bestaetigte Verbindungen mit
// Koordinaten. Die Kanten des eingeloggten Users (RLS -> nur eigene), Gegenseite service-role
// aufgeloest (fremde Entities sind RLS-blocked). Koordinaten liegen auf den Entity-Tabellen
// (sachverstaendige.standort_lat/lng, werkstaetten.lat/lng); Verbindungen ohne Koordinaten
// (z.B. Flotte, oder Datenluecke) fallen aus der Karte (kein Pin ohne Position).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NetzwerkPortal } from '@/components/shared/netzwerk/types'

export type NetzwerkPinRolle = 'gutachter' | 'werkstatt'
export type NetzwerkPin = { id: string; name: string; rolle: NetzwerkPinRolle; lat: number; lng: number }
export type NetzwerkGeo = { self: { lat: number; lng: number } | null; partner: NetzwerkPin[] }

/** Pure: baut einen Pin oder null, wenn die Koordinaten fehlen/ungueltig sind (kein Pin ohne Position). */
export function baueNetzwerkPin(
  rolle: NetzwerkPinRolle,
  id: string,
  name: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
): NetzwerkPin | null {
  const la = lat == null ? NaN : Number(lat)
  const ln = lng == null ? NaN : Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  return { id, name, rolle, lat: la, lng: ln }
}

/** Pure: Anzeigename fuer einen SV-Pin (Anzeigename > Vor+Nachname > Firmenname > Fallback). */
export function svAnzeigeName(
  prof: { anzeigename?: string | null; vorname?: string | null; nachname?: string | null } | null,
  firmenname: string | null | undefined,
): string {
  const voll = [prof?.vorname, prof?.nachname].filter(Boolean).join(' ').trim()
  return (prof?.anzeigename ?? '').trim() || voll || (firmenname ?? '').trim() || 'Gutachter'
}

async function resolveSelf(
  admin: ReturnType<typeof createAdminClient>,
  portal: NetzwerkPortal,
  userId: string,
): Promise<{ lat: number; lng: number } | null> {
  if (portal === 'gutachter') {
    const { data } = await admin.from('sachverstaendige').select('standort_lat, standort_lng').eq('profile_id', userId).maybeSingle()
    const p = baueNetzwerkPin('gutachter', userId, '', data?.standort_lat as number | null, data?.standort_lng as number | null)
    return p ? { lat: p.lat, lng: p.lng } : null
  }
  if (portal === 'werkstatt') {
    const { data } = await admin.from('werkstaetten').select('lat, lng').eq('user_id', userId).maybeSingle()
    const p = baueNetzwerkPin('werkstatt', userId, '', data?.lat as number | null, data?.lng as number | null)
    return p ? { lat: p.lat, lng: p.lng } : null
  }
  return null // flotte: Firma-Koordinaten unzuverlaessig → Karte zentriert auf die Partner
}

export async function ladeMeinNetzwerkGeo(portal: NetzwerkPortal): Promise<NetzwerkGeo> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { self: null, partner: [] }

  const { data: kanten } = await supabase
    .from('netzwerk_verbindungen')
    .select('anfrager_id, empfaenger_id')
    .eq('status', 'angenommen')
  const otherIds = Array.from(
    new Set((kanten ?? []).map((k: { anfrager_id: string; empfaenger_id: string }) => (k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id))),
  )

  const admin = createAdminClient()
  const self = await resolveSelf(admin, portal, user.id)
  if (otherIds.length === 0) return { self, partner: [] }

  const [{ data: svs }, { data: wks }, { data: profs }] = await Promise.all([
    admin.from('sachverstaendige').select('profile_id, firmenname, standort_lat, standort_lng').in('profile_id', otherIds),
    admin.from('werkstaetten').select('user_id, name, lat, lng').in('user_id', otherIds),
    admin.from('profiles').select('id, anzeigename, vorname, nachname').in('id', otherIds),
  ])
  const svByProfil = new Map((svs ?? []).map((s: { profile_id: string }) => [s.profile_id, s as Record<string, unknown>]))
  const wkByProfil = new Map((wks ?? []).map((w: { user_id: string }) => [w.user_id, w as Record<string, unknown>]))
  const profById = new Map((profs ?? []).map((p: { id: string }) => [p.id, p as { anzeigename?: string | null; vorname?: string | null; nachname?: string | null }]))

  const partner: NetzwerkPin[] = []
  for (const oid of otherIds) {
    const sv = svByProfil.get(oid)
    if (sv) {
      const pin = baueNetzwerkPin('gutachter', oid, svAnzeigeName(profById.get(oid) ?? null, sv.firmenname as string | null), sv.standort_lat as number | null, sv.standort_lng as number | null)
      if (pin) partner.push(pin)
      continue
    }
    const wk = wkByProfil.get(oid)
    if (wk) {
      const pin = baueNetzwerkPin('werkstatt', oid, ((wk.name as string | null) ?? 'Werkstatt').trim() || 'Werkstatt', wk.lat as number | null, wk.lng as number | null)
      if (pin) partner.push(pin)
    }
    // sonst (Flotte / ohne Koordinaten): kein Pin
  }

  return { self, partner }
}
