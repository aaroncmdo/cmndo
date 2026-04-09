/**
 * KFZ-151: Master Auto-Resolve System.
 * Erlaubte entity_type Werte (muss mit DB-CHECK chk_tasks_entity_type uebereinstimmen).
 */
export type TaskEntityType =
  | 'fall'
  | 'lead'
  | 'abrechnung'
  | 'reklamation'
  | 'sv_onboarding'
  | 'gutachter'
  | 'kunde'
  | 'case'
  | 'termin'
  | 'gutschrift'

export type TaskPrioritaet = 'normal' | 'dringend' | 'kritisch'
