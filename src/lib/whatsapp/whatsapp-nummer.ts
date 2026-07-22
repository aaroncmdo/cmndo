// T2 (operativer-schaden-flow): Normalisierung der FM-WhatsApp-Nummer-Eingabe.
// Reuse von normalizeE164 (send-sms-plain) — nur die Eingabe-Validierung + das
// "leer => null"-Verhalten (Feld leeren erlaubt) kommt hier obendrauf.
import { normalizeE164 } from './send-sms-plain'

export type WhatsappNummerResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

// Formatierungszeichen, die normalizeE164 NICHT entfernt (es strippt nur Whitespace).
const FORMATTING = /[()/.\-]/g

/**
 * Normalisiert eine FM-WhatsApp-Nummer-Eingabe auf E.164.
 * - Leer/Whitespace -> { ok: true, value: null } (Feld leeren ist erlaubt).
 * - Gueltige Nummer -> { ok: true, value: '+49…' }.
 * - Zu kurz / enthaelt Buchstaben -> { ok: false, error }.
 */
export function normalizeWhatsappNummer(raw: string): WhatsappNummerResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const cleaned = trimmed.replace(FORMATTING, '')
  const digits = cleaned.replace(/\s/g, '')
  if (!/^\+?\d{6,}$/.test(digits)) {
    return { ok: false, error: 'Bitte eine gültige Telefonnummer eingeben.' }
  }
  return { ok: true, value: normalizeE164(cleaned) }
}
