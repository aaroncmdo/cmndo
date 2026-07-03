import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

// Normalisierter Sachverstaendigen-Kontakt (Superset der im Kunde-Portal genutzten Felder).
export type SvKontakt = {
  svId: string
  profileId: string
  /** vorname + nachname (SV-Konvention: KEIN anzeigename). anzeigename separat verfuegbar. */
  name: string | null
  vorname: string | null
  nachname: string | null
  anzeigename: string | null
  telefon: string | null
  avatarUrl: string | null
  verifizierungStatus: string | null
  /** verifizierung_status === 'geprueft' */
  verifiziert: boolean
  googlePlaceId: string | null
  profilbeschreibung: string | null
}

// Normalisierter Kundenbetreuer-Kontakt.
export type KbKontakt = {
  userId: string
  /** anzeigename || vorname + nachname (KB-Konvention) */
  name: string | null
  vorname: string | null
  nachname: string | null
  anzeigename: string | null
  telefon: string | null
  avatarUrl: string | null
  profilbeschreibung: string | null
  rolle: string | null
}

/**
 * Laedt den SV-Kontakt (sachverstaendige -> profile_id -> profiles) an EINER null-sicheren
 * Stelle. Ersetzt den ~8x im Kunde-Portal duplizierten 2-Schritt-Join. Gibt null zurueck,
 * wenn svId fehlt oder kein Profil existiert. `name` = vorname+nachname (SV-Konvention).
 */
export async function getSvKontakt(db: DbClient, svId: string | null): Promise<SvKontakt | null> {
  if (!svId) return null
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id, verifizierung_status')
    .eq('id', svId)
    .maybeSingle()
  if (!sv?.profile_id) return null
  const { data: p } = await db
    .from('profiles')
    .select('vorname, nachname, anzeigename, telefon, avatar_url, google_place_id, profilbeschreibung')
    .eq('id', sv.profile_id)
    .maybeSingle()
  const vorname = (p?.vorname as string | null) ?? null
  const nachname = (p?.nachname as string | null) ?? null
  return {
    svId,
    profileId: sv.profile_id as string,
    name: [vorname, nachname].filter(Boolean).join(' ') || null,
    vorname,
    nachname,
    anzeigename: (p?.anzeigename as string | null) ?? null,
    telefon: (p?.telefon as string | null) ?? null,
    avatarUrl: (p?.avatar_url as string | null) ?? null,
    verifizierungStatus: (sv.verifizierung_status as string | null) ?? null,
    verifiziert: sv.verifizierung_status === 'geprueft',
    googlePlaceId: (p?.google_place_id as string | null) ?? null,
    profilbeschreibung: (p?.profilbeschreibung as string | null) ?? null,
  }
}

/**
 * Laedt den KB-Kontakt (profiles direkt). `name` = anzeigename || vorname+nachname
 * (KB-Konvention). Gibt null zurueck, wenn userId fehlt oder kein Profil existiert.
 */
export async function getKbKontakt(db: DbClient, userId: string | null): Promise<KbKontakt | null> {
  if (!userId) return null
  const { data: kb } = await db
    .from('profiles')
    .select('vorname, nachname, anzeigename, telefon, avatar_url, profilbeschreibung, rolle')
    .eq('id', userId)
    .maybeSingle()
  if (!kb) return null
  const vorname = (kb.vorname as string | null) ?? null
  const nachname = (kb.nachname as string | null) ?? null
  const anzeigename = (kb.anzeigename as string | null) ?? null
  return {
    userId,
    name: anzeigename || [vorname, nachname].filter(Boolean).join(' ') || null,
    vorname,
    nachname,
    anzeigename,
    telefon: (kb.telefon as string | null) ?? null,
    avatarUrl: (kb.avatar_url as string | null) ?? null,
    profilbeschreibung: (kb.profilbeschreibung as string | null) ?? null,
    rolle: (kb.rolle as string | null) ?? null,
  }
}
