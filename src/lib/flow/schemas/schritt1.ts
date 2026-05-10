import { z } from 'zod'

// AAR-468 C2: Zod-Schema für Schritt 1 (Tippen-Modus). Enum-Werte werden
// als const-Arrays exportiert, damit der Client sie für Chip-Buttons und
// Radio-Listen wiederverwenden kann.
// Erweiterung: Konditionelle Pflichtfelder die den gesamten Flow-Pfad
// bestimmen (ist_fahrzeughalter, fahrzeug_fahrbereit, hat_vorschaeden etc.).

export const SCHADENTYP_VALUES = [
  'auffahrunfall',
  'parkschaden',
  'kreuzung',
  'sonstiges',
] as const

export const FINANZIERUNG_VALUES = ['keine', 'leasing', 'finanzierung'] as const
export type FinanzierungTyp = (typeof FINANZIERUNG_VALUES)[number]

export const SCHULDFRAGE_VALUES = ['gegner', 'unklar', 'eigenverantwortung'] as const

// Die 25 meistverkauften Fabrikate in DE (grob nach KBA-Zulassungen).
// Wird bewusst fest verdrahtet — spart einen DB-Join und ändert sich
// nur selten. Bei Bedarf später in Tabelle ziehen.
export const FAHRZEUG_HERSTELLER_VALUES = [
  'Volkswagen',
  'Mercedes-Benz',
  'BMW',
  'Audi',
  'Opel',
  'Ford',
  'Škoda',
  'SEAT',
  'Renault',
  'Peugeot',
  'Citroën',
  'Toyota',
  'Hyundai',
  'Kia',
  'Nissan',
  'Mazda',
  'Fiat',
  'Dacia',
  'Volvo',
  'Mini',
  'Porsche',
  'Tesla',
  'Honda',
  'Suzuki',
  'Sonstiger',
] as const

export type Schadentyp = (typeof SCHADENTYP_VALUES)[number]
export type Schuldfrage = (typeof SCHULDFRAGE_VALUES)[number]
export type FahrzeugHersteller = (typeof FAHRZEUG_HERSTELLER_VALUES)[number]

const CURRENT_YEAR = new Date().getFullYear()

export const schritt1Schema = z
  .object({
    unfalldatum: z
      .string()
      .min(1, 'Unfalldatum ist erforderlich')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Ungültiges Datum'),
    unfallort: z.string().trim().min(3, 'Unfallort ist zu kurz').max(200),
    schadentyp: z.enum(SCHADENTYP_VALUES),
    schadens_hergang: z
      .string()
      .trim()
      .min(10, 'Bitte beschreibe den Hergang (mindestens 10 Zeichen)')
      .max(2000, 'Maximal 2000 Zeichen'),
    polizei_vor_ort: z.boolean(),
    polizei_aktenzeichen: z.string().trim().max(50).optional().or(z.literal('')),
    schuldfrage: z.enum(SCHULDFRAGE_VALUES),
    fahrzeug_hersteller: z.enum(FAHRZEUG_HERSTELLER_VALUES),
    fahrzeug_modell: z.string().trim().min(1, 'Modell ist erforderlich').max(50),
    fahrzeug_baujahr: z
      .number({ error: 'Baujahr ist erforderlich' })
      .int()
      .min(1970, 'Baujahr ab 1970')
      .max(CURRENT_YEAR, `Baujahr höchstens ${CURRENT_YEAR}`),
    fahrzeug_standort_plz: z.string().regex(/^[0-9]{5}$/, 'PLZ muss 5 Ziffern sein'),
    // AAR-663: Google-Places-Ergebnis optional mitspeichern. Wenn der Kunde das
    // Autocomplete-Feld nutzt, landet hier Adresse + Koordinaten + place_id.
    // Koordinaten sind der Schlüssel für Self-Service-Dispatch (findBestSV),
    // Fallback auf nur-PLZ bleibt möglich wenn Google JS mal nicht lädt.
    fahrzeug_standort_adresse: z.string().trim().max(200).optional().or(z.literal('')),
    fahrzeug_standort_lat: z.number().min(-90).max(90).optional().nullable(),
    fahrzeug_standort_lng: z.number().min(-180).max(180).optional().nullable(),
    fahrzeug_standort_place_id: z.string().trim().max(200).optional().or(z.literal('')),
    vorname: z.string().trim().min(1, 'Vorname ist erforderlich').max(50),
    nachname: z.string().trim().min(1, 'Nachname ist erforderlich').max(50),
    email: z.email('Ungültige E-Mail-Adresse'),
    telefon: z
      .string()
      .trim()
      .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format'),
    dsgvo_consent: z.literal(true, { error: 'DSGVO-Einwilligung ist erforderlich' }),
    // ——— Konditionelle Pflichtfelder: bestimmen den weiteren Flow-Pfad ———
    ist_fahrzeughalter: z.boolean(),
    fahrzeug_fahrbereit: z.boolean(),
    personenschaden_flag: z.boolean(),
    hat_vorschaeden: z.boolean(),
    vorschaeden_beschreibung: z.string().trim().max(1000).optional().or(z.literal('')),
    mietwagen_flag: z.boolean().optional(),
    nutzungsausfall: z.boolean().optional(),
    finanzierung_leasing: z.enum(FINANZIERUNG_VALUES).optional(),
  })
  .refine(
    (data) =>
      !data.polizei_vor_ort ||
      (data.polizei_aktenzeichen && data.polizei_aktenzeichen.length > 0),
    {
      message: 'Aktenzeichen bitte angeben wenn Polizei vor Ort war',
      path: ['polizei_aktenzeichen'],
    },
  )
  .refine(
    (data) => !data.hat_vorschaeden || (data.vorschaeden_beschreibung?.trim().length ?? 0) >= 10,
    {
      message: 'Bitte Vorschäden kurz beschreiben (mindestens 10 Zeichen)',
      path: ['vorschaeden_beschreibung'],
    },
  )

export type Schritt1Input = z.infer<typeof schritt1Schema>
