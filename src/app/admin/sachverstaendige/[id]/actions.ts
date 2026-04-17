'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

const PAKET_KM: Record<string, number> = {
  standard: 15, 'starter-10': 15,
  pro: 40, 'standard-25': 40,
  premium: 70, 'premium-50': 70,
}

export async function updateSvProfile(svId: string, profileId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = formData.get('paket') as string
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10
  const istAktiv = formData.get('ist_aktiv') === 'true'
  const notizen = (formData.get('notizen') as string)?.trim() || null

  // Standort from Google Places
  const standortAdresse = (formData.get('standort_adresse') as string)?.trim() || null
  const standortPlz = (formData.get('standort_plz') as string)?.trim() || null
  const standortLatStr = formData.get('standort_lat') as string
  const standortLngStr = formData.get('standort_lng') as string
  const standortLat = standortLatStr ? parseFloat(standortLatStr) : null
  const standortLng = standortLngStr ? parseFloat(standortLngStr) : null
  const standortPlaceId = (formData.get('standort_place_id') as string)?.trim() || null

  const radiusKm = PAKET_KM[paket] ?? 15

  // Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', profileId)

  if (profileErr) throw new Error(`Profil-Update fehlgeschlagen: ${profileErr.message}`)

  // Update sachverstaendige
  const svUpdate: Record<string, unknown> = {
    paket,
    max_faelle_monat: maxFaelle,
    ist_aktiv: istAktiv,
    notizen,
    standort_adresse: standortAdresse,
    standort_plz: standortPlz,
    standort_lat: standortLat,
    standort_lng: standortLng,
    standort_place_id: standortPlaceId,
    paket_umkreis_km: radiusKm,
    radius_km: radiusKm,
  }

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update(svUpdate)
    .eq('id', svId)

  if (svErr) throw new Error(`SV-Update fehlgeschlagen: ${svErr.message}`)

  // Isochrone neu berechnen wenn Koordinaten vorhanden
  if (standortLat != null && standortLng != null && !isNaN(standortLat) && !isNaN(standortLng)) {
    try {
      const polygon = await calculateIsochrone(standortLat, standortLng, radiusKm)
      if (polygon.length > 0) {
        await supabase.from('sachverstaendige').update({ isochrone_polygon: polygon }).eq('id', svId)
      }
    } catch (err) {
      // AAR-132: Isochrone-Berechnung nicht kritisch — SV-Update greift trotzdem.
      // findBestSV fällt ohne Polygon auf den Radius-Check zurück.
      console.error('[AAR-132] Isochrone-Berechnung nach SV-Profil-Update fehlgeschlagen:', err)
    }
  }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
}

// BUG-90: calculateIsochrone wurde nach src/lib/isochrone/calculate-isochrone.ts
// extrahiert damit auch anlegeSv() und der Profil-Tab dieselbe Logik nutzen.

// AAR-425: Admin-Toggle "SV manuell verifizieren".
// Gate für Whitelabel-Features auf der Kunden-Seite. Bewusst getrennt vom
// AAR-359-Verifizierungsflow (sa_vorlage_status / verifizierung_status), der
// die Dokument-Pflichten abbildet. `verifiziert` hier = "Aaron kennt den SV
// persönlich" → Whitelabel darf sichtbar sein.
export async function setzeSvVerifiziert(svId: string, verifiziert: boolean) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' as const }

  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') return { success: false, error: 'Nur Admins dürfen den Verifizierungs-Status ändern.' }

  const patch: Record<string, unknown> = verifiziert
    ? { verifiziert: true, verifiziert_am: new Date().toISOString(), verifiziert_von: user.id }
    : { verifiziert: false, verifiziert_am: null, verifiziert_von: null }

  const { error } = await supabase
    .from('sachverstaendige')
    .update(patch)
    .eq('id', svId)

  if (error) return { success: false, error: `Update fehlgeschlagen: ${error.message}` }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { success: true as const }
}
