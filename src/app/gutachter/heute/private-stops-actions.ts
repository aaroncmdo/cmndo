'use server'

// AAR-872: Server-Actions fuer SV-Privat-Stops auf der Heute-Page.
// Result-Object-Pattern (`ok` flag, kein throw — siehe AGENTS.md
// „Server-Actions Error-Handling-Pattern").

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'

export type PrivatStopRow = {
  id: string
  source: 'gcal' | 'caldav'
  external_event_id: string
  titel: string | null
  start_zeit: string
  end_zeit: string
  address: string
  place_id: string | null
  lat: number
  lng: number
}

export type AddPrivatStopInput = {
  source: 'gcal' | 'caldav'
  external_event_id: string
  titel: string | null
  start_zeit: string
  end_zeit: string
  address: string
  /** Optional: wenn Aufrufer schon Places-Autocomplete hatte, lat/lng/place_id
   *  direkt mitgeben → kein zweiter Geocoding-Call. */
  lat?: number
  lng?: number
  place_id?: string | null
}

export async function addPrivatStop(
  input: AddPrivatStopInput,
): Promise<{ ok: true; data: PrivatStopRow } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein SV-Profil' }

  // lat/lng entweder vom Caller (Places-Autocomplete) oder via Geocoding.
  let lat = input.lat ?? null
  let lng = input.lng ?? null
  let placeId = input.place_id ?? null
  let address = input.address.trim()

  if (lat == null || lng == null) {
    const geo = await geocodeAddress(address)
    if (!geo.ok) return { ok: false, error: `Adresse nicht geocodierbar: ${geo.error}` }
    lat = geo.data.lat
    lng = geo.data.lng
    placeId = geo.data.place_id
    address = geo.data.formatted_address
  }

  const datum = new Date(input.start_zeit).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('sv_private_stops')
    .upsert(
      {
        sv_id: sv.id,
        datum,
        source: input.source,
        external_event_id: input.external_event_id,
        titel: input.titel,
        start_zeit: input.start_zeit,
        end_zeit: input.end_zeit,
        address,
        place_id: placeId,
        lat,
        lng,
      },
      { onConflict: 'sv_id,source,external_event_id,datum' },
    )
    .select('id, source, external_event_id, titel, start_zeit, end_zeit, address, place_id, lat, lng')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  revalidatePath('/gutachter/heute')
  return {
    ok: true,
    data: {
      id: data.id as string,
      source: data.source as 'gcal' | 'caldav',
      external_event_id: data.external_event_id as string,
      titel: (data.titel as string | null) ?? null,
      start_zeit: data.start_zeit as string,
      end_zeit: data.end_zeit as string,
      address: data.address as string,
      place_id: (data.place_id as string | null) ?? null,
      lat: Number(data.lat),
      lng: Number(data.lng),
    },
  }
}

export async function removePrivatStop(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('sv_private_stops').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/gutachter/heute')
  return { ok: true }
}

export async function listPrivatStopsForDate(
  datumIso: string,
): Promise<PrivatStopRow[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return []
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return []
  const { data } = await supabase
    .from('sv_private_stops')
    .select('id, source, external_event_id, titel, start_zeit, end_zeit, address, place_id, lat, lng')
    .eq('sv_id', sv.id)
    .eq('datum', datumIso)
    .order('start_zeit', { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    source: r.source as 'gcal' | 'caldav',
    external_event_id: r.external_event_id as string,
    titel: (r.titel as string | null) ?? null,
    start_zeit: r.start_zeit as string,
    end_zeit: r.end_zeit as string,
    address: r.address as string,
    place_id: (r.place_id as string | null) ?? null,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }))
}
