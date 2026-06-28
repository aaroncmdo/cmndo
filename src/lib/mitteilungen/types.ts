// AAR-229 W2: Zentrale Mitteilungs-Typen.

export type MitteilungKategorie = 'update' | 'task' | 'nachricht' | 'anruf'
export type MitteilungPrioritaet = 'normal' | 'hoch' | 'dringend'
export type KontextTyp = 'fall' | 'lead' | 'auftrag' | 'termin' | 'abrechnung' | 'nachricht' | 'claim'
// AAR-720: makler + dispatch ergänzt — beide haben user_role-Enum-
// Einträge und jeweils eigene UI/Portal-Routen. Vorher konnten Mitteilungen
// nicht an Makler-User geroutet werden, obwohl /makler/* existiert.
// werkstatt ergänzt (Werkstatt-Vermittler-Portal, AAR-956 WP-B): Reparaturfreigabe-
// Benachrichtigung an den Werkstatt-User. route_url wird explizit gesetzt (autoRouteUrl
// deckt 'fall'/'claim' für werkstatt nicht ab), roleToPath kennt 'werkstatt' bereits.
export type EmpfaengerRolle =
  | 'admin'
  | 'dispatch'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kanzlei'
  | 'kunde'
  | 'makler'
  | 'werkstatt'

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
