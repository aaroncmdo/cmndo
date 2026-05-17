import type { PlzGeoRow, RawTerminForKarte, TerminPin, UnlocalizedLead } from './types'

type ResolveResult =
  | { kind: 'pin'; pin: TerminPin }
  | { kind: 'unlocalized'; lead: UnlocalizedLead }

function initialen(vorname: string | null, nachname: string | null): string | null {
  const v = vorname?.trim()[0] ?? ''
  const n = nachname?.trim()[0] ?? ''
  const out = `${v}${n}`.toUpperCase()
  return out.length > 0 ? out : null
}

function fullName(vorname: string | null, nachname: string | null): string | null {
  const parts = [vorname, nachname].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export function resolveTerminGeo(
  termin: RawTerminForKarte,
  plzMap: Map<string, PlzGeoRow>,
  leadPlz: string | null,
): ResolveResult {
  const baseFields = {
    id: termin.id,
    start_zeit: termin.start_zeit,
    status: termin.status ?? 'unbekannt',
    kunde_name: fullName(termin.lead_vorname, termin.lead_nachname),
    sv_initialen: initialen(termin.sv_vorname, termin.sv_nachname),
    claim_nummer: termin.claim_nummer,
    fall_id: termin.fall_id,
    lead_id: termin.lead_id,
  }

  if (typeof termin.gps_lat_ankunft === 'number' && typeof termin.gps_lng_ankunft === 'number') {
    return {
      kind: 'pin',
      pin: { ...baseFields, lat: termin.gps_lat_ankunft, lng: termin.gps_lng_ankunft, geoSource: 'gps_ankunft' },
    }
  }
  if (typeof termin.lead_lat === 'number' && typeof termin.lead_lng === 'number') {
    return {
      kind: 'pin',
      pin: { ...baseFields, lat: termin.lead_lat, lng: termin.lead_lng, geoSource: 'lead_besichtigung' },
    }
  }
  if (typeof termin.sv_lat === 'number' && typeof termin.sv_lng === 'number') {
    return {
      kind: 'pin',
      pin: { ...baseFields, lat: termin.sv_lat, lng: termin.sv_lng, geoSource: 'sv_standort' },
    }
  }
  if (leadPlz) {
    const hit = plzMap.get(leadPlz)
    if (hit) {
      return {
        kind: 'pin',
        pin: { ...baseFields, lat: hit.lat, lng: hit.lng, geoSource: 'plz_centroid' },
      }
    }
  }

  return {
    kind: 'unlocalized',
    lead: {
      id: termin.id,
      vorname: termin.lead_vorname,
      nachname: termin.lead_nachname,
      firma_name: null,
      schadentyp: null,
      plz: leadPlz,
      created_at: termin.start_zeit,
    },
  }
}
