// AAR-380: Field-Modus Types
// Foundation für alle Block G Tickets (Fokus-Modus Shell, Live-Tracking,
// Kunden-Tracking, SV-Briefing etc.). Nur Types — keine Runtime-Logik hier.

export type SessionStatus =
  | 'idle'
  | 'en_route'
  | 'arrived'
  | 'completing'
  | 'finished'
  | 'paused'

/**
 * Entspricht 1:1 der Tabelle `public.sv_tages_session`.
 * `reihenfolge_termin_ids` ist in der DB jsonb, hier als string[] typisiert.
 */
export interface SvTagesSession {
  id: string
  sv_id: string
  datum: string // ISO date (YYYY-MM-DD)
  status: SessionStatus
  aktueller_termin_id: string | null
  reihenfolge_termin_ids: string[]
  started_at: string | null
  completed_at: string | null
  paused_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Strukturierter KI-Briefing aus Lead-Daten (AAR-385).
 * Wird in `faelle.sv_briefing_struktur` als jsonb gespeichert.
 * Parallel dazu existiert `faelle.sv_briefing_text` (AAR-377, flacher Text).
 */
export interface SvBriefingStruktur {
  kurzversion: string
  hinweise: string[]
  warnungen: string[]
  checkliste_vor_ort: string[]
}

export interface KundeLivePosition {
  id: string
  kunde_id: string
  termin_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  speed_kmh: number | null
  distance_to_target_meters: number | null
  updated_at: string
}

export interface MarkerSkin {
  type: 'avatar' | 'auto-3d' | 'default-pin'
  image_url?: string // für Avatar-Type
  color?: string // für Default-Pin-Type
}

export interface FieldModusMapConfig {
  style: string
  initialZoom: number
  pitch: number // 60 = iso-3D
  bearing: number
  use3dBuildings: boolean
}
