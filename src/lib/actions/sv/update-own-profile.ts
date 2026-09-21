'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  // Standort nur updaten wenn vom Frontend mitgeschickt.
  //
  // ⚠ Die Koordinaten des Browsers sind NICHT verlaesslich (Aaron 21.09.2026). Sie stammen
  // aus dem Adress-Vorschlag; wer die Anschrift frei tippt — und im Fallback-Feld ohne
  // Vorschlagsliste geht es gar nicht anders — schickt die ALTEN lat/lng zur NEUEN Adresse
  // zurueck. Ergebnis war eine stille Drift: umgezogener SV, Kartenpunkt und Einsatzgebiet
  // bleiben am alten Ort. Das ist schaedlicher als eine fehlende Koordinate, weil es wie ein
  // gepflegter Datensatz aussieht.
  //
  // Deshalb: hat sich die Adresse geaendert, ohne dass FRISCHE Koordinaten mitkamen, wird
  // server-seitig neu ermittelt (Mapbox mit PLZ, dann PLZ-Mittelpunkt).
  let neueKoordinaten: { lat: number; lng: number } | null = null

  if (input.standort_adresse) {
    const { data: bisher } = await supabase
      .from('sachverstaendige')
      .select('standort_adresse, standort_lat, standort_lng')
      .eq('profile_id', user.id)
      .limit(1)
      .maybeSingle()

    const adresseGeaendert =
      (bisher?.standort_adresse ?? '').trim().toLowerCase() !==
      input.standort_adresse.trim().toLowerCase()
    const koordinatenSindDieAlten =
      input.standort_lat != null &&
      input.standort_lng != null &&
      Number(bisher?.standort_lat) === input.standort_lat &&
      Number(bisher?.standort_lng) === input.standort_lng
    const koordinatenFehlen = input.standort_lat == null || input.standort_lng == null

    if (adresseGeaendert && (koordinatenFehlen || koordinatenSindDieAlten)) {
      const { ermittleStandort } = await import('@/lib/sv/standort-geocoding')
      const geo = await ermittleStandort(supabase, {
        adresse: input.standort_adresse,
        plz: input.standort_plz ?? null,
      })
      if (geo.ok) neueKoordinaten = { lat: geo.lat, lng: geo.lng }
    } else if (!koordinatenFehlen) {
      neueKoordinaten = { lat: input.standort_lat!, lng: input.standort_lng! }
    }

    svUpdate.standort_adresse = input.standort_adresse
    svUpdate.standort_plz = input.standort_plz ?? null
    svUpdate.standort_lat = neueKoordinaten?.lat ?? null
    svUpdate.standort_lng = neueKoordinaten?.lng ?? null
    // Die place_id gehoert zum Vorschlag. Wurde server-seitig neu ermittelt, passt sie nicht
    // mehr zur Koordinate und wird fallengelassen, statt eine falsche Herkunft zu behaupten.
    svUpdate.standort_place_id =
      neueKoordinaten && koordinatenFehlen ? null : input.standort_place_id ?? null
  }

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update(svUpdate)
    .eq('profile_id', user.id)

  if (svErr) {
    return { success: false, error: `SV-Update fehlgeschlagen: ${svErr.message}` }
  }

  // BUG-90: Wenn der SV seinen Standort geaendert hat, Isochrone neu berechnen
  // (fuettert die Dispatch-/Mitarbeiter-Umkreis-Views + die Termin-Engine).
  //
  // 21.09.2026: laeuft auf den TATSAECHLICH gespeicherten Koordinaten, nicht mehr auf denen
  // aus dem Browser — sonst haette ein umgezogener SV ein Einsatzgebiet um seinen alten Ort
  // bekommen. Die Berechnung selbst liegt im gemeinsamen Helfer, den auch die
  // Selbst-Registrierung nutzt.
  if (neueKoordinaten) {
    const { data: svRow } = await supabase
      .from('sachverstaendige')
      .select('id, paket_umkreis_km')
      .eq('profile_id', user.id)
      .limit(1)
      .maybeSingle()
    if (svRow) {
      const { stelleIsochroneSicher, STANDARD_UMKREIS_KM } = await import(
        '@/lib/sv/standort-geocoding'
      )
      await stelleIsochroneSicher(
        supabase,
        svRow.id,
        neueKoordinaten.lat,
        neueKoordinaten.lng,
        svRow.paket_umkreis_km ?? STANDARD_UMKREIS_KM,
      )
    }
  }

  revalidatePath('/gutachter/profil')
  // E2: /gutachter/gebiet-Route entfernt (308 -> einstellungen); Isochrone feeds jetzt Dispatch/Finder.
  return { success: true }
}
