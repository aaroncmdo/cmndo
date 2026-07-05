import type { CarState } from './types'

type DeriveCarStateInput = {
  nowMs: number
  live: { lat: number; lng: number; heading: number | null; updatedAtMs: number } | null
  aktiverTermin: { id: string; status: string; losgefahrenAtMs: number | null; svUnterwegsSeitMs: number | null; zielLat: number | null; zielLng: number | null; etaMinuten: number | null } | null
  freshCutoffMs?: number
}
const NONE: CarState = { mode: 'none', lat: null, lng: null, heading: null, zielLat: null, zielLng: null, terminId: null, etaMinuten: null }

export function deriveCarState(i: DeriveCarStateInput): CarState {
  const cutoff = i.freshCutoffMs ?? 5 * 60 * 1000
  const t = i.aktiverTermin
  const hatZiel = !!t && t.zielLat != null && t.zielLng != null
  const istUnterwegs = !!t && (t.status === 'unterwegs' || t.status === 'losgefahren' || t.losgefahrenAtMs != null || t.svUnterwegsSeitMs != null)
  // 1) frisches GPS
  if (i.live && i.nowMs - i.live.updatedAtMs < cutoff) {
    return { mode: 'live', lat: i.live.lat, lng: i.live.lng, heading: i.live.heading,
      zielLat: hatZiel ? t!.zielLat : null, zielLng: hatZiel ? t!.zielLng : null,
      terminId: t?.id ?? null, etaMinuten: t?.etaMinuten ?? null }
  }
  // 2) termin-abgeleitet (nur wenn unterwegs UND Ziel bekannt)
  if (istUnterwegs && hatZiel) {
    return { mode: 'unterwegs_derived', lat: t!.zielLat, lng: t!.zielLng, heading: null,
      zielLat: t!.zielLat, zielLng: t!.zielLng, terminId: t!.id, etaMinuten: t!.etaMinuten }
  }
  return NONE
}
