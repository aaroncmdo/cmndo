// Claude-Vision Dokument-OCR (Opus 4.8, strukturierte Extraktion via Zod).
// Ersetzt Google Cloud Vision in api/ocr-trigger fuer die fall_dokumente-Typen.
// Muster analog lib/ocr-beleg/extract.ts (bereits Claude-Vision). Modell aus
// AI_MODELS.doc_ocr — Upgrade = Ein-Zeilen-Change in lib/ai/models.ts.
//
// Feldnamen bewusst wie die frueheren Regex-Parser (die Claude Vision jetzt
// ersetzt), damit die Downstream-Verarbeitung (extractedData.parsed.*) drop-in bleibt.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'

const MODEL = AI_MODELS.doc_ocr

const FahrzeugscheinSchema = z.object({
  fin: z.string().nullable().describe('17-stellige Fahrzeug-Identifikationsnummer (Feld E)'),
  kennzeichen: z.string().nullable().describe('Amtliches Kennzeichen, z.B. "K-AB 1234"'),
  halter: z.string().nullable().describe('Halter-Name (Feld C.1.1 + C.1.2)'),
  erstzulassung: z.string().nullable().describe('Erstzulassung als ISO YYYY-MM-DD (Feld B)'),
  hersteller: z.string().nullable().describe('Hersteller/Marke (Feld D.1)'),
  modell: z.string().nullable().describe('Handelsbezeichnung/Modell (Feld D.2/D.3)'),
  // Spec B (Aaron 14.07.): das Werkstatt-Matching braucht Fahrzeugklasse + Marke. Die Klasse steht in
  // JEDEM Schein (Feld J) — bisher fragte das Schema sie schlicht nicht ab. Kein KI-Zusatzaufwand:
  // dasselbe Vision-Call, drei Felder mehr.
  fahrzeugklasse: z
    .string()
    .nullable()
    .describe(
      'EU-/KBA-Fahrzeugklasse (Feld J), exakt wie im Schein: M1 (PKW), N1 (Transporter), N2/N3 (LKW), ' +
        'M2/M3 (Bus), L1e-L7e (Krafträder/Quads), O1-O4 (Anhänger), T/C/R/S (Land-/Forstwirtschaft)',
    ),
  hsn: z.string().nullable().describe('Herstellerschlüsselnummer, 4 Ziffern (Feld 2.1)'),
  tsn: z.string().nullable().describe('Typschlüsselnummer, 3 Zeichen (Feld 2.2)'),
})

const VersicherungsscheinSchema = z.object({
  versicherer: z.string().nullable().describe('Name der Versicherung'),
  vsnummer: z.string().nullable().describe('Versicherungsschein-/Policennummer'),
  versicherter: z.string().nullable().describe('Versicherungsnehmer (Name)'),
  vertragsbeginn: z.string().nullable().describe('ISO YYYY-MM-DD'),
})

// Personalausweis + Fuehrerschein teilen sich die Personen-Felder.
const PersonSchema = z.object({
  vorname: z.string().nullable(),
  nachname: z.string().nullable(),
  geburtsdatum: z.string().nullable().describe('Geburtsdatum als ISO YYYY-MM-DD'),
  klasse: z.string().nullable().describe('Fuehrerschein-Klassen (z.B. "B, BE"); bei Personalausweis null'),
})

const UnfallberichtSchema = z.object({
  datum: z.string().nullable().describe('Unfalldatum als ISO YYYY-MM-DD'),
  ort: z.string().nullable().describe('Unfallort'),
  beteiligte: z.string().nullable().describe('Kurzbeschreibung der Beteiligten'),
})

const SCHEMAS = {
  fahrzeugschein: { schema: FahrzeugscheinSchema, label: 'deutschen Fahrzeugschein (Zulassungsbescheinigung Teil I)' },
  versicherungsschein_eigener: { schema: VersicherungsscheinSchema, label: 'Kfz-Versicherungsschein' },
  personalausweis: { schema: PersonSchema, label: 'deutschen Personalausweis' },
  fuehrerschein: { schema: PersonSchema, label: 'EU-Fuehrerschein' },
  unfallbericht_polizei: { schema: UnfallberichtSchema, label: 'polizeilichen Unfallbericht' },
} as const

export type DokumentOcrTyp = keyof typeof SCHEMAS
export function isOcrSupported(typ: string): typ is DokumentOcrTyp {
  return Object.prototype.hasOwnProperty.call(SCHEMAS, typ)
}

export type DokumentOcrResult = {
  success: boolean
  typ: string
  parsed: Record<string, string | null> | null
  fields_found: number
  error?: string
}

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

// Bild -> image-Block, PDF -> document-Block (beide Base64).
function buildDocBlock(base64: string, mimeType: string): Anthropic.Messages.ContentBlockParam {
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  }
  const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
  const media = (supported as readonly string[]).includes(mimeType)
    ? (mimeType as (typeof supported)[number])
    : 'image/jpeg'
  return { type: 'image', source: { type: 'base64', media_type: media, data: base64 } }
}

/**
 * Extrahiert die typ-spezifischen Felder aus einem Dokument-Bild/-PDF via
 * Claude Vision mit erzwungenem Schema (structured outputs). Rueckgabe-Shape
 * ist drop-in-kompatibel zu den alten Regex-Parsern.
 */
export async function extractDokument(
  typ: string,
  base64: string,
  mimeType: string,
): Promise<DokumentOcrResult> {
  const client = getClient()
  if (!client) return { success: false, typ, parsed: null, fields_found: 0, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  if (!isOcrSupported(typ)) return { success: false, typ, parsed: null, fields_found: 0, error: `Kein OCR-Schema fuer Typ "${typ}"` }

  const { schema, label } = SCHEMAS[typ]
  try {
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system:
        `Sie sind ein praeziser OCR-Extraktor fuer einen ${label}. Extrahiere die angeforderten ` +
        `Felder aus dem angehaengten Bild/PDF. Wert nicht sicher erkennbar -> null (nicht raten). ` +
        `Datumswerte als ISO YYYY-MM-DD. Strings ohne Label-Praefix, nur den eigentlichen Inhalt.`,
      messages: [
        {
          role: 'user',
          content: [buildDocBlock(base64, mimeType), { type: 'text', text: 'Extrahiere die Felder aus diesem Dokument.' }],
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    })

    const parsed = (msg.parsed_output ?? null) as Record<string, string | null> | null
    if (!parsed) return { success: false, typ, parsed: null, fields_found: 0, error: 'Keine strukturierte Antwort erhalten' }
    const fields_found = Object.values(parsed).filter((v) => v != null && v !== '').length
    return { success: true, typ, parsed, fields_found }
  } catch (err) {
    return { success: false, typ, parsed: null, fields_found: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
