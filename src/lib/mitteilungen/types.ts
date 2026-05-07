// AAR-229 W2: Zentrale Mitteilungs-Typen.

export type MitteilungKategorie = 'update' | 'task' | 'nachricht' | 'anruf'
export type MitteilungPrioritaet = 'normal' | 'hoch' | 'dringend'
// 2026-05-07 (CMM-Phase-1.5-Folge): 'claim' neu — claim ist Single-Source-of-
// Truth für die Domäne (CMM-Strecke), faelle bleibt Lifecycle-Bridge mit
// fall-basierten UI-Routen. Mitteilungen tragen claim_id als Wahrheit, das
// Routing in autoRouteUrl löst zur Laufzeit per claim→fall-Lookup auf.
export type KontextTyp = 'fall' | 'claim' | 'lead' | 'auftrag' | 'termin' | 'abrechnung' | 'nachricht'
// AAR-720: makler + dispatch ergänzt — beide haben user_role-Enum-
// Einträge und jeweils eigene UI/Portal-Routen. Vorher konnten Mitteilungen
// nicht an Makler-User geroutet werden, obwohl /makler/* existiert.
export type EmpfaengerRolle =
  | 'admin'
  | 'dispatch'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kanzlei'
  | 'kunde'
  | 'makler'

export interface Mitteilung {
  id: string
  empfaenger_id: string
  empfaenger_rolle: EmpfaengerRolle
  kategorie: MitteilungKategorie
  titel: string
  inhalt: string | null
  kontext_typ: KontextTyp | null
  kontext_id: string | null
  route_url: string | null
  gelesen: boolean
  gelesen_am: string | null
  absender_id: string | null
  absender_name: string | null
  icon: string | null
  prioritaet: MitteilungPrioritaet
  created_at: string
}

export interface CreateMitteilungInput {
  empfaenger_id: string
  empfaenger_rolle: EmpfaengerRolle
  kategorie: MitteilungKategorie
  titel: string
  inhalt?: string
  kontext_typ?: KontextTyp
  kontext_id?: string
  route_url?: string
  absender_id?: string
  absender_name?: string
  icon?: string
  prioritaet?: MitteilungPrioritaet
}
