// AAR-1480 (Lead-Audit P1-2): Zentrales Zod-Schema fuer createManualLead.
// Vorher: nur Inline-Role-Check, kein Typ-Guard am Eingang.
//
// Konvention: Quick-Create erlaubt leere Strings fuer Stub-Leads — daher
// keine .min(1) auf Kontaktfeldern. Schema enforced nur DATEN-FORM (Typen
// + Max-Length), nicht Business-Pflichtfelder.

import { z } from 'zod'

export const LACKFARBE_CODES = [
  'schwarz',
  'weiss',
  'silber',
  'grau',
  'blau',
  'rot',
  'gruen',
  'gelb',
  'orange',
  'braun',
  'beige',
  'sonstige',
] as const

export const ManualLeadSchema = z.object({
  anrede: z.enum(['herr', 'frau', 'divers']).nullable().optional(),
  vorname: z.string().max(100),
  nachname: z.string().max(100),
  telefon: z.string().max(50),
  email: z.string().max(200),
  fahrzeug_hersteller: z.string().max(100).nullable().optional(),
  fahrzeug_modell: z.string().max(100).nullable().optional(),
  lackfarbe_code: z.enum(LACKFARBE_CODES).nullable().optional(),
  fahrzeug_farbe: z.string().max(100).nullable().optional(),
  kennzeichen: z.string().max(20).nullable().optional(),
  kunde_adresse: z.string().max(500),
  kunde_strasse: z.string().max(200),
  kunde_plz: z.string().max(20),
  kunde_stadt: z.string().max(100),
  kunde_lat: z.number().nullable(),
  kunde_lng: z.number().nullable(),
  source_channel: z.string().min(1).max(100),
  notizen: z.string().max(2000),
})

export type ManualLeadInput = z.infer<typeof ManualLeadSchema>
