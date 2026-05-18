// CMM-36: Berechnet beim Termin-Anlegen einmalig die Fahrtzeit von SV-Standort
// zur Kunden-Adresse via Mapbox Directions und speichert das Ergebnis als
// gutachter_termine.geschaetzte_fahrtzeit_min. Fire-and-forget — Fehler werden
// geloggt, blockieren aber den Reservation-Flow nicht.

import type { SupabaseClient } from '@supabase/supabase-js'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

async function fahrtzeitMinuten(
  vonLat: number,
  vonLng: number,
  nachAdresse: string,
): Promise<number | null> {
  if (!MAPBOX_TOKEN || !nachAdresse) return null
  try {
    const geoRes = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(nachAdresse)}.json?country=de&limit=1&access_token=${MAPBOX_TOKEN}`,
    )
    const geoData = await geoRes.json()
    const coords = geoData?.features?.[0]?.center as [number, number] | undefined
    if (!coords) return null
    const [zielLng, zielLat] = coords

    const routeRes = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${vonLng},${vonLat};${zielLng},${zielLat}?overview=false&access_token=${MAPBOX_TOKEN}`,
    )
    const routeData = await routeRes.json()
    const dauerSek = routeData?.routes?.[0]?.duration as number | undefined
    if (!dauerSek) return null
    return Math.ceil(dauerSek / 60)
  } catch {
    return null
  }
}

export async function speichereBaselineFahrtzeit(
  supabase: SupabaseClient,
  terminId: string,
  svId: string,
  leadId: string | null,
  fallId: string | null,
): Promise<void> {
  try {
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('standort_lat, standort_lng')
      .eq('id', svId)
      .maybeSingle()

    const lat = sv?.standort_lat as number | null
    const lng = sv?.standort_lng as number | null
    if (lat == null || lng == null) return

    let zielAdresse: string | null = null
    if (fallId) {
      // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
      const { data: fall } = await supabase
        .from('faelle')
        .select('claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
        .eq('id', fallId)
        .maybeSingle()
      const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims
      const teile = [
        fallClaim?.schadenort_adresse as string | null,
        fallClaim?.schadenort_plz as string | null,
        fallClaim?.schadenort_ort as string | null,
      ].filter(Boolean)
      if (teile.length) zielAdresse = teile.join(', ')
    }
    if (!zielAdresse && leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('kunde_strasse, kunde_plz, kunde_adresse')
        .eq('id', leadId)
        .maybeSingle()
      const teile = [
        lead?.kunde_strasse as string | null,
        lead?.kunde_plz as string | null,
        lead?.kunde_adresse as string | null,
      ].filter(Boolean)
      if (teile.length) zielAdresse = teile.join(', ')
    }
    if (!zielAdresse) return

    const minuten = await fahrtzeitMinuten(Number(lat), Number(lng), zielAdresse)
    if (minuten == null) return

    await supabase
      .from('gutachter_termine')
      .update({ geschaetzte_fahrtzeit_min: minuten })
      .eq('id', terminId)
  } catch (err) {
    console.warn('[CMM-36] Baseline-Fahrtzeit fehlgeschlagen:', err)
  }
}
