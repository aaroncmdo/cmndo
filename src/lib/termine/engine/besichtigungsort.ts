import type { SupabaseClient } from '@supabase/supabase-js'
import { geocodeMitFallback, type Geocoder } from './geocode'

export type OrtQuelle = 'termin' | 'lead' | 'fall' | 'claim'
export interface ResolvedOrt { lat: number; lng: number; adresse: string | null; placeId: string | null; quelle: OrtQuelle }
export interface TerminOrtInput {
  besichtigungsort_lat: number | null; besichtigungsort_lng: number | null; besichtigungsort_adresse: string | null
  claim_id: string | null; fall_id: string | null; lead_id: string | null
}
type Kandidat = [lat: number | null | undefined, lng: number | null | undefined, adresse: string | null | undefined]

function joinAdr(strasse?: string | null, plz?: string | null): string | null {
  const s = [strasse, plz].filter(Boolean).join(', ').trim()
  return s.length ? s : null
}
/** Erster Kandidat mit Coords; sonst erste geocodebare Adresse. */
async function ausKandidaten(kand: Kandidat[], geocode: Geocoder, quelle: OrtQuelle): Promise<ResolvedOrt | null> {
  for (const [lat, lng, adr] of kand) {
    if (lat != null && lng != null) return { lat, lng, adresse: adr ?? null, placeId: null, quelle }
  }
  for (const [, , adr] of kand) {
    if (adr) { const g = await geocode(adr); if (g) return { ...g, quelle } }
  }
  return null
}

/**
 * Aufloesungs-Kette fuers Vor-Ort-Ziel: Termin-Coords → Termin-Adresse(geocode) →
 * bezug claim(schadenort) > fall(besichtigungsort>kunde) > lead(besichtigungsort>
 * fahrzeug_standort>kunde). Bevorzugt vorhandene Koordinaten, geocodet sonst.
 */
export async function resolveBesichtigungsort(
  t: TerminOrtInput, db: SupabaseClient, geocode: Geocoder = geocodeMitFallback,
): Promise<ResolvedOrt | null> {
  if (t.besichtigungsort_lat != null && t.besichtigungsort_lng != null)
    return { lat: t.besichtigungsort_lat, lng: t.besichtigungsort_lng, adresse: t.besichtigungsort_adresse, placeId: null, quelle: 'termin' }
  if (t.besichtigungsort_adresse) { const g = await geocode(t.besichtigungsort_adresse); if (g) return { ...g, quelle: 'termin' } }

  if (t.claim_id) {
    const { data: c } = await db.from('claims').select('schadenort_lat, schadenort_lng, schadenort_adresse').eq('id', t.claim_id).maybeSingle()
    const r = await ausKandidaten([[c?.schadenort_lat, c?.schadenort_lng, c?.schadenort_adresse]], geocode, 'claim'); if (r) return r
  }
  if (t.fall_id) {
    const { data: f } = await db.from('faelle').select('besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, kunde_adresse, kunde_strasse, kunde_plz').eq('id', t.fall_id).maybeSingle()
    const r = await ausKandidaten([
      [f?.besichtigungsort_lat, f?.besichtigungsort_lng, f?.besichtigungsort_adresse],
      [null, null, f?.kunde_adresse ?? joinAdr(f?.kunde_strasse, f?.kunde_plz)],
    ], geocode, 'fall'); if (r) return r
  }
  if (t.lead_id) {
    const { data: l } = await db.from('leads').select('besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, fahrzeug_standort_lat, fahrzeug_standort_lng, fahrzeug_standort_adresse, kunde_adresse, kunde_strasse, kunde_plz').eq('id', t.lead_id).maybeSingle()
    const r = await ausKandidaten([
      [l?.besichtigungsort_lat, l?.besichtigungsort_lng, l?.besichtigungsort_adresse],
      [l?.fahrzeug_standort_lat, l?.fahrzeug_standort_lng, l?.fahrzeug_standort_adresse],
      [null, null, l?.kunde_adresse ?? joinAdr(l?.kunde_strasse, l?.kunde_plz)],
    ], geocode, 'lead'); if (r) return r
  }
  return null
}
