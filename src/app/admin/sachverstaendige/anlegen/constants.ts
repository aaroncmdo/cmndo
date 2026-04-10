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

// KFZ-154: Qualifikationen / Spezifikationen / Schadenarten als 3 separate
// Felder. Aaron-Wording: Qualifikationen = was kann der SV fachlich,
// Spezifikationen = auf welche Fahrzeug-Arten ist er spezialisiert,
// Schadenarten = welche Arten von Schaeden bearbeitet er.
// Quelle der Wahrheit: sachverstaendige.qualifikationen_neu / spezifikationen /
// schadenarten (TEXT[]). Die alte qualifikationen-Spalte bleibt als Fallback.

export const QUALIFIKATIONEN = [
  'Haftpflichtschaden',
  'Bewertungen',
  'Wertgutachten',
  'Reparaturkostengutachten',
  'Beweissicherung',
  'Schiedsgutachten',
  'Gerichtsgutachten',
  'Oldtimer-Bewertung',
  'Leasingrücknahme',
  'Restwertermittlung',
  'Wiederbeschaffungswert',
] as const

export const SPEZIFIKATIONEN = [
  'PKW',
  'LKW',
  'Transporter',
  'Motorrad',
  'Wohnmobil',
  'Wohnwagen',
  'Anhänger',
  'Oldtimer',
  'Youngtimer',
  'E-Fahrzeuge',
  'Hybrid',
  'Sportwagen',
  'Nutzfahrzeuge',
  'Landmaschinen',
  'Baumaschinen',
  'Sonderfahrzeuge',
] as const

export const SCHADENARTEN = [
  'Karosserieschaden',
  'Lackschaden',
  'Hagelschaden',
  'Brandschaden',
  'Wasserschaden',
  'Elementarschaden',
  'Diebstahlschaden',
  'Vandalismusschaden',
  'Glasschaden',
  'Marderschaden',
  'Wildschaden',
  'Motorschaden',
  'Getriebeschaden',
  'Totalschaden',
  'Bagatellschaden',
] as const

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
  // KFZ-154: 3 separate Listen statt einer
  qualifikationen: string[]
  spezifikationen: string[]
  schadenarten: string[]
}

export type AnlegeBueroFormData = {
  // Inhaber
  inhaber_anrede?: string
  inhaber_titel?: string
  inhaber_vorname: string
  inhaber_nachname: string
  inhaber_email: string
  inhaber_telefon: string
  // BUG-93: Inhaber ist auch Mitarbeiter im Hauptbuero (Aaron-Option C).
  // Default true. Wenn true, wird standorte[0] (Hauptbuero) automatisch mit
  // Inhaber-Daten vorausgefuellt UND der Sub-SV-Datensatz reused den
  // Inhaber-profile_id (kein neuer auth.user), damit der Inhaber persoenlich
  // Faelle bekommen kann ohne dass eine zweite Email noetig ist.
  inhaber_ist_hauptbuero_mitarbeiter?: boolean
  // Buero-Stammdaten
  buero_name: string
  buero_rechtsform?: string
  // Buero-Anschrift mit Geo (Pflicht — wird auch fuer den Hauptbuero-Standort
  // verwendet wenn keine separate Standort-Anschrift gesetzt wird).
  buero_anschrift: string
  buero_anschrift_lat?: number | null
  buero_anschrift_lng?: number | null
  buero_anschrift_place_id?: string
  buero_anschrift_plz?: string
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
    // KFZ-154: pro Sub-SV eigene Spezialisierungen
    qualifikationen?: string[]
    spezifikationen?: string[]
    schadenarten?: string[]
  }>
}

// KFZ-152 Phase 2: Akademie-Anlege Form-Type
export type AnlegeAkademieFormData = {
  akademie_name: string
  rechtsform?: string
  anschrift: string
  anschrift_lat: number | null
  anschrift_lng: number | null
  anschrift_place_id?: string
  anschrift_plz: string
  steuernummer: string
  ust_id?: string
  radius_km: number
  max_faelle_monat: number
  erst_anzahlung_eur: number
  // Verwalter
  verwalter_anrede?: string
  verwalter_titel?: string
  verwalter_vorname: string
  verwalter_nachname: string
  verwalter_email: string
  verwalter_telefon?: string
  // Default-Spezialisierungen der Akademie
  qualifikationen: string[]
  spezifikationen: string[]
  schadenarten: string[]
  // Mitglieder (optional)
  sub_svs: Array<{
    anrede?: string
    titel?: string
    vorname: string
    nachname: string
    email: string
    telefon?: string
    paket: AnlegePaket
  }>
}

// KFZ-152 Phase 3: Community-Anlege Form-Type
export type AnlegeCommunityFormData = {
  name: string
  beschreibung?: string
  // Gemeinsames Einsatzgebiet — wahlweise Circle (Zentrum + Radius) oder Polygon.
  // Wenn `polygon` gesetzt ist, hat es Vorrang bei der Exklusivitaets-Geometrie.
  zentrum_anschrift: string
  zentrum_lat: number | null
  zentrum_lng: number | null
  zentrum_place_id?: string
  zentrum_plz: string
  radius_km: number
  // KFZ-152 Phase 3 Follow-up: optionales Polygon (Liste von {lat,lng})
  polygon?: { lat: number; lng: number }[] | null
  max_faelle_monat: number
  exklusiv: boolean
  // Initial-Mitglieder
  mitglieder: Array<{
    anrede?: string
    titel?: string
    vorname: string
    nachname: string
    email: string
    telefon?: string
    paket: AnlegePaket
  }>
}
