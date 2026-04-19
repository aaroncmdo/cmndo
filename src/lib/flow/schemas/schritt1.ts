import { z } from 'zod'

// AAR-468 C2: Zod-Schema für Schritt 1 (Tippen-Modus). Enum-Werte werden
// als const-Arrays exportiert, damit der Client sie für Chip-Buttons und
// Radio-Listen wiederverwenden kann.

export const SCHADENTYP_VALUES = [
  'auffahrunfall',
  'parkschaden',
  'kreuzung',
  'sonstiges',
] as const

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
    vorname: z.string().trim().min(1, 'Vorname ist erforderlich').max(50),
    nachname: z.string().trim().min(1, 'Nachname ist erforderlich').max(50),
    email: z.email('Ungültige E-Mail-Adresse'),
    telefon: z
      .string()
      .trim()
      .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format'),
    dsgvo_consent: z.literal(true, { error: 'DSGVO-Einwilligung ist erforderlich' }),
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

export type Schritt1Input = z.infer<typeof schritt1Schema>
