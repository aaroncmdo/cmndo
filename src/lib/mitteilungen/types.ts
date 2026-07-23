// AAR-229 W2: Zentrale Mitteilungs-Typen.

// Phase 5: 'task' retired — Tasks werden abgeleitet (get_updates_action), nicht
// als Mitteilung materialisiert.
export type MitteilungKategorie = 'update' | 'nachricht' | 'anruf'
export type MitteilungPrioritaet = 'normal' | 'hoch' | 'dringend'
// 'fahrzeug': Flottenmanager-Kontext (z.B. 3-Monats-Zustandsaufnahme-Reminder) — kontext_id = vehicle_id.
// mitteilungen.kontext_typ hat KEINEN DB-CHECK, daher rein TS-seitige Erweiterung (kein Migration-Bedarf).
export type KontextTyp = 'fall' | 'lead' | 'auftrag' | 'termin' | 'abrechnung' | 'nachricht' | 'claim' | 'fahrzeug'
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
  | 'werkstatt'
  // P1.1 (Operativ-Audit 17.07.): Flottenmanager hat ein eigenes Portal (/flotte) mit
  // Update-Glocke, war aber als Empfaenger nirgends adressierbar.
  | 'flottenmanager'

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
