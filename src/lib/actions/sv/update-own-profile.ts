'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

// BUG-91: Server Action fuer das eigene SV-Profil. Erlaubt einem
// Sachverstaendigen, seine eigenen Stammdaten + Firmen-Felder zu pflegen.
//
// Sicherheits-Regel: Auth-Check via supabase.auth.getUser(), dann Update
// EXPLIZIT WHERE profile_id = user.id (kein Cross-User-Update moeglich,
// auch wenn jemand sv_id manipuliert). RLS auf der Tabelle sollte das
// zusaetzlich blocken.

export type UpdateOwnProfileInput = {
  // profiles
  anrede?: string | null
  titel?: string | null
  vorname: string
  nachname: string
  telefon?: string | null
  // sachverstaendige (Firmen-Stammdaten)
  firmenname?: string | null
  rechtsform?: string | null
  steuernummer?: string | null
  ust_id?: string | null
  hrb?: string | null
  // sachverstaendige (Standort)
  standort_adresse?: string | null
  standort_plz?: string | null
  standort_lat?: number | null
  standort_lng?: number | null
  standort_place_id?: string | null
  // AAR-369: optionale Anzeige-Felder für Kunden-UI
  anzeigename?: string | null
  profilbeschreibung?: string | null
}

export async function updateOwnProfile(
  input: UpdateOwnProfileInput,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { success: false, error: 'Nicht angemeldet' }
  }

  if (!input.vorname?.trim() || !input.nachname?.trim()) {
    return { success: false, error: 'Vorname und Nachname sind Pflicht' }
  }

  // 1. profiles aktualisieren
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      anrede: input.anrede?.trim() || null,
      titel: input.titel?.trim() || null,
      vorname: input.vorname.trim(),
      nachname: input.nachname.trim(),
      telefon: input.telefon?.trim() || null,
      // AAR-369: Anzeigename + Profilbeschreibung (für Kunden-UI)
      anzeigename: input.anzeigename?.trim() || null,
      profilbeschreibung: input.profilbeschreibung?.trim() || null,
    })
    .eq('id', user.id)

  if (profileErr) {
    return { success: false, error: `Profil-Update fehlgeschlagen: ${profileErr.message}` }
  }

  // 2. sachverstaendige aktualisieren — STRIKT WHERE profile_id = auth.uid()
  // damit kein anderer SV via Manipulation getroffen wird.
  const svUpdate: Record<string, unknown> = {
    firmenname: input.firmenname?.trim() || null,
    rechtsform: input.rechtsform?.trim() || null,
    steuernummer: input.steuernummer?.trim() || null,
    ust_id: input.ust_id?.trim() || null,
    hrb: input.hrb?.trim() || null,
  }

  // Standort nur updaten wenn vom Frontend mitgeschickt (Google Places hat
  // das Place-Objekt, lat/lng ohne Adresse waere ungueltig).
  if (input.standort_adresse) {
    svUpdate.standort_adresse = input.standort_adresse
    svUpdate.standort_plz = input.standort_plz ?? null
    svUpdate.standort_lat = input.standort_lat ?? null
    svUpdate.standort_lng = input.standort_lng ?? null
    svUpdate.standort_place_id = input.standort_place_id ?? null
  }

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update(svUpdate)
    .eq('profile_id', user.id)

  if (svErr) {
    return { success: false, error: `SV-Update fehlgeschlagen: ${svErr.message}` }
  }

  // BUG-90: Wenn der SV seinen Standort geaendert hat, Isochrone neu
  // berechnen damit /gutachter/gebiet die richtige Karte zeigt. Defensive
  // try/catch — Profil-Update klappt auch wenn die Berechnung failt.
  if (input.standort_lat != null && input.standort_lng != null) {
    try {
      const { data: svRow } = await supabase
        .from('sachverstaendige')
        .select('id, paket_umkreis_km, radius_km')
        .eq('profile_id', user.id)
        .limit(1)
        .maybeSingle()
      if (svRow) {
        const radiusKm = svRow.paket_umkreis_km ?? svRow.radius_km ?? 15
        const polygon = await calculateIsochrone(
          input.standort_lat,
          input.standort_lng,
          radiusKm,
        )
        if (polygon.length > 0) {
          await supabase
            .from('sachverstaendige')
            .update({ isochrone_polygon: polygon })
            .eq('id', svRow.id)
        }
      }
    } catch (err) {
      console.error('[BUG-90] Isochrone-Recalc nach Profil-Update fehlgeschlagen:', err)
    }
  }

  revalidatePath('/gutachter/profil')
  revalidatePath('/gutachter/gebiet')
  return { success: true }
}
