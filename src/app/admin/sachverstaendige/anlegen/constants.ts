// ARCH-1 Phase 2: Client-side Konstanten + Types fuer den Anlegen-Wizard.
// Getrennt von actions.ts wegen Next.js 'use server' Regel (nur async functions
// duerfen aus 'use server' Files exportiert werden).

export type AnlegePaket = 'standard' | 'pro' | 'premium' | 'individuell'

export const PAKET_KONFIG: Record<Exclude<AnlegePaket, 'individuell'>, { kontingent: number; radius_km: number; preis_anzahlung_eur: number; label: string }> = {
  standard: { kontingent: 10, radius_km: 15, preis_anzahlung_eur: 1500, label: 'Standard' },
  pro: { kontingent: 25, radius_km: 40, preis_anzahlung_eur: 3750, label: 'Pro' },
  premium: { kontingent: 50, radius_km: 70, preis_anzahlung_eur: 7500, label: 'Premium' },
}

export const ANZAHLUNG_PRO_FALL = 150

export function paketAnzahlung(paket: AnlegePaket, override?: number): number {
  if (paket === 'individuell') return override ?? 0
  return PAKET_KONFIG[paket].preis_anzahlung_eur
}

export function paketKontingent(paket: AnlegePaket, override?: number): number {
  if (paket === 'individuell') return override ?? 10
  return PAKET_KONFIG[paket].kontingent
}

export const QUALIFIKATIONEN = [
  'KFZ-Schäden',
  'Motorrad',
  'LKW/Nutzfahrzeuge',
  'Oldtimer',
  'Elektrofahrzeuge',
  'Totalschaden-Bewertung',
  'Unfallrekonstruktion',
]

// ARCH-1 POLISH: Anrede + Titel als Dropdowns (Aaron-Feedback). Reihenfolge
// in Step 1 Person: Anrede → Titel → Vorname → Nachname → ...
export const ANREDE_OPTIONEN = ['Herr', 'Frau', 'Divers', 'Keine Angabe'] as const

// Klassische deutsche Titel-Reihenfolge (Bachelor → Master → Diplom → Doktor → Professor).
// Erste Option ist Leer-String = 'kein Titel' (Default).
export const TITEL_OPTIONEN = [
  '',
  'B.Eng.',
  'B.Sc.',
  'Dipl.-Ing.',
  'Dipl.-Kfm.',
  'M.Eng.',
  'M.Sc.',
  'Dr.',
  'Dr.-Ing.',
  'Prof.',
  'Prof. Dr.',
] as const

export type GutachterTyp = 'kfz-gutachter' | 'dat-gutachter'

// ─── Form-Data Types fuer Server Actions ──────────────────────────────────

export type AnlegeSvFormData = {
  // Person
  vorname: string
  nachname: string
  email: string
  telefon: string
  anrede?: string
  titel?: string
  // Firma
  firmenname?: string
  rechtsform?: string
  anschrift: string
  anschrift_lat: number | null
  anschrift_lng: number | null
  anschrift_place_id?: string
  anschrift_plz: string
  steuernummer: string
  ust_id?: string
  hrb?: string
  // Typ
  gutachter_typ: GutachterTyp
  // Paket
  paket: AnlegePaket
  paket_override_kontingent?: number
  paket_override_radius_km?: number
  paket_override_anzahlung_eur?: number
  // Qualifikationen
  qualifikationen: string[]
}

export type AnlegeBueroFormData = {
  // Inhaber
  inhaber_anrede?: string
  inhaber_titel?: string
  inhaber_vorname: string
  inhaber_nachname: string
  inhaber_email: string
  inhaber_telefon: string
  // Buero-Stammdaten
  buero_name: string
  buero_rechtsform?: string
  buero_anschrift: string
  buero_steuernummer: string
  buero_ust_id?: string
  buero_hrb?: string
  // Sub-Standorte
  sub_standorte: Array<{
    name: string
    anschrift: string
    anschrift_lat: number | null
    anschrift_lng: number | null
    anschrift_place_id?: string
    anschrift_plz: string
    sub_anrede?: string
    sub_titel?: string
    sub_email: string
    sub_vorname: string
    sub_nachname: string
    paket: AnlegePaket
  }>
}
