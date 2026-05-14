export type FieldTyp =
  | 'text' | 'email' | 'tel' | 'number'
  | 'textarea' | 'segmented' | 'toggle-cards'
  | 'select' | 'slot' | 'signature' | 'file' | 'checkbox'
  | 'zb1-upload'

export type FieldOption = {
  value: string
  label: string
  icon?: string
  description?: string
}

export type DbTarget = {
  tabelle: string
  spalte: string
}

export type ConditionalOn = {
  feld: string
  equals: string
}

export type OnboardingFeld = {
  id: string
  phase_id: string
  reihenfolge: number
  feld_key: string
  typ: FieldTyp
  label: string
  hint?: string | null
  placeholder?: string | null
  pflicht: boolean
  optionen?: FieldOption[] | null
  validation?: Record<string, unknown> | null
  db_target: DbTarget
  conditional_on?: ConditionalOn | null
}

export type OnboardingPhase = {
  id: string
  flow_key: string
  reihenfolge: number
  phase_key: string
  titel: string
  eyebrow?: string | null
  beschreibung?: string | null
  conditional_on?: ConditionalOn | null
  felder: OnboardingFeld[]
}

// AAR-890: Result-Typ liegt hier (nicht in saveStep.ts) damit der Client den
// 'reason' robust auf 'anfrage_not_found' matchen kann — 'use server'-Files
// dürfen keine Types/Konstanten exportieren (AAR-664 Crash-Pattern).
export type SaveOnboardingResult =
  | { ok: true; anfrageId: string }
  | { ok: false; error: string; reason?: 'anfrage_not_found' }
