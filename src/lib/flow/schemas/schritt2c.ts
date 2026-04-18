import { z } from 'zod'

// AAR-474 C8: Zod-Schema für Gegner-Daten-Form (Schritt 2c).
// Felder werden alle in `leads` gespeichert; conditional Validation je nach
// fahrerflucht/auslandskennzeichen.

const kennzeichenRe = /^[A-ZÄÖÜ]{1,3}[- ]?[A-Z]{1,2}[- ]?\d{1,4}[EH]?$/i
const telefonRe = /^\+?[0-9 /()-]{6,20}$/

export const zeugeSchema = z.object({
  name: z.string().min(2, 'Mindestens 2 Zeichen').max(100),
  telefon: z
    .string()
    .regex(telefonRe, 'Ungültige Telefonnummer')
    .optional()
    .or(z.literal('')),
})

export const schritt2cSchema = z
  .object({
    gegner_name: z.string().max(100).optional().or(z.literal('')),
    gegner_kennzeichen: z.string().max(20).optional().or(z.literal('')),
    gegner_versicherung_id: z.string().uuid().nullable().optional(),
    gegner_schadennummer: z.string().max(100).optional().or(z.literal('')),
    zeugen_kontakte: z.array(zeugeSchema).max(5),
    fahrerflucht: z.boolean(),
    auslandskennzeichen: z.boolean(),
  })
  .refine(
    (d) => {
      if (d.fahrerflucht) return true
      if (!d.gegner_kennzeichen) return false
      if (d.auslandskennzeichen) return true
      return kennzeichenRe.test(d.gegner_kennzeichen)
    },
    { message: 'Gültiges Kennzeichen erforderlich', path: ['gegner_kennzeichen'] },
  )
  .refine(
    (d) => {
      if (d.fahrerflucht) return true
      return !!d.gegner_name && d.gegner_name.trim().length > 0
    },
    { message: 'Name des Unfallgegners erforderlich', path: ['gegner_name'] },
  )

export type Schritt2cInput = z.infer<typeof schritt2cSchema>
