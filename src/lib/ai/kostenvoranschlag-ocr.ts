import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from './models'

export type KvaOcrResult = {
  kostenvoranschlag_netto: number | null
  kostenvoranschlag_brutto: number | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
  fin: string | null
  erstzulassung: string | null
  fahrzeug_baujahr: number | null
  halter_vorname: string | null
  halter_nachname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_ort: string | null
  telefon: string | null
}

const LEER: KvaOcrResult = {
  kostenvoranschlag_netto: null, kostenvoranschlag_brutto: null,
  fahrzeug_hersteller: null, fahrzeug_modell: null, kennzeichen: null, fin: null,
  erstzulassung: null, fahrzeug_baujahr: null, halter_vorname: null, halter_nachname: null,
  halter_strasse: null, halter_plz: null, halter_ort: null, telefon: null,
}

export const KVA_SYSTEM_PROMPT =
  'Du bist ein OCR-Assistent fuer deutsche Kfz-Kostenvoranschlaege (KVA) von Werkstaetten. ' +
  'Extrahiere die folgenden Felder und gib AUSSCHLIESSLICH ein JSON-Objekt zurueck (keine Erklaerung, ' +
  'kein Markdown). Wert nicht im Dokument -> null. Betraege: deutsche Schreibweise normalisieren ' +
  '("3.245,67 EUR" -> 3245.67). Der Kostenvoranschlag-Betrag ist die GESAMTE Reparatursumme der Werkstatt ' +
  '(NICHT einzelne Positionen). Datum als ISO YYYY-MM-DD.\n\n' +
  '{\n' +
  '  "kostenvoranschlag_netto": number|null,\n' +
  '  "kostenvoranschlag_brutto": number|null,\n' +
  '  "fahrzeug_hersteller": string|null,\n' +
  '  "fahrzeug_modell": string|null,\n' +
  '  "kennzeichen": string|null,\n' +
  '  "fin": string|null (17-stellig),\n' +
  '  "erstzulassung": "YYYY-MM-DD"|null,\n' +
  '  "fahrzeug_baujahr": number|null,\n' +
  '  "halter_vorname": string|null,\n' +
  '  "halter_nachname": string|null,\n' +
  '  "halter_strasse": string|null,\n' +
  '  "halter_plz": string|null,\n' +
  '  "halter_ort": string|null,\n' +
  '  "telefon": string|null\n' +
  '}\n\nAntworte NUR mit dem JSON-Objekt.'

function num(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** PURE: Claude-Textantwort -> KvaOcrResult. Toleriert umgebenden Prosa-Text. */
export function parseKvaOcrResponse(raw: string): KvaOcrResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { ...LEER }
  let p: Record<string, unknown>
  try { p = JSON.parse(match[0]) as Record<string, unknown> } catch { return { ...LEER } }
  return {
    kostenvoranschlag_netto: num(p.kostenvoranschlag_netto),
    kostenvoranschlag_brutto: num(p.kostenvoranschlag_brutto),
    fahrzeug_hersteller: str(p.fahrzeug_hersteller),
    fahrzeug_modell: str(p.fahrzeug_modell),
    kennzeichen: str(p.kennzeichen),
    fin: str(p.fin),
    erstzulassung: str(p.erstzulassung),
    fahrzeug_baujahr: num(p.fahrzeug_baujahr),
    halter_vorname: str(p.halter_vorname),
    halter_nachname: str(p.halter_nachname),
    halter_strasse: str(p.halter_strasse),
    halter_plz: str(p.halter_plz),
    halter_ort: str(p.halter_ort),
    telefon: str(p.telefon),
  }
}

/** Ruft Claude Vision auf den KVA (base64) und liefert das geparste Ergebnis. */
export async function extrahiereKvaAusBase64(
  input: { base64: string; mediaType: string },
): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY fehlt' }
  try {
    const client = new Anthropic({ apiKey })
    const isPdf = input.mediaType === 'application/pdf'
    const block = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: input.base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: input.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: input.base64 } }
    const resp = await client.messages.create({
      model: AI_MODELS.ocr,
      max_tokens: 1024,
      system: KVA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extrahiere die im System-Prompt definierten Felder aus diesem Kostenvoranschlag.' }] }],
    })
    const tb = resp.content.find((b) => b.type === 'text')
    const raw = tb?.type === 'text' ? tb.text : ''
    return { ok: true, data: parseKvaOcrResponse(raw) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
