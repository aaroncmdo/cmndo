// Termin-Engine — assignee-generische Kern-Typen.
// Lese-Quelle ist die VIEW public.v_belegung (Phase 1, PR #2180): Buchungen
// (gutachter_termine, aktiver Status) UNION externe Blocks (sv_kalender_events_cache).
// v_belegung ist service_role-only (security_invoker + REVOKE anon/authenticated).

export type AssigneeTyp = 'sachverstaendiger' | 'sv_lead' | 'kundenbetreuer' | 'kanzlei'

export interface Assignee {
  typ: AssigneeTyp
  id: string
}

export type BelegungTyp = 'buchung' | 'extern'
export type BezugTyp = 'claim' | 'fall' | 'lead'

/** Ein Belegungs-Fenster aus v_belegung (eine Buchung ODER ein externer Kalender-Block). */
export interface BelegungsFenster {
  start: string // ISO (start_zeit)
  end: string // ISO (end_zeit)
  belegungTyp: BelegungTyp
  status: string | null // null bei 'extern'
  terminTyp: string | null // v_belegung.termin_typ (gutachter_termine.typ); null bei extern
  bezugTyp: BezugTyp | null
  bezugId: string | null
  standortLat: number | null
  standortLng: number | null
  quelleId: string // v_belegung.quelle_id (Quell-Zeilen-id: gutachter_termine.id ODER cache.id)
}

/**
 * Roh-Zeilenform von public.v_belegung. Manuell getippt, weil die generierten
 * DB-Typen v_belegung noch nicht kennen (Regen aufgeschoben, Phase-1 Task 6) —
 * der Lese-Pfad in belegung.ts castet lokal, die Public-API bleibt voll typisiert.
 *
 * Hinweis: v_belegung ist ein UNION-ALL-View → information_schema meldet ALLE Spalten
 * als nullable. Diese Typen bilden den ERZWUNGENEN Vertrag einer wohlgeformten Zeile ab:
 * - start_zeit/end_zeit non-null: ladeBelegung verwirft Zeilen mit null-Grenzen VOR dem
 *   Mapping (externe Cache-Bloecke koennen null sein; vgl. cache-busy.ts) → Invariante.
 * - belegung_typ/quelle_id non-null: View-Literal je Branch bzw. Zeilen-PK (gt.id/cache.id).
 */
export interface VBelegungRow {
  assignee_typ: string | null
  assignee_id: string | null
  start_zeit: string
  end_zeit: string
  belegung_typ: 'buchung' | 'extern'
  status: string | null
  termin_typ: string | null
  bezug_typ: string | null
  bezug_id: string | null
  standort_lat: number | null
  standort_lng: number | null
  quelle_id: string
}
